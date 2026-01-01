const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");

let audioContext = null;

fileInput.addEventListener("change", async () => {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  for (const file of fileInput.files) {
    await addFileToLibrary(file);
  }

  // allow re-uploading the same file again later
  fileInput.value = "";
});

async function addFileToLibrary(file) {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const li = document.createElement("li");
  li.textContent = file.name + " ";

  let sourceNode = null;

  const playBtn = document.createElement("button");
  playBtn.textContent = "Play";

  const stopBtn = document.createElement("button");
  stopBtn.textContent = "Stop";

  playBtn.onclick = async () => {
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    if (sourceNode) {
      sourceNode.stop();
    }

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(audioContext.destination);
    sourceNode.start();
  };

  stopBtn.onclick = () => {
    if (sourceNode) {
      sourceNode.stop();
      sourceNode = null;
    }
  };

  li.appendChild(playBtn);
  li.appendChild(stopBtn);
  fileList.appendChild(li);
}
