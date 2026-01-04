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

let playheadRAF = null;
let playheadStartTime = null;

// =====================
// GLOBAL STATE
// =====================
let audioContext = null;
let masterGain = null;
let previewGain = null;
let selectedLibraryItem = null;

const trackBuffers = [null, null, null];

// Trim is now ABSOLUTE buffer time (seconds)
const trackTrimStart = [0, 0, 0];
const trackTrimEnd = [null, null, null]; // null = buffer.duration

const trackSources = [null, null, null];
const trackGains = [null, null, null];
const trackFaders = [1, 1, 1];
const trackMuted = [false, false, false];
const trackSolo = [false, false, false];
const trackPlaybackCallbacks = [];


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

// transport time in seconds (MASTER CLOCK)
let transportTime = 0;
let isTransportRunning = false;

function beatsToSeconds(beats) {
  return beats * (60 / BPM);
}

function secondsToBeats(seconds) {
  return seconds / (60 / BPM);
}

function startPlayhead() {
  cancelAnimationFrame(playheadRAF);

  if (!audioContext) return;

  let lastContextTime = audioContext.currentTime;
  isTransportRunning = true;

  function tick() {
    if (!isTransportRunning) return;

    const now = audioContext.currentTime;
    const delta = now - lastContextTime;
    lastContextTime = now;

    transportTime += delta;

    // LOOP (transport-based)
    if (loopEnabled && transportTime >= loopEnd) {
      transportTime = loopStart;
    }

    // UPDATE PLAYHEAD VISUAL
    document.querySelectorAll(".timeline").forEach(timeline => {
      const playhead = timeline.querySelector(".playhead");
      if (!playhead) return;

      const totalSeconds = beatsToSeconds(8);
      const pxPerSecond = timeline.clientWidth / totalSeconds;

      const x = Math.min(
        transportTime * pxPerSecond,
        timeline.clientWidth
      );

      playhead.style.left = x + "px";
    });

    // 🔴 DRIVE TRACK AUDIO FROM TRANSPORT (FIX)
    trackPlaybackCallbacks.forEach(fn => fn && fn());

    playheadRAF = requestAnimationFrame(tick);
  }

  tick();
}

function stopPlayhead() {
  isTransportRunning = false;
  cancelAnimationFrame(playheadRAF);
  transportTime = 0;

  document.querySelectorAll(".playhead").forEach(ph => {
    ph.style.left = "0px";
  });
}

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

  // 🔊 MASTER VOLUME CONTROL (FIX)
  masterSlider.oninput = () => {
    if (!masterGain) return;
    masterGain.gain.value = Number(masterSlider.value);
  };
}


// =====================
// PLAY ALL / STOP ALL
// =====================
playAllBtn.onclick = async () => {
  initAudio();
  await audioContext.resume();

  // reset transport
  transportTime = 0;

  // stop all active audio sources
  trackSources.forEach(src => src?.stop());
  trackSources.fill(null);

  startPlayhead();
};

stopAllBtn.onclick = () => {
  stopPlayhead();

  trackSources.forEach(src => src?.stop());
  trackSources.fill(null);
};


// =====================
// LOOP STATE (GLOBAL)
// =====================

// loop in seconds (audio time)
let loopEnabled = false;
let loopStart = 0;
let loopEnd = beatsToSeconds(4);

// per-track scheduling
const loopTimers = [null, null, null];
const loopPlayTimes = [0, 0, 0];

// UI drag state
let draggingLoop = null;
let draggingTimeline = null;

// =====================
// LOOP CONTROLS (INPUTS)
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

  if (!loopEnabled) {
    // hard reset all loop state
    loopPlayTimes.fill(0);
    loopTimers.forEach((_, i) => stopLoopForTrack(i));
  }

  updateLoopOverlay();
};

// =====================
// LOOP VISUAL OVERLAY
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
    endHandle.style.left = left + width + "px";
  });
}

