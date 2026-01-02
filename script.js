// =====================
// GLOBAL ELEMENTS
// =====================
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const tracks = document.querySelectorAll(".track");

const masterSlider = document.getElementById("masterGain");
const playAllBtn = document.getElementById("playAll");
const stopAllBtn = document.getElementById("stopAll");

// =====================
// AUDIO STATE
// =====================
let audioContext = null;
let masterGain = null;
let previewGain = null;
let selectedLibraryItem = null;

const trackBuffers = [null, null, null];
const trackSources = [null, null, null];
const trackGains = [null, null, null];
const trackFaders = [1, 1, 1];
const trackMuted = [false, false, false];
const trackSolo = [false, false, false];

// =====================
// AUDIO INIT
// =====================
function initAudio() {
  if (audioContext) return;

  audioContext = new AudioContext();

  masterGain = audioContext.createGain();
  masterGain.gain.value = masterSlider.value;
  masterGain.connect(audioContext.destination);

  previewGain = audioContext.createGain();
  previewGain.connect(masterGain);
}

// =====================
// MASTER
// =====================
masterSlider.oninput = () => {
  if (masterGain) masterGain.gain.value = masterSlider.value;
};

// =====================
// FILE UPLOAD / LIBRARY
// =====================
fileInput.onchange = async () => {
  initAudio();

  for (const file of fileInput.files) {
    const buffer = await audioContext.decodeAudioData(
      await file.arrayBuffer()
    );

    const li = document.createElement("li");
    li.textContent = file.name;
    li.style.cursor = "pointer";

    li.onclick = () => {
      document.querySelectorAll("#fileList li")
        .forEach(el => el.classList.remove("selected"));

      li.classList.add("selected");
      selectedLibraryItem = { name: file.name, buffer };
    };

    fileList.appendChild(li);
  }

  fileInput.value = "";
};

// =====================
// GAIN LOGIC
// =====================
function updateTrackGain(i) {
  const anySolo = trackSolo.some(v => v);
  let gain = trackFaders[i];

  if (trackMuted[i]) gain = 0;
  if (anySolo && !trackSolo[i]) gain = 0;

  trackGains[i].gain.value = gain;
}

// =====================
// TRACK SETUP
// =====================
tracks.forEach((track, i) => {
  const label = track.querySelector(".track-label");
  const playBtn = track.querySelector(".track-play");
  const stopBtn = track.querySelector(".track-stop");
  const gainSlider = track.querySelector(".track-gain");
  const muteBtn = track.querySelector(".track-mute");
  const soloBtn = track.querySelector(".track-solo");
  const offsetInput = track.querySelector(".track-offset");

  const timeline = track.querySelector(".timeline");
  const clip = track.querySelector(".clip");

  initAudio();

  trackGains[i] = audioContext.createGain();
  trackGains[i].connect(masterGain);

  // ---------------------
  // ASSIGN FROM LIBRARY
  // ---------------------
  track.addEventListener("click", (e) => {
    if (!selectedLibraryItem) return;
    if (e.target.closest("button") || e.target.closest("input")) return;

    trackBuffers[i] = selectedLibraryItem.buffer;
    label.textContent = `Track ${i + 1}: ${selectedLibraryItem.name}`;
    track.classList.add("filled");
  });

  // ---------------------
  // GAIN / MUTE / SOLO
  // ---------------------
  gainSlider.oninput = () => {
    trackFaders[i] = Number(gainSlider.value);
    updateTrackGain(i);
  };

  muteBtn.onclick = () => {
    trackMuted[i] = !trackMuted[i];
    muteBtn.classList.toggle("active", trackMuted[i]);
    muteBtn.textContent = trackMuted[i] ? "Muted" : "Mute";
    for (let t = 0; t < 3; t++) updateTrackGain(t);
  };

  soloBtn.onclick = () => {
    trackSolo[i] = !trackSolo[i];
    soloBtn.classList.toggle("active", trackSolo[i]);
    soloBtn.textContent = trackSolo[i] ? "Soloed" : "Solo";
    for (let t = 0; t < 3; t++) updateTrackGain(t);
  };

  // ---------------------
  // PLAY / STOP (PER TRACK)
  // ---------------------
  playBtn.onclick = async () => {
    if (!trackBuffers[i]) return;
    if (audioContext.state !== "running") await audioContext.resume();

    trackSources[i]?.stop();

    const offset = Number(offsetInput.value) || 0;

    const src = audioContext.createBufferSource();
    src.buffer = trackBuffers[i];
    src.connect(trackGains[i]);
    src.start(audioContext.currentTime, offset);

    trackSources[i] = src;
  };

  stopBtn.onclick = () => trackSources[i]?.stop();

  // =====================
  // DRAG CLIP (WORKING)
  // =====================
  let dragging = false;
  let startX = 0;
  let startLeft = 0;

  clip.addEventListener("mousedown", (e) => {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startLeft = clip.offsetLeft;
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;

    const dx = e.clientX - startX;
    let newLeft = startLeft + dx;

    newLeft = Math.max(0, newLeft);
    newLeft = Math.min(
      newLeft,
      timeline.clientWidth - clip.clientWidth
    );

    clip.style.left = newLeft + "px";

    // 100px = 1 second
    offsetInput.value = (newLeft / 100).toFixed(2);
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });
});

// =====================
// TRANSPORT (MASTER)
// =====================
function playAll() {
  initAudio();
  if (audioContext.state !== "running") audioContext.resume();

  const baseTime = audioContext.currentTime + 0.05;

  tracks.forEach((track, i) => {
    if (!trackBuffers[i]) return;

    trackSources[i]?.stop();

    const offset =
      Number(track.querySelector(".track-offset").value) || 0;

    const src = audioContext.createBufferSource();
    src.buffer = trackBuffers[i];
    src.connect(trackGains[i]);
    src.start(baseTime, offset);

    trackSources[i] = src;
  });
}

function stopAll() {
  trackSources.forEach(s => s?.stop());
}

playAllBtn.onclick = playAll;
stopAllBtn.onclick = stopAll;
