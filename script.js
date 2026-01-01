const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const tracks = document.querySelectorAll(".track");

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

let selectedSound = null; // { name, buffer }

const trackBuffers = [null, null, null];

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files);

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const listItem = document.createElement("li");
    listItem.textContent = file.name;

    // SELECT sound
    listItem.onclick = () => {
      selectedSound = { name: file.name, buffer: audioBuffer };

      document
        .querySelectorAll("#fileList li")
        .forEach(li => li.classList.remove("selected"));

      listItem.classList.add("selected");
    };

    // DOWNLOAD
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
  }

  fileInput.value = "";
});

// TRACK CLICK = assign OR play
tracks.forEach((track, index) => {
  track.onclick = () => {
    // ASSIGN
    if (selectedSound) {
      trackBuffers[index] = selectedSound.buffer;
      track.textContent = `Track ${index + 1}: ${selectedSound.name}`;
      track.classList.add("filled");
      selectedSound = null;

      document
        .querySelectorAll("#fileList li")
        .forEach(li => li.classList.remove("selected"));

      return;
    }

    // PLAY
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