// =====================
// AUDIO LOOP ENGINE
// =====================

function startLoopForTrack(i) {
  if (!loopEnabled) return;
  if (!trackBuffers[i]) return;
  if (!audioContext) return;

  const duration = Math.max(0.01, loopEnd - loopStart);

  // initialize loop timeline once
  if (!loopPlayTimes[i]) {
    loopPlayTimes[i] = audioContext.currentTime;
  }

  const startAt = loopPlayTimes[i];

  const src = audioContext.createBufferSource();
  src.buffer = trackBuffers[i];
  src.connect(trackGains[i]);

  // schedule loop segment precisely
  src.start(startAt, loopStart, duration);
  src.stop(startAt + duration);

  trackSources[i] = src;

  // advance audio timeline
  loopPlayTimes[i] += duration;

  // schedule next iteration slightly early
  loopTimers[i] = setTimeout(
    () => startLoopForTrack(i),
    Math.max(
      0,
      (loopPlayTimes[i] - audioContext.currentTime - 0.05) * 1000
    )
  );
}

function stopLoopForTrack(i) {
  trackSources[i]?.stop();
  clearTimeout(loopTimers[i]);
  loopTimers[i] = null;
  loopPlayTimes[i] = 0;
}

// =====================
// LOOP HANDLE DRAGGING
// =====================

document.addEventListener("mousedown", e => {
  if (e.target.classList.contains("loop-start")) {
    draggingLoop = "start";
    draggingTimeline = e.target.closest(".timeline");
  } else if (e.target.classList.contains("loop-end")) {
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
  } else if (draggingLoop === "end") {
    loopEnd = Math.max(seconds, loopStart + 0.01);
    loopEndInput.value = secondsToBeats(loopEnd).toFixed(2);
  }

  updateLoopOverlay();
});

document.addEventListener("mouseup", () => {
  draggingLoop = null;
  draggingTimeline = null;
});

// =====================
// INITIAL DRAW
// =====================

updateLoopOverlay();

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

// per-track playback state
const trackIsPlaying = [false, false, false];

// persistent clip offsets (beats)
const trackOffsets = [0, 0, 0];

