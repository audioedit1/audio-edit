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
  height: 120,
  waveColor: "#4aa3ff",
  progressColor: "#1e6fd9",
  cursorColor: "#ffffff",
  normalize: true,
  minPxPerSec: 100,
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

volumeSlider.oninput = e => {
  waveSurfer.setVolume(Number(e.target.value));
};

let muted = false;
muteBtn.onclick = () => {
  muted = !muted;
  waveSurfer.setMute(muted);
  muteBtn.textContent = muted ? "Unmute" : "Mute";
};

// =====================
// ZOOM
// =====================
const zoomSlider = document.getElementById("zoom");
zoomSlider.oninput = e => {
  waveSurfer.zoom(Number(e.target.value));
};

// =====================
// REGIONS (SELECTION / CLIPS)
// =====================
waveSurfer.on("ready", () => {
  regions.enableDragSelection({
    color: "rgba(74,163,255,0.3)"
  });
});

regions.on("region-created", region => {
  region.loop = true;
});

regions.on("region-in", region => {
  console.log("Region in:", region.id);
});

regions.on("region-out", region => {
  if (region.loop) region.play();
});

// =====================
// DEBUG / TIME AWARENESS
// =====================
waveSurfer.on("audioprocess", time => {
  // future global transport sync
  // console.log("Time:", time);
});
