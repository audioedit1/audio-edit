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
// TRACK GAIN RESOLUTION
// =====================
function updateTrackGains() {
  const anySolo = trackSolo.some(s => s);

  trackGains.forEach((gain, i) => {
    if (!gain) return;

    let value = trackFaders[i];
    if (trackMuted[i]) value = 0;
    if (anySolo && !trackSolo[i]) value = 0;

    gain.gain.value = value;
  });
}

// =====================
// TRANSPORT / TIME
// =====================
let BPM = 120;
const beatsToSeconds = b => b * (60 / BPM);
const secondsToBeats = s => s / (60 / BPM);

// =====================
// AUDIO INIT
// =====================
function initAudio() {
  if (audioContext) return;

  audioContext = new AudioContext();

  masterGain = audioContext.createGain();
  masterGain.gain.value = Number(masterSlider.value);
  masterGain.connect(audioContext.destination);

  previewGain = audioContext.createGain();
  previewGain.connect(masterGain);
}

// =====================
// MASTER VOLUME CONTROL
// =====================
masterSlider.oninput = () => {
  if (!masterGain) return;
  masterGain.gain.value = Number(masterSlider.value);
};

// =====================
// PLAY ALL / STOP ALL
// =====================
playAllBtn.onclick = async () => {
  initAudio();
  await audioContext.resume();

  loopTimers.forEach((_, i) => stopLoopForTrack(i));

  tracks.forEach((track, i) => {
    if (!trackBuffers[i]) return;

    trackSources[i]?.stop();

    if (loopEnabled) {
      startLoopForTrack(i);
      return;
    }

    const offsetInput = track.querySelector(".track-offset");
    const beatOffset = Number(offsetInput?.value) || 0;
    const startTime =
      audioContext.currentTime + beatsToSeconds(beatOffset);

    const bufferDuration = trackBuffers[i].duration;
    const trimStart = Math.max(0, trackTrimStart[i] || 0);
    const rawTrimEnd =
      trackTrimEnd[i] > 0 ? trackTrimEnd[i] : bufferDuration;
    const trimEnd = Math.max(trimStart + 0.01, Math.min(rawTrimEnd, bufferDuration));

    const src = audioContext.createBufferSource();
    src.buffer = trackBuffers[i];
    src.connect(trackGains[i]);
    src.start(startTime, trimStart, trimEnd - trimStart);

    trackSources[i] = src;
  });
};

stopAllBtn.onclick = () => {
  trackSources.forEach((src, i) => {
    src?.stop();
    stopLoopForTrack(i);
  });
};

// =====================
// LOOP STATE
// =====================
let loopEnabled = false;
let loopStart = 0;
let loopEnd = beatsToSeconds(4);
const loopTimers = [null, null, null];

// =====================
// LOOP CONTROLS
// =====================
loopStartInput.oninput = () => {
  loopStart = beatsToSeconds(Number(loopStartInput.value) || 0);
};

loopEndInput.oninput = () => {
  loopEnd = beatsToSeconds(Number(loopEndInput.value) || 0);
};

loopEnabledCheckbox.onchange = () => {
  loopEnabled = loopEnabledCheckbox.checked;
};

// =====================
// AUDIO LOOP ENGINE
// =====================
function startLoopForTrack(i) {
  if (!loopEnabled || !trackBuffers[i]) return;

  clearTimeout(loopTimers[i]);

  function playOnce() {
    if (!loopEnabled) return;

    trackSources[i]?.stop();

    const src = audioContext.createBufferSource();
    src.buffer = trackBuffers[i];
    src.connect(trackGains[i]);

    const duration = Math.max(0.01, loopEnd - loopStart);
    const now = audioContext.currentTime;

    src.start(now, loopStart, duration);
    src.stop(now + duration);

    trackSources[i] = src;

    loopTimers[i] = setTimeout(playOnce, duration * 1000);
  }

  playOnce();
}

function stopLoopForTrack(i) {
  trackSources[i]?.stop();
  clearTimeout(loopTimers[i]);
  loopTimers[i] = null;
}

// =====================
// FILE UPLOAD
// =====================
fileInput.addEventListener("change", async () => {
  initAudio();
  for (const file of fileInput.files) {
    const buffer = await audioContext.decodeAudioData(await file.arrayBuffer());
    addToLibrary(file.name, buffer);
  }
  fileInput.value = "";
});

// =====================
// LIBRARY
// =====================
function addToLibrary(name, buffer) {
  const li = document.createElement("li");
  li.textContent = name;
  li.onclick = () => selectedLibraryItem = { name, buffer };
  fileList.appendChild(li);
}

// =====================
// TRACK SETUP
// =====================
tracks.forEach((track, i) => {
  initAudio();
  trackGains[i] = audioContext.createGain();
  trackGains[i].connect(masterGain);

  const playBtn = track.querySelector(".track-play");
  const stopBtn = track.querySelector(".track-stop");
  const slider = track.querySelector(".track-gain");

  slider.oninput = () => {
    trackFaders[i] = Number(slider.value);
    updateTrackGains();
  };

  playBtn.onclick = async () => {
    if (!trackBuffers[i]) return;
    await audioContext.resume();

    if (loopEnabled) {
      startLoopForTrack(i);
      return;
    }

    trackSources[i]?.stop();
    const src = audioContext.createBufferSource();
    src.buffer = trackBuffers[i];
    src.connect(trackGains[i]);
    src.start();
    trackSources[i] = src;
  };

  stopBtn.onclick = () => {
    trackSources[i]?.stop();
    stopLoopForTrack(i);
  };

  track.onclick = () => {
    if (!selectedLibraryItem) return;
    trackBuffers[i] = selectedLibraryItem.buffer;
  };
});
