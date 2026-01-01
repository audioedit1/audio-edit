const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const tracks = document.querySelectorAll(".track");

let audioContext = null;
const libraryBuffers = [];

fileInput.addEventListener("change", async () => {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  for (const file of fileInput.files) {
    await addToLibrary(file);
    assignToNextTrack(file.name);
  }

  fileInput.value = "";
});

async function addToLibrary(file) {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  libraryBuffers.push({ name: file.name, buffer: audioBuffer });

  const li = document.createElement("li");
  li.textContent = file.name + " ";

  let previewSource = null;

  const playBtn = document.createElement("button");
  playBtn.textContent = "Play";

  const stopBtn = document.createElement("button");
  stopBtn.textContent = "Stop";

  playBtn.onclick = async () => {
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    if (previewSource) {
      previewSource.stop();
    }

    previewSource = audioContext.createBufferSource();
    previewSource.buffer = audioBuffer;
    previewSource.connect(audioContext.destination);
    previewSource.start();
  };

  stopBtn.onclick = () => {
    if (previewSource) {
      previewSource.stop();
      previewSource = null;
    }
  };

  li.appendChild(playBtn);
  li.appendChild(stopBtn);
  fileList.appendChild(li);
}

let trackIndex = 0;

function assignToNextTrack(filename) {
  if (trackIndex >= tracks.length) return;

  tracks[trackIndex].textContent = `Track ${trackIndex + 1}: ${filename}`;
  trackIndex++;
}
