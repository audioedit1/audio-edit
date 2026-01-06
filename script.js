import WaveSurfer from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js";
import RegionsPlugin from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/regions.esm.js";
import TimelinePlugin from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/timeline.esm.js";

// =====================
// WAVESURFER INIT
// =====================
const regions = RegionsPlugin.create();
const timeline = TimelinePlugin.create({
  container: "#timeline",
  timeInterval: 1,
  primaryLabelInterval: 5,
  secondaryLabelInterval: 1
});

const waveSurfer = WaveSurfer.create({
  container: "#waveform",
  height: 140,
  waveColor: "#4aa3ff",
  progressColor: "#1e6fd9",
  cursorColor: "#ffffff",
  normalize: false,
  fillParent: true,
  minPxPerSec: 5,
  barWidth: 1,
  barGap: 0,
  barRadius: 0,
  autoScroll: true,
  interact: true,
  plugins: [regions, timeline]
});

// =====================
// FILE LOAD
// =====================
const fileInput = document.getElementById("fileInput");

fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  if (waveSurfer._objectUrl) {
    URL.revokeObjectURL(waveSurfer._objectUrl);
  }

  const url = URL.createObjectURL(file);
  waveSurfer._objectUrl = url;
  waveSurfer.load(url);
});

// =====================
// TRANSPORT
// =====================
document.getElementById("play").onclick = () => waveSurfer.playPause();
document.getElementById("stop").onclick = () => waveSurfer.stop();

// =====================
// VOLUME / MUTE (PREVIEW LEVEL)
// =====================
const volumeSlider = document.getElementById("volume");
const muteBtn = document.getElementById("mute");

let lastVolume = Number(volumeSlider.value);
let muted = false;

volumeSlider.oninput = e => {
  const value = Number(e.target.value);
  lastVolume = value;
  if (!muted) waveSurfer.setVolume(value);
};

muteBtn.onclick = () => {
  muted = !muted;
  waveSurfer.setVolume(muted ? 0 : lastVolume);
  muteBtn.textContent = muted ? "Unmute" : "Mute";
};

// =====================
// ZOOM
// =====================
const zoomSlider = document.getElementById("zoom");

zoomSlider.oninput = e => {
  const minZoom = 5;
  const maxZoom = 50000;
  const zoom =
    minZoom *
    Math.pow(maxZoom / minZoom, Number(e.target.value) / 100);
  waveSurfer.zoom(zoom);
};

// =====================
// REGIONS
// =====================
function clearRegionsExcept(keepRegion) {
  Object.values(regions.getRegions()).forEach(r => {
    if (r !== keepRegion) r.remove();
  });
}

waveSurfer.on("ready", () => {
  regions.enableDragSelection({
    color: "rgba(74,163,255,0.3)"
  });
});

regions.on("region-created", region => {
  clearRegionsExcept(region);
  region.loop = true;
});

regions.on("region-out", region => {
  if (region.loop) region.play();
});

waveSurfer.on("click", () => {
  Object.values(regions.getRegions()).forEach(r => r.remove());
});

// =====================
// EXPORT CORE
// =====================
document.getElementById("exportBtn").onclick = async () => {
  const bitDepth = Number(document.getElementById("bitDepth").value);
  const useDither = document.getElementById("dither").checked;

  const buffer = waveSurfer.getDecodedData();
  if (!buffer) return;

  let start = 0;
  let end = buffer.length;

  const region = Object.values(regions.getRegions())[0];
  if (region) {
    start = Math.floor(region.start * buffer.sampleRate);
    end = Math.floor(region.end * buffer.sampleRate);
  }

  const wav = encodeWAV(buffer, start, end, bitDepth, useDither);
  const blob = new Blob([wav], { type: "audio/wav" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `export_${bitDepth}bit.wav`;
  a.click();
};

// =====================
// WAV ENCODER + DITHER
// =====================
function encodeWAV(buffer, start, end, bitDepth, dither) {
  const channels = buffer.numberOfChannels;
  const length = end - start;
  const bytesPerSample = bitDepth === 32 ? 4 : bitDepth === 24 ? 3 : 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = buffer.sampleRate * blockAlign;

  const dataSize = length * blockAlign;
  const bufferSize = 44 + dataSize;
  const view = new DataView(new ArrayBuffer(bufferSize));

  let offset = 0;
  const writeString = s => { for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i)); };

  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true); offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, bitDepth === 32 ? 3 : 1, true); offset += 2;
  view.setUint16(offset, channels, true); offset += 2;
  view.setUint32(offset, buffer.sampleRate, true); offset += 4;
  view.setUint32(offset, byteRate, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, bitDepth, true); offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true); offset += 4;

  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < channels; ch++) {
      let sample = buffer.getChannelData(ch)[start + i];
      if (bitDepth !== 32 && dither) {
        sample += (Math.random() - Math.random()) / (1 << bitDepth);
      }
      sample = Math.max(-1, Math.min(1, sample));

      if (bitDepth === 16) {
        view.setInt16(offset, sample * 0x7fff, true);
        offset += 2;
      } else if (bitDepth === 24) {
        let v = sample * 0x7fffff;
        view.setUint8(offset++, v & 255);
        view.setUint8(offset++, (v >> 8) & 255);
        view.setUint8(offset++, (v >> 16) & 255);
      } else {
        view.setFloat32(offset, sample, true);
        offset += 4;
      }
    }
  }

  return view.buffer;
}
