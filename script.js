const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const tracks = document.querySelectorAll(".track");
const masterSlider = document.getElementById("masterGain");
const playAllBtn = document.getElementById("playAll");
const stopAllBtn = document.getElementById("stopAll");

let audioContext;
let masterGain;
let previewGain;
let selectedLibraryItem = null;

const trackBuffers = [null, null, null];
const trackSources = [null, null, null];
const trackGains = [null, null, null];
const trackFaders = [1, 1, 1];
const trackMuted = [false, false, false];
const trackSolo = [false, false, false];

// ---------- INIT ----------
function initAudio() {
  if (audioContext) return;

  audioContext = new AudioContext();

  masterGain = audioContext.createGain();
  masterGain.gain.value = masterSlider.value;
  masterGain.connect(audioContext.destination);

  previewGain = audioContext.createGain();
  previewGain.gain.value = 1;
  previewGain.connect(masterGain);
}

// ---------- MASTER ----------
masterSlider.oninput = () => {
  if (masterGain) masterGain.gain.value = masterSlider.value;
};

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

  const play = document.createElement("button");
  play.textContent = "Play";

  const stop = document.createElement("button");
  stop.textContent = "Stop";

  play.onclick = async (e) => {
    e.stopPropagation();
    if (audioContext.state !== "running") await audioContext.resume();

    if (previewSource) previewSource.stop();
    previewSource = audioContext.createBufferSource();
    previewSource.buffer = buffer;
    previewSource.connect(previewGain);
    previewSource.start();
  };

  stop.onclick = (e) => {
    e.stopPropagation();
    if (previewSource) previewSource.stop();
  };

  li.onclick = () => {
    document.querySelectorAll("#fileList li")
      .forEach(el => el.classList.remove("selected"));

    li.classList.add("selected");
    selectedLibraryItem = { name: file.name, buffer };
  };

  li.append(play, stop);
  fileList.appendChild(li);
}

// ---------- GAIN LOGIC ----------
function updateTrackGain(i) {
  const anySolo = trackSolo.some(v => v);
  let gain = trackFaders[i];

  if (trackMuted[i]) gain = 0;
  if (anySolo && !trackSolo[i]) gain = 0;

  trackGains[i].gain.value = gain;
}

// ---------- TRACKS ----------
tracks.forEach((track, i) => {
  const label = track.querySelector(".track-label");
  const play = track.querySelector(".track-play");
  const stop = track.querySelector(".track-stop");
  const slider = track.querySelector(".track-gain");
  const muteBtn = track.querySelector(".track-mute");
  const soloBtn = track.querySelector(".track-solo");

  initAudio();

  trackGains[i] = audioContext.createGain();
  trackGains[i].gain.value = slider.value;
  trackGains[i].connect(masterGain);

  slider.oninput = () => {
    trackFaders[i] = Number(slider.value);
    updateTrackGain(i);
  };

  muteBtn.onclick = () => {
    trackMuted[i] = !trackMuted[i];
    muteBtn.textContent = trackMuted[i] ? "Muted" : "Mute";
    for (let t = 0; t < 3; t++) updateTrackGain(t);
  };

  soloBtn.onclick = () => {
    trackSolo[i] = !trackSolo[i];
    soloBtn.textContent = trackSolo[i] ? "Soloed" : "Solo";
    for (let t = 0; t < 3; t++) updateTrackGain(t);
  };

  track.onclick = (e) => {
    if (["BUTTON", "INPUT"].includes(e.target.tagName)) return;
    if (!selectedLibraryItem) return;

    trackBuffers[i] = selectedLibraryItem.buffer;
    label.textContent = `Track ${i + 1}: ${selectedLibraryItem.name}`;
  };

  play.onclick = async () => {
    if (!trackBuffers[i]) return;
    if (audioContext.state !== "running") await audioContext.resume();

    if (trackSources[i]) trackSources[i].stop();

    const src = audioContext.createBufferSource();
    src.buffer = trackBuffers[i];
    src.connect(trackGains[i]);
    src.start();

    trackSources[i] = src;
  };

  stop.onclick = () => {
    if (trackSources[i]) trackSources[i].stop();
  };
});

// ---------- TRANSPORT ----------
playAllBtn.onclick = async () => {
  if (audioContext.state !== "running") await audioContext.resume();

  const startTime = audioContext.currentTime + 0.05;

  for (let i = 0; i < 3; i++) {
    if (!trackBuffers[i]) continue;

    if (trackSources[i]) trackSources[i].stop();

    const src = audioContext.createBufferSource();
    src.buffer = trackBuffers[i];
    src.connect(trackGains[i]);
    src.start(startTime);

    trackSources[i] = src;
  }
};

stopAllBtn.onclick = () => {
  for (let i = 0; i < 3; i++) {
    if (trackSources[i]) {
      trackSources[i].stop();
      trackSources[i] = null;
    }
  }
};
