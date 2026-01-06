import audioBufferToWav from "https://cdn.skypack.dev/audiobuffer-to-wav";
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
// DITHER (TPDF – 16 bit only)
// =====================
function applyTPDFDither16(buffer) {
  const dithered = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate
  });

  const lsb = 1 / 65536;

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const input = buffer.getChannelData(ch);
    const output = dithered.getChannelData(ch);

    for (let i = 0; i < input.length; i++) {
      const tpdf = (Math.random() - Math.random()) * lsb;
      output[i] = Math.max(-1, Math.min(1, input[i] + tpdf));
    }
  }

  return dithered;
}

// =====================
// 24-BIT PCM WAV ENCODER (NO DITHER)
// =====================
function encodeWav24(buffer) {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const frames = buffer.length;
  const bytesPerSample = 3;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const bufferSize = 44 + dataSize;

  const view = new DataView(new ArrayBuffer(bufferSize));
  let offset = 0;

  const writeString = s => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset++, s.charCodeAt(i));
    }
  };

  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true); offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2; // PCM
  view.setUint16(offset, channels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, 24, true); offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true); offset += 4;

  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < channels; ch++) {
      let sample = buffer.getChannelData(ch)[i];
      sample = Math.max(-1, Math.min(1, sample));
      let intSample = Math.floor(sample * 0x7fffff);

      view.setUint8(offset++, intSample & 0xff);
      view.setUint8(offset++, (intSample >> 8) & 0xff);
      view.setUint8(offset++, (intSample >> 16) & 0xff);
    }
  }

  return view.buffer;
}

// =====================
// EXPORT (16-bit dither OR 24-bit clean)
// =====================
const exportBtn = document.getElementById("exportBtn");

exportBtn.onclick = () => {
  const buffer = waveSurfer.getDecodedData();
  if (!buffer) return;

  const use24Bit = true; // ← toggle later with UI

  let wavBuffer;
  let filename;

  if (use24Bit) {
    wavBuffer = encodeWav24(buffer);
    filename = "export_24bit.wav";
  } else {
    const dithered = applyTPDFDither16(buffer);
    wavBuffer = audioBufferToWav(dithered);
    filename = "export_16bit_dither.wav";
  }

  const blob = new Blob([wavBuffer], { type: "audio/wav" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
};
