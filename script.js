const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const tracks = document.querySelectorAll(".track");

let audioContext = null;
let selectedLibraryItem = null;

// Track state
const trackBuffers = [null, null, null];
const trackSources = [null, null, null];

// ---------- FILE UPLOAD ----------
fileInput.addEventListener("change", async () => {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  for (const file of fileInput.files) {
    await addToLibrary(file);
  }

  fileInput.value = "";
});

// ---------- LIBRARY ----------
async function addToLibrary(file) {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const li = document.createElement("li");
  li.style.cursor = "pointer";
  li.textContent = file.name + " ";

  let previewSource = null;

  const playBtn = document.createElement("button");
  playBtn.textContent = "Play";

  const stopBtn = document.createElement("button");
  stopBtn.textContent = "Stop";

  // 🔹 PLAY (LIBRARY)
  playBtn.onclick = async (e) => {
    e.stopPropagation();

    if (audioContext.state !== "running") {
      await audioContext.resume();
    }

    if (previewSource) previewSource.stop();

    previewSource = audioContext.createBufferSource();
    previewSource.buffer = audioBuffer;
    previewSource.connect(audioContext.destination);
    previewSource.start();
  };

  // 🔹 STOP (LIBRARY)
  stopBtn.onclick = (e) => {
    e.stopPropagation();
    if (previewSource) {
      previewSource.stop();
      previewSource = null;
    }
  };

  // 🔹 SELECT LIBRARY ITEM
  li.onclick = () => {
    document
      .querySelectorAll("#fileList li")
      .forEach(el => el.classList.remove("selected"));

    li.classList.add("selected");
    selectedLibraryItem = {
      name: file.name,
      buffer: audioBuffer
    };
  };

  li.appendChild(playBtn);
  li.appendChild(stopBtn);
  fileList.appendChild(li);
}

// ---------- TRACKS ----------
tracks.forEach((track, index) => {
  const label = track.querySelector(".track-label");
  const playBtn = track.querySelector(".track-play");
  const stopBtn = track.querySelector(".track-stop");

  // 🔹 ASSIGN TO TRACK
  track.onclick = (e) => {
    if (e.target.tagName === "BUTTON") return;
    if (!selectedLibraryItem) return;

    trackBuffers[index] = selectedLibraryItem.buffer;
    label.textContent = `Track ${index + 1}: ${selectedLibraryItem.name}`;
  };

  // 🔹 PLAY TRACK
  playBtn.onclick = async () => {
    if (!trackBuffers[index]) return;

    if (!audioContext) {
      audioContext = new AudioContext();
    }

    if (audioContext.state !== "running") {
      await audioContext.resume();
    }

    if (trackSources[index]) {
      trackSources[index].stop();
      trackSources[index] = null;
    }

    const source = audioContext.createBufferSource();
    source.buffer = trackBuffers[index];
    source.connect(audioContext.destination);
    source.start();

    trackSources[index] = source;
  };

  // 🔹 STOP TRACK
  stopBtn.onclick = () => {
    if (trackSources[index]) {
      trackSources[index].stop();
      trackSources[index] = null;
    }
  };
});
