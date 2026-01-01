const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const tracks = document.querySelectorAll(".track");

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

const audioFiles = [];
const trackBuffers = [null, null, null];

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;

  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  audioFiles.push({ file, buffer: audioBuffer });

  const listItem = document.createElement("li");
  listItem.textContent = file.name;

  listItem.onclick = () => {
    assignToTrack(audioBuffer, file.name);
  };

  const downloadBtn = document.createElement("span");
  downloadBtn.textContent = " Download";
  downloadBtn.className = "download-btn";

  downloadBtn.onclick = (e) => {
    e.stopPropagation();
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  listItem.appendChild(downloadBtn);
  fileList.appendChild(listItem);

  fileInput.value = "";
});

function assignToTrack(buffer, name) {
  for (let i = 0; i < trackBuffers.length; i++) {
    if (!trackBuffers[i]) {
      trackBuffers[i] = buffer;
      tracks[i].textContent = `Track ${i + 1}: ${name}`;
      tracks[i].classList.add("filled");
      return;
    }
  }

  alert("All tracks are full.");
}

tracks.forEach((track, index) => {
  track.onclick = () => {
    if (!trackBuffers[index]) return;

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const source = audioContext.createBufferSource();
    source.buffer = trackBuffers[index];
    source.connect(audioContext.destination);
    source.start();
  };
});
