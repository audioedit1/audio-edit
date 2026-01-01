const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const tracks = document.querySelectorAll(".track");

let audioContext = null;
let masterGain = null;
let previewGain = null;
let selectedLibraryItem = null;

// Track state
const trackBuffers = [null, null, null];
const trackSources = [null, null, null];
const trackGains = [null, null, null];

// ---------- INIT AUDIO ----------
function initAudio() {
  if (!audioContext) {
    audioContext = new AudioContext();

    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(audioContext.destination);

    previewGain = audioContext.createGain();
    previewGain.gain.value = 1;
    previewGain.connect(masterGain);
  }
}

// ---------- FILE UPLOAD ----------
fileInput.addEventListener("change", async () => {
  initAudio();

  for (const file of fileInput.files) {
    await addToLibrary(file);
  }

  fileInput.value = "";
});

// ---------- LIBRARY ----------
async function addToLibrary(file) {
  const buffer = await audioContext.decodeAudioData(
    await file.arrayBuffer()
  );

  const li = document.createElement("li");
  li.textContent = file.name + " ";
  li.style.cursor = "pointer";

  let previewSource = null;

  const playBtn = document.createElement("button");
  playBtn.textContent = "Play";

  const stopBtn = document.createElement("button");
  stopBtn.textContent = "Stop";

  // ▶ Library Play
  playBtn.onclick = async (e) => {
    e.stopPropagation();
    if (audioContext.state !== "running") await audioContext.resume();

    if (previewSource) previewSource.stop();

    previewSource = audioContext.createBufferSource();
    previewSource.buffer = buffer;
    previewSource.connect(previewGain); // 🔴 isolated preview path
    previewSource.start();
  };

  // ⏹ Library Stop
  stopBtn.onclick = (e) => {
    e.stopPropagation();
    if (previewSource) previewSource.stop();
  };

  // Select library item
  li.onclick = () => {
    document
      .querySelectorAll("#fileList li")
      .forEach(el => el.classList.remove("selected"));

    li.classList.add("selected");
    selectedLibraryItem = { name: file.name, buffer };
  };

  li.append(playBtn, stopBtn);
  fileList.appendChild(li);
}

// ---------- TRACKS ----------
tracks.forEach((track, i) => {
  const label = track.querySelector(".track-label");
  const playBtn = track.querySelector(".track-play");
  const stopBtn = track.querySelector(".track-stop");
  const slider = track.querySelector(".track-gain");

  initAudio();

  // Track gain node
  trackGains[i] = audioContext.createGain();
  trackGains[i].gain.value = slider.value;
  trackGains[i].connect(masterGain);

  // Fader control
  slider.oninput = () => {
    trackGains[i].gain.value = slider.value;
  };

  // Assign buffer to track
  track.onclick = (e) => {
    if (
      e.target.tagName === "BUTTON" ||
      e.target.tagName === "INPUT"
    ) return;

    if (!selectedLibraryItem) return;

    trackBuffers[i] = selectedLibraryItem.buffer;
    label.textContent = `Track ${i + 1}: ${selectedLibraryItem.name}`;
  };

  // ▶ Track Play
  playBtn.onclick = async () => {
    if (!trackBuffers[i]) return;
    if (audioContext.state !== "running") await audioContext.resume();

    if (trackSources[i]) {
      trackSources[i].stop();
      trackSources[i] = null;
    }

    const src = audioContext.createBufferSource();
    src.buffer = trackBuffers[i];
    src.connect(trackGains[i]); // 🔴 MUST go through track gain
    src.start();

    trackSources[i] = src;
  };

  // ⏹ Track Stop
  stopBtn.onclick = () => {
    if (trackSources[i]) {
      trackSources[i].stop();
      trackSources[i] = null;
    }
  };
});
