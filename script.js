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
// GLOBAL STATE
// =====================
let audioContext = null;
let masterGain = null;
let previewGain = null;
let selectedLibraryItem = null;

const trackBuffers = [null, null, null];
const trackTrimStart = [0, 0, 0];
const trackTrimEnd = [0, 0, 0];
const trackSources = [null, null, null];
const trackGains = [null, null, null];
const trackFaders = [1, 1, 1];
const trackMuted = [false, false, false];
const trackSolo = [false, false, false];

// =====================
// TRANSPORT
// =====================
let BPM = 120;
let beatsPerBar = 4;

function beatsToSeconds(beats) {
  return beats * (60 / BPM);
}

function secondsToBeats(seconds) {
  return seconds / (60 / BPM);
}

// Loop stored INTERNALLY in seconds
let loopEnabled = false;
let loopStart = 0;
let loopEnd = beatsToSeconds(4);
let draggingLoop = null;
let draggingTimeline = null;

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
// LOOP OVERLAY
// =====================
function updateLoopOverlay() {
  document.querySelectorAll(".timeline").forEach(timeline => {
    const loopEl = timeline.querySelector(".loop-region");
    const startHandle = timeline.querySelector(".loop-start");
    const endHandle = timeline.querySelector(".loop-end");

    if (!loopEl || !startHandle || !endHandle) return;

    if (!loopEnabled || loopEnd <= loopStart) {
      loopEl.style.display = "none";
      startHandle.style.display = "none";
      endHandle.style.display = "none";
      return;
    }

    const totalSeconds = beatsToSeconds(8);
    const pxPerSecond = timeline.clientWidth / totalSeconds;

    const left = loopStart * pxPerSecond;
    const width = (loopEnd - loopStart) * pxPerSecond;

    loopEl.style.display = "block";
    loopEl.style.left = left + "px";
    loopEl.style.width = width + "px";

    startHandle.style.display = "block";
    endHandle.style.display = "block";

    startHandle.style.left = left + "px";
    endHandle.style.left = (left + width) + "px";
  });
}

// =====================
// LOOP CONTROLS (inputs are beats)
// =====================
loopStartInput.oninput = () => {
  loopStart = beatsToSeconds(Number(loopStartInput.value) || 0);
  updateLoopOverlay();
};

loopEndInput.oninput = () => {
  loopEnd = beatsToSeconds(Number(loopEndInput.value) || 0);
  updateLoopOverlay();
};

loopEnabledCheckbox.onchange = () => {
  loopEnabled = loopEnabledCheckbox.checked;
  updateLoopOverlay();
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
  const buffer = await audioContext.decodeAudioData(await file.arrayBuffer());

  const li = document.createElement("li");
  li.textContent = file.name + " ";
  li.style.cursor = "pointer";

  let previewSource = null;

  const play = document.createElement("button");
  play.textContent = "Play";

  const stop = document.createElement("button");
  stop.textContent = "Stop";

  play.onclick = async e => {
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
    document.querySelectorAll("#fileList li").forEach(el =>
      el.classList.remove("selected")
    );
    li.classList.add("selected");
    selectedLibraryItem = { name: file.name, buffer };
  };

  li.append(play, stop);
  fileList.appendChild(li);
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
  const trimStartInput = track.querySelector(".track-trim-start");
  const trimEndInput = track.querySelector(".track-trim-end");
  const timeline = track.querySelector(".timeline");
  const clip = track.querySelector(".clip");

  initAudio();
  trackGains[i] = audioContext.createGain();
  trackGains[i].connect(masterGain);

  if (trimStartInput) {
    trimStartInput.oninput = () => {
      trackTrimStart[i] = Math.max(0, Number(trimStartInput.value) || 0);
    };
  }

  if (trimEndInput) {
    trimEndInput.oninput = () => {
      trackTrimEnd[i] = Math.max(0, Number(trimEndInput.value) || 0);
    };
  }

  playBtn.onclick = async () => {
    if (!trackBuffers[i]) return;
    if (audioContext.state !== "running") await audioContext.resume();
    trackSources[i]?.stop();

    const beatOffset = Number(offsetInput.value) || 0;
    const startTime =
      audioContext.currentTime + beatsToSeconds(beatOffset);

    const bufferDuration = trackBuffers[i].duration;
    const trimStart = trackTrimStart[i] || 0;
    const trimEnd =
      trackTrimEnd[i] > 0
        ? Math.min(trackTrimEnd[i], bufferDuration)
        : bufferDuration;

    const src = audioContext.createBufferSource();
    src.buffer = trackBuffers[i];
    src.connect(trackGains[i]);
    src.start(startTime, trimStart, trimEnd - trimStart);

    trackSources[i] = src;
  };

  stopBtn.onclick = () => trackSources[i]?.stop();

  track.onclick = e => {
    if (!selectedLibraryItem) return;
    if (["BUTTON", "INPUT", "DIV"].includes(e.target.tagName)) return;
    trackBuffers[i] = selectedLibraryItem.buffer;
    label.textContent = `Track ${i + 1}: ${selectedLibraryItem.name}`;
  };

  let dragging = false;
  let startX = 0;
  let startLeft = 0;

  clip.onmousedown = e => {
    dragging = true;
    startX = e.clientX;
    startLeft = clip.offsetLeft;
  };

  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    let x = startLeft + (e.clientX - startX);
    x = Math.max(0, Math.min(x, timeline.clientWidth - clip.clientWidth));
    clip.style.left = x + "px";

    const seconds = (x / timeline.clientWidth) * beatsToSeconds(8);
    offsetInput.value = secondsToBeats(seconds).toFixed(2);
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });
});

// =====================
// LOOP HANDLE DRAG
// =====================
document.addEventListener("mousedown", e => {
  if (e.target.classList.contains("loop-start")) {
    draggingLoop = "start";
    draggingTimeline = e.target.closest(".timeline");
  }
  if (e.target.classList.contains("loop-end")) {
    draggingLoop = "end";
    draggingTimeline = e.target.closest(".timeline");
  }
});

document.addEventListener("mousemove", e => {
  if (!draggingLoop || !draggingTimeline) return;

  const rect = draggingTimeline.getBoundingClientRect();
  const x = Math.max(0, e.clientX - rect.left);
  const seconds =
    (x / draggingTimeline.clientWidth) * beatsToSeconds(8);

  if (draggingLoop === "start") {
    loopStart = Math.min(seconds, loopEnd - 0.01);
    loopStartInput.value = secondsToBeats(loopStart).toFixed(2);
  }

  if (draggingLoop === "end") {
    loopEnd = Math.max(seconds, loopStart + 0.01);
    loopEndInput.value = secondsToBeats(loopEnd).toFixed(2);
  }

  updateLoopOverlay();
});

document.addEventListener("mouseup", () => {
  draggingLoop = null;
  draggingTimeline = null;
});

// Initial draw
updateLoopOverlay();
