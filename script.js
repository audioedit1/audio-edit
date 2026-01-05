// =====================
// WAVESURFER INIT
// =====================
const waveSurfer = WaveSurfer.create({
  container: "#waveform",
  waveColor: "#4aa3ff",
  progressColor: "#1e6fd9",
  cursorColor: "#ffffff",
  height: 100,
  responsive: true
});

// =====================
// FILE LOAD
// =====================
const fileInput = document.getElementById("fileInput");

fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  waveSurfer.load(url);
});

// =====================
// TRANSPORT
// =====================
document.getElementById("play").onclick = () => {
  waveSurfer.playPause();
};

document.getElementById("stop").onclick = () => {
  waveSurfer.stop();
};

// =====================
// DEBUG (IMPORTANT)
// =====================
waveSurfer.on("ready", () => {
  console.log("Audio loaded");
});

waveSurfer.on("seek", progress => {
  console.log("Seek:", progress);
});
