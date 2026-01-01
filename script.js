const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");

let audioContext = null;
let currentSource = null;
let currentBuffer = null;

fileInput.addEventListener("change", async () => {
  fileList.innerHTML = "";

  const file = fileInput.files[0];
  if (!file) return;

  if (!audioContext) {
    audioContext = new AudioContext();
  }

  const arrayBuffer = await file.arrayBuffer();
  currentBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const li = document.createElement("li");
  li.textContent = file.name;

  const playBtn = document.createElement("button");
  playBtn.textContent = "Play";

  const stopBtn = document.createElement("button");
  stopBtn.textContent = "Stop";

  playBtn.onclick = () => {
    if (currentSource) {
      currentSource.stop();
    }

    currentSource = audioContext.createBufferSource();
    currentSource.buffer = currentBuffer;
    currentSource.connect(audioContext.destination);
    currentSource.start(0);
  };

  stopBtn.onclick = () => {
    if (currentSource) {
      currentSource.stop();
      currentSource = null;
    }
  };

  li.appendChild(document.createElement("br"));
  li.appendChild(playBtn);
  li.appendChild(stopBtn);

  fileList.appendChild(li);
});
