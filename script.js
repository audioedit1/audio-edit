// =====================
// GLOBAL ELEMENTS
// =====================
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const tracks = document.querySelectorAll(".track");

const playAllBtn = document.getElementById("playAll");
const stopAllBtn = document.getElementById("stopAll");
const masterSlider = document.getElementById("masterGain");

// =====================
// AUDIO STATE
// =====================
let audioContext = null;
let masterGain = null;
let selectedLibraryItem = null;

// ONE SOURCE OF TRUTH (seconds)
const trackOffsets = [0, 0, 0];

const trackBuffers = [null, null, null];
const trackSources = [null, null, null];
const trackGains = [null, null, null];

// =====================
// AUDIO INIT
// =====================
function initAudio() {
  if (audioContext) return;

  audioContext = new AudioContext();

  masterGain = audioContext.createGain();
  masterGain.gain.value = masterSlider.value;
  masterGain.connect(audioContext.destination);
}

masterSlider.oninput = () => {
  if (masterGain) masterGain.gain.value = masterSlider.value;
};

// =====================
// FILE UPLOAD
// =====================
fileInput.onchange = async () => {
  initAudio();

  for (const file of fileInput.files) {
    const buffer = await audioContext.decodeAudioData(
      await file.arrayBuffer()
    );

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
// TRACKS
// =====================
tracks.forEach((track, i) => {
  const label = track.querySelector(".track-label");
  const offsetInput = track.querySelector(".track-offset");
  const timeline = track.querySelector(".timeline");
  const clip = track.querySelector(".clip");
  const playBtn = track.querySelector(".track-play");
  const stopBtn = track.querySelector(".track-stop");

  initAudio();

  trackGains[i] = audioContext.createGain();
  trackGains[i].connect(masterGain);

  // ASSIGN AUDIO
  track.onclick = (e) => {
    if (!selectedLibraryItem) return;
    if (e.target.closest("button") || e.target.closest("input")) return;

    trackBuffers[i] = selectedLibraryItem.buffer;
    label.textContent = `Track ${i + 1}: ${selectedLibraryItem.name}`;
  };

  // OFFSET INPUT → MODEL → UI
  offsetInput.oninput = () => {
    trackOffsets[i] = Math.max(0, Number(offsetInput.value));
    clip.style.left = (trackOffsets[i] * 100) + "px";
  };

  // DRAG CLIP → MODEL → INPUT
  let dragging = false;
  let startX = 0;
  let startOffset = 0;

  clip.onmousedown = (e) => {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startOffset = trackOffsets[i];
  };

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;

    const dx = e.clientX - startX;
    const seconds = Math.max(0, startOffset + dx / 100);

    trackOffsets[i] = seconds;
    offsetInput.value = seconds.toFixed(2);
    clip.style.left = (seconds * 100) + "px";
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });

  // PLAY / STOP
  playBtn.onclick = async () => {
    if (!trackBuffers[i]) return;
    if (audioContext.state !== "running") await audioContext.resume();

    trackSources[i]?.stop();

    const src = audioContext.createBufferSource();
    src.buffer = trackBuffers[i];
    src.connect(trackGains[i]);
    src.start(audioContext.currentTime, trackOffsets[i]);

    trackSources[i] = src;
  };

  stopBtn.onclick = () => trackSources[i]?.stop();
});

// =====================
// TRANSPORT
// =====================
function playAll() {
  initAudio();
  if (audioContext.state !== "running") audioContext.resume();

  const t = audioContext.currentTime + 0.05;

  tracks.forEach((track, i) => {
    if (!trackBuffers[i]) return;

    trackSources[i]?.stop();

    const src = audioContext.createBufferSource();
    src.buffer = trackBuffers[i];
    src.connect(trackGains[i]);
    src.start(t, trackOffsets[i]);

    trackSources[i] = src;
  });
}

function stopAll() {
  trackSources.forEach(s => s?.stop());
}

playAllBtn.onclick = playAll;
stopAllBtn.onclick = stopAll;