// active solo-play track (null = play all)
let activeTrackIndex = null;

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

  // ===== CLIP VISUAL =====
  function updateClipVisual() {
    if (!trackBuffers[i]) return;

    const bufferDuration = trackBuffers[i].duration;
    const totalSeconds = beatsToSeconds(8);
    const pxPerSecond = timeline.clientWidth / totalSeconds;

    const trimStart = trackTrimStart[i] || 0;
    const trimEnd =
      trackTrimEnd[i] !== null ? trackTrimEnd[i] : bufferDuration;

    const visibleDuration = Math.max(0.01, trimEnd - trimStart);
    clip.style.width = visibleDuration * pxPerSecond + "px";

    const offsetSeconds = beatsToSeconds(trackOffsets[i] || 0);
    clip.style.left = offsetSeconds * pxPerSecond + "px";
  }

  // ===== UI CONTROLS =====
  slider.oninput = () => {
    trackFaders[i] = Number(slider.value);
    updateTrackGains();
  };

  muteBtn.onclick = e => {
    e.stopPropagation();
    trackMuted[i] = !trackMuted[i];
    muteBtn.classList.toggle("active", trackMuted[i]);
    updateTrackGains();
  };

  soloBtn.onclick = e => {
    e.stopPropagation();
    trackSolo[i] = !trackSolo[i];
    soloBtn.classList.toggle("active", trackSolo[i]);
    updateTrackGains();
  };

  // 🔴 FIX: offset input must update state
  offsetInput.oninput = () => {
    trackOffsets[i] = Math.max(0, Number(offsetInput.value) || 0);
    updateClipVisual();
  };

  if (trimStartInput) {
    trimStartInput.oninput = () => {
      trackTrimStart[i] = Math.max(0, Number(trimStartInput.value) || 0);
      updateClipVisual();
    };
  }

  if (trimEndInput) {
    trimEndInput.oninput = () => {
      trackTrimEnd[i] = Math.max(0, Number(trimEndInput.value) || 0);
      updateClipVisual();
    };
  }

  // ===== TRANSPORT-DRIVEN PLAYBACK =====
  function updateTrackPlayback() {
    if (!isTransportRunning || !trackBuffers[i]) return;
    if (activeTrackIndex !== null && activeTrackIndex !== i) return;

    const bufferDuration = trackBuffers[i].duration;
    const trimStart = trackTrimStart[i] || 0;
    const trimEnd =
      trackTrimEnd[i] !== null ? trackTrimEnd[i] : bufferDuration;

    const clipStart = beatsToSeconds(trackOffsets[i] || 0);
    const clipDuration = trimEnd - trimStart;
    const clipEnd = clipStart + clipDuration;

    const isInside =
      transportTime >= clipStart && transportTime < clipEnd;

    if (isInside && !trackIsPlaying[i]) {
      const src = audioContext.createBufferSource();
      src.buffer = trackBuffers[i];
      src.connect(trackGains[i]);

      const bufferOffset =
        trimStart + (transportTime - clipStart);

      src.start(0, bufferOffset);
      src.stop(audioContext.currentTime + (clipEnd - transportTime));

      trackSources[i] = src;
      trackIsPlaying[i] = true;
    }

    if (!isInside && trackIsPlaying[i]) {
      trackSources[i]?.stop();
      trackSources[i] = null;
      trackIsPlaying[i] = false;
    }
  }

  trackPlaybackCallbacks[i] = updateTrackPlayback;

  // ===== TRACK PLAY / STOP =====
  playBtn.onclick = async e => {
    e.stopPropagation();
    if (!trackBuffers[i]) return;
    if (audioContext.state !== "running") await audioContext.resume();

    activeTrackIndex = i;
    transportTime = beatsToSeconds(trackOffsets[i] || 0);
    startPlayhead();
  };

  stopBtn.onclick = e => {
    e.stopPropagation();
    activeTrackIndex = null;
    stopPlayhead();
    trackSources[i]?.stop();
    trackIsPlaying[i] = false;
  };

  // ===== CLIP DRAG =====
  let dragging = false;
  let dragStartX = 0;
  let dragStartLeft = 0;

  clip.onmousedown = e => {
    dragging = true;
    dragStartX = e.clientX;
    dragStartLeft = clip.offsetLeft;
    e.preventDefault();
  };

  document.addEventListener("mousemove", e => {
    if (!dragging) return;

    let newLeft = dragStartLeft + (e.clientX - dragStartX);
    newLeft = Math.max(0, Math.min(newLeft, timeline.clientWidth - clip.clientWidth));

    clip.style.left = newLeft + "px";

    const seconds = (newLeft / timeline.clientWidth) * beatsToSeconds(8);
    const beats = secondsToBeats(seconds);

    trackOffsets[i] = beats;
    offsetInput.value = beats.toFixed(2);
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });

  // ===== ASSIGN SAMPLE FROM LIBRARY =====
  track.onclick = e => {
    if (!selectedLibraryItem) return;

    if (
      e.target === playBtn ||
      e.target === stopBtn ||
      e.target === slider ||
      e.target === muteBtn ||
      e.target === soloBtn ||
      e.target === offsetInput ||
      e.target === trimStartInput ||
      e.target === trimEndInput
    ) {
      return;
    }

    trackBuffers[i] = selectedLibraryItem.buffer;
    trackTrimStart[i] = 0;
    trackTrimEnd[i] = null;
    trackOffsets[i] = 0;
    offsetInput.value = "0";

    label.textContent = `Track ${i + 1}: ${selectedLibraryItem.name}`;
    updateClipVisual();
  };
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
