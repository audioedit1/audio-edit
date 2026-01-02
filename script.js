// =====================
// GLOBAL ELEMENTS
// =====================
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const tracks = document.querySelectorAll(".track");

const masterSlider = document.getElementById("masterGain");
const playAllBtn = document.getElementById("playAll");
const stopAllBtn = document.getElementById("stopAll");

const loopStartInput = document.getElementById("loopStart");
const loopEndInput = document.getElementById("loopEnd");
const loopEnabledCheckbox = document.getElementById("loopEnabled");

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
// LOOP
// =====================
let loopEnabled = false;
let loopStart = 0;
let loopEnd = 4;
let draggingLoop = null;

// =====================
// PLAYHEAD
// =====================
let playheadRAF = null;
let playheadStartTime = 0;

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
// LOOP VISUAL
// =====================
function updateLoopOverlay() {
  document.querySelectorAll(".timeline").forEach(tl => {
    const region = tl.querySelector(".loop-region");
    const startH = tl.querySelector(".loop-start");
    const endH = tl.querySelector(".loop-end");

    if (!loopEnabled || loopEnd <= loopStart) {
      region.style.display = "none";
      startH.style.display = "none";
      endH.style.display = "none";
      return;
    }

    const left = loopStart * 100;
    const width = (loopEnd - loopStart) * 100;

    region.style.display = "block";
    region.style.left = left + "px";
    region.style.width = width + "px";

    startH.style.display = "block";
    endH.style.display = "block";
    startH.style.left = left + "px";
    endH.style.left = (left + width) + "px";
  });
}

// =====================
// LOOP INPUTS
// =====================
loopStartInput.oninput = () => {
  loopStart = Math.max(0, Number(loopStartInput.value));
  updateLoopOverlay();
};

loopEndInput.oninput = () => {
  loopEnd = Math.max(loopStart, Number(loopEndInput.value));
  updateLoopOverlay();
};

loopEnabledCheckbox.onchange = () => {
  loopEnabled = loopEnabledCheckbox.checked;
  updateLoopOverlay();
};

// =====================
// FILE UPLOAD
// =====================
fileInput.onchange = async () => {
  initAudio();
  for (const file of fileInput.files) {
    const buffer = await audioContext.decodeAudioData(await file.arrayBuffer());

    const li = document.createElement("li");
    li.textContent = file.name;

    li.onclick = () => {
      document.querySelectorAll("#fileList li")
        .forEach(l => l.classList.remove("selected"));
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
  let g = trackFaders[i];

  if (trackMuted[i]) g = 0;
  if (anySolo && !trackSolo[i]) g = 0;

  trackGains[i].gain.value = g;
  tracks[i].style.opacity = anySolo && !trackSolo[i] ? "0.4" : "1";
}

// =====================
// TRACKS
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

  track.onclick = (e) => {
    if (!selectedLibraryItem) return;
    if (["BUTTON", "INPUT"].includes(e.target.tagName)) return;

    trackBuffers[i] = selectedLibraryItem.buffer;
    label.textContent = `Track ${i + 1}: ${selectedLibraryItem.name}`;
    track.classList.add("filled");
  };

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

  // CLIP DRAG
  let dragging = false;
  let startX = 0;
  let startLeft = 0;

  clip.onmousedown = (e) => {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startLeft = clip.offsetLeft;
  };

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    let x = startLeft + (e.clientX - startX);
    x = Math.max(0, x);
    x = Math.min(x, timeline.clientWidth - clip.clientWidth);
    clip.style.left = x + "px";
    offsetInput.value = (x / 100).toFixed(2);
  });

  document.addEventListener("mouseup", () => dragging = false);
});

// =====================
// PLAYHEAD
// =====================
function startPlayhead() {
  stopPlayhead();
  playheadStartTime =
    audioContext.currentTime - (loopEnabled ? loopStart : 0);
  playheadRAF = requestAnimationFrame(updatePlayhead);
}

function stopPlayhead() {
  cancelAnimationFrame(playheadRAF);
  document.querySelectorAll(".playhead")
    .forEach(p => p.style.left = "0px");
}

function updatePlayhead() {
  const t = audioContext.currentTime - playheadStartTime;

  if (loopEnabled && t >= loopEnd) {
    stopAll();
    playAll();
    return;
  }

  const x = t * 100;
  document.querySelectorAll(".playhead")
    .forEach(p => p.style.left = x + "px");

  playheadRAF = requestAnimationFrame(updatePlayhead);
}

// =====================
// TRANSPORT
// =====================
function playAll() {
  initAudio();
  if (audioContext.state !== "running") audioContext.resume();

  const baseTime = audioContext.currentTime + 0.05;

  tracks.forEach((track, i) => {
    if (!trackBuffers[i]) return;

    trackSources[i]?.stop();

    const offset = Number(track.querySelector(".track-offset").value) || 0;
    const timelineStart = loopEnabled ? Math.max(offset, loopStart) : offset;
    const bufferOffset = loopEnabled ? Math.max(0, loopStart - offset) : 0;

    const src = audioContext.createBufferSource();
    src.buffer = trackBuffers[i];
    src.connect(trackGains[i]);
    src.start(baseTime + (timelineStart - (loopEnabled ? loopStart : 0)), bufferOffset);

    trackSources[i] = src;
  });

  startPlayhead();
}

function stopAll() {
  trackSources.forEach(s => s?.stop());
  stopPlayhead();
}

playAllBtn.onclick = playAll;
stopAllBtn.onclick = stopAll;

// =====================
// LOOP HANDLE DRAG
// =====================
document.addEventListener("mousedown", (e) => {
  if (e.target.classList.contains("loop-start")) {
    e.preventDefault();
    draggingLoop = "start";
  }
  if (e.target.classList.contains("loop-end")) {
    e.preventDefault();
    draggingLoop = "end";
  }
});

document.addEventListener("mousemove", (e) => {
  if (!draggingLoop) return;

  const tl = document.querySelector(".timeline");
  const rect = tl.getBoundingClientRect();
  const seconds = Math.max(0, (e.clientX - rect.left) / 100);

  if (draggingLoop === "start") {
    loopStart = Math.min(seconds, loopEnd - 0.1);
    loopStartInput.value = loopStart.toFixed(2);
  }

  if (draggingLoop === "end") {
    loopEnd = Math.max(seconds, loopStart + 0.1);
    loopEndInput.value = loopEnd.toFixed(2);
  }

  updateLoopOverlay();
});

document.addEventListener("mouseup", () => draggingLoop = null);

updateLoopOverlay();
