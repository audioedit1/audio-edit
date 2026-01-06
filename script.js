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
// EXPORT (Jam3 audiobuffer-to-wav)
// =====================
document.getElementById("exportBtn").onclick = () => {
  const buffer = waveSurfer.getDecodedData();
  if (!buffer) return;

  const wavArrayBuffer = window.audioBufferToWav.default(buffer);

  const blob = new Blob([wavArrayBuffer], { type: "audio/wav" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "export.wav";
  a.click();
};

