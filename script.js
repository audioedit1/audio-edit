const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const tracks = document.querySelectorAll(".track");

let audioContext = null;
let selectedLibraryItem = null;

// Track state
const trackBuffers = [null, null, null];

fileInput.addEventListener("change", async () => {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  for (const file of fileInput.files) {
    await addToLibrary(file);
  }

  fileInput.value = "";
});

async function addToLibrary(file) {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const li = document.createElement("li");
  li.textContent = file.name + " ";
  li.style.cursor = "pointer";

  let previewSource = null;

  const playBtn = document.createElement("button");
  playBtn.textContent = "Play";

  const stopBtn = document.createElement("button");
  stopBtn.textContent = "Stop";

  playBtn.onclick = async (e) => {
    e.stopPropagation();

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    if (previewSource) previewSource.stop();

    previewSource = audioContext.createBufferSource();
    previewSource.buffer = audioBuffer;
    previewSource.connect(audioContext.destination);
    previewSource.start();
  };

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
    selectedLibraryItem = { name: file.name, buffer: audioBuffer };
  };

  li.appendChild(playBtn);
  li.appendChild(stopBtn);
  fileList.appendChild(li);
}

// Assign selected sound to track
tracks.forEach(track => {
  track.onclick = () => {
    if (!selectedLibraryItem) return;

    const index = Number(track.dataset.track);
    trackBuffers[index] = selectedLibraryItem.buffer;
    track.textContent = `Track ${index + 1}: ${selectedLibraryItem.name}`;
  };
});
