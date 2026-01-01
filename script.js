const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

const audioFiles = []; // { file, buffer }

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;

  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  audioFiles.push({ file, buffer: audioBuffer });

  const listItem = document.createElement("li");
  listItem.textContent = file.name;

  const playBtn = document.createElement("span");
  playBtn.textContent = " Play";
  playBtn.className = "download-btn";

  const downloadBtn = document.createElement("span");
  downloadBtn.textContent = " Download";
  downloadBtn.className = "download-btn";

  let sourceNode = null;

  playBtn.onclick = () => {
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    if (sourceNode) {
      sourceNode.stop();
      sourceNode = null;
      playBtn.textContent = " Play";
      return;
    }

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(audioContext.destination);
    sourceNode.start();

    playBtn.textContent = " Stop";

    sourceNode.onended = () => {
      sourceNode = null;
      playBtn.textContent = " Play";
    };
  };

  downloadBtn.onclick = () => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  listItem.appendChild(playBtn);
  listItem.appendChild(downloadBtn);
  fileList.appendChild(listItem);

  fileInput.value = "";
});
