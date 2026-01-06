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

  // maximum visual fidelity
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

  if (!muted) {
    waveSurfer.setVolume(value);
  }
};

muteBtn.onclick = () => {
  muted = !muted;

  if (muted) {
    waveSurfer.setVolume(0);
    muteBtn.textContent = "Unmute";
  } else {
    waveSurfer.setVolume(lastVolume);
    muteBtn.textContent = "Mute";
  }
};
// =====================
// ZOOM
// =====================
const zoomSlider = document.getElementById("zoom");

zoomSlider.oninput = e => {
  const sliderValue = Number(e.target.value);

  // push WaveSurfer to its ceiling
  const minZoom = 5;        // overview
  const maxZoom = 50000;    // extreme detail illusion

  const zoom =
    minZoom *
    Math.pow(maxZoom / minZoom, sliderValue / 100);

  waveSurfer.zoom(zoom);
};

// =====================
// REGIONS (SELECTION / CLIPS)
// =====================

// helper: remove all regions except one
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

// keep only the newest region
regions.on("region-created", region => {
  clearRegionsExcept(region);
  region.loop = true;
});

// loop playback
regions.on("region-out", region => {
  if (region.loop) region.play();
});

// =====================
// CLEAR REGION ON EMPTY WAVEFORM CLICK
// =====================
waveSurfer.on("click", () => {
  Object.values(regions.getRegions()).forEach(r => r.remove());
});

// =====================
// CLEAR REGION ON EMPTY WAVEFORM CLICK
// =====================
waveSurfer.on("click", () => {
  Object.values(regions.getRegions()).forEach(r => r.remove());
});

// =====================
// EXPORT CORE (44.1k / 16–24 bit)
// =====================
document.getElementById("exportBtn").onclick = async () => {
  const bitDepth = Number(document.getElementById("exportBitDepth").value);
  const decoded = waveSurfer.getDecodedData();
  if (!decoded) return;

  const wavBuffer = await encodePCM44k(decoded, bitDepth);
  const blob = new Blob([wavBuffer], { type: "audio/wav" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `export_44k_${bitDepth}bit.wav`;
  a.click();
};


// =====================
// WAV ENCODER (PCM + DITHER)
// =====================
function encodePCM44k(audioBuffer, bitDepth) {
  const sampleRate = 44100;
  const channels = audioBuffer.numberOfChannels;
  const length = Math.floor(audioBuffer.duration * sampleRate);

  // offline resample
  const offline = new OfflineAudioContext(
    channels,
    length,
    sampleRate
  );

  const source = offline.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offline.destination);
  source.start();

  return offline.startRendering().then(resampled => {
    const bytesPerSample = bitDepth === 24 ? 3 : 2;
    const blockAlign = channels * bytesPerSample;
    const dataSize = resampled.length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    let offset = 0;
    const writeStr = s => { for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i)); };

    writeStr("RIFF");
    view.setUint32(offset, 36 + dataSize, true); offset += 4;
    writeStr("WAVE");
    writeStr("fmt ");
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2; // PCM
    view.setUint16(offset, channels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * blockAlign, true); offset += 4;
    view.setUint16(offset, blockAlign, true); offset += 2;
    view.setUint16(offset, bitDepth, true); offset += 2;
    writeStr("data");
    view.setUint32(offset, dataSize, true); offset += 4;

    for (let i = 0; i < resampled.length; i++) {
      for (let ch = 0; ch < channels; ch++) {
        let s = resampled.getChannelData(ch)[i];

        // TPDF dither
        const dither = (Math.random() - Math.random()) / (1 << bitDepth);
        s = Math.max(-1, Math.min(1, s + dither));

        if (bitDepth === 16) {
          view.setInt16(offset, s * 0x7fff, true);
          offset += 2;
        } else {
          let v = s * 0x7fffff;
          view.setUint8(offset++, v & 255);
          view.setUint8(offset++, (v >> 8) & 255);
          view.setUint8(offset++, (v >> 16) & 255);
        }
      }
    }

    return buffer;
  });
}
