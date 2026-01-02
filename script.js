// =====================
// GLOBAL STATE
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

// Loop
let loopEnabled = false;
let loopStart = 0;
let loopEnd = 4;

// Playhead
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
// LOOP CONTROLS
// =====================
loopStartInput.oninput = () => {
  loopStart = Math.max(0, Number(loopStartInput.value));
};

loopEndInput.oninput = () => {
  loopEnd = Math.max(loopStart, Number(loopEndInput.value));
};

loopEnabledCheckbox.onchange = () => {
  loopEnabled = loopEnabledCheckbox.checked;
};

// =====================
// FILE UPLOAD
// =====================
fileInput.addEventListener("change", async () => {
  initAudio();
  for (const file of fileInput.files) {
    await addToLibrary(file);
  }
  fileInput.value = "";
});

// =====================
// LIBRARY
// =====================
async function addToLibrary(file) {
  const buffer = await audioContext.decodeAudioData(
    await file.arrayBuffer()
  );

  const li = document.createElement("li");
  li.textContent = file.name + " ";
  li.style.cursor = "pointer";

  let previewSource = null;

  const play = document.createElement("button");
  play.textContent = "Play";

  const stop = document.createElement("button");
  stop.textContent = "Stop";

  play.onclick = async (e) => {
    e.stopPropagation();
    if (audioContext.state !== "running") await audioContext.resume();
    previewSource?.stop();

    previewSource = audioContext.createBufferSource();
    previewSource.buffer = buffer;
    previewSource.connect(previewGain);
    previewSource.start();
  };

  stop.onclick = () => previewSource?.stop();

  li.onclick = () => {
    document.querySelectorAll("#fileList li")
      .forEach(el => el.classList.remove("selected"));

    li.classList.add("selected");
    selectedLibraryItem = { name: file.name, buffer };
  };

  li.append(play, stop);
  fileList.appendChild(li);
}

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
// TRACKS
// =====================
tracks.forEach((track, i) => {
  const label = track.querySelector(".track-label");
  const playBtn = track.querySelector(".track-play");
  const stopBtn = track.querySelector(".track-stop");
  const slider = track.querySelector(".track-gain");
  const muteBtn = track.querySelector(".track-mute");
  const soloBtn = track.querySelector(".track-solo");
  const offsetInput = track.querySelector(".track-offset");

  const timeline = track.querySelector(".timeline");
  const clip = track.querySelector(".clip");

  initAudio();

  trackGains[i] = audioContext.createGain();
  trackGains[i].connect(masterGain);

  slider.oninput = () => {
    trackFaders[i] = Number(slider.value);
    updateTrackGain(i);
  };

  muteBtn.onclick = () => {
    trackMuted[i] = !trackMuted[i];
    for (let t = 0; t < 3; t++) updateTrackGain(t);
  };

  soloBtn.onclick = () => {
    trackSolo[i] = !trackSolo[i];
    for (let t = 0; t < 3; t++) updateTrackGain(t);
  };

  track.onclick = (e) => {
    if (!selectedLibraryItem) return;
    if (["BUTTON", "INPUT", "DIV"].includes(e.target.tagName)) return;

    trackBuffers[i] = selectedLibraryItem.buffer;
    label.textContent = `Track ${i + 1}: ${selectedLibraryItem.name}`;
  };

  playBtn.onclick = async () => {
    if (!trackBuffers[i]) return;
    if (audioContext.state !== "running") await audioContext.resume();

    trackSources[i]?.stop();

    const offset = Number(offsetInput.value) || 0;
    const src = audioContext.createBufferSource();
    src.buffer = trackBuffers[i];
    src.connect(trackGains[i]);
    src.start(audioContext.currentTime + offset);

    trackSources[i] = src;
  };

  stopBtn.onclick = () => trackSources[i]?.stop();

  // Drag clip
  let dragging = false;
  let startX = 0;
  let startLeft = 0;

  clip.onmousedown = (e) => {
    dragging = true;
    startX = e.clientX;
    startLeft = clip.offsetLeft;
    clip.style.cursor = "grabbing";
  };

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;

    let x = startLeft + (e.clientX - startX);
    x = Math.max(0, x);
    x = Math.min(x, timeline.clientWidth - clip.clientWidth);

    clip.style.left = x + "px";
    offsetInput.value = (x / 100).toFixed(2);
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
    clip.style.cursor = "grab";
  });
});

// =====================
// PLAYHEAD
// =====================
function startPlayhead() {
  stopPlayhead();
  playheadStartTime = audioContext.currentTime - loopStart;
  playheadRAF = requestAnimationFrame(updatePlayhead);
}

function stopPlayhead() {
  cancelAnimationFrame(playheadRAF);
  document.querySelectorAll(".playhead")
    .forEach(p => p.style.left = "0px");
}

function updatePlayhead() {
  let t = audioContext.currentTime - playheadStartTime;

  if (loopEnabled && loopEnd > loopStart && t >= loopEnd) {
    stopAll();
    playAll();
    return;
  }

  const x = t * 100;

  document.querySelectorAll(".timeline").forEach(tl => {
    const ph = tl.querySelector(".playhead");
    ph.style.left = Math.min(x, tl.clientWidth) + "px";
  });

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

    // stop previous source
    trackSources[i]?.stop();

    const trackOffset =
      Number(track.querySelector(".track-offset").value) || 0;

    // respect loop start
    const startAt = loopEnabled
      ? Math.max(trackOffset, loopStart)
      : trackOffset;

    const src = audioContext.createBufferSource();
    src.buffer = trackBuffers[i];
    src.connect(trackGains[i]);

    // align playback to loop A
    src.start(
      baseTime + (startAt - (loopEnabled ? loopStart : 0))
    );

    trackSources[i] = src;
  });

  // align playhead with loop
  playheadStartTime =
    audioContext.currentTime - (loopEnabled ? loopStart : 0);

  startPlayhead();
}


function stopAll() {
  trackSources.forEach(s => s?.stop());
  stopPlayhead();
}

playAllBtn.onclick = playAll;
stopAllBtn.onclick = stopAll;
