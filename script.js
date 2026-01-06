import WaveSurfer from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js";

const fileInput = document.getElementById("fileInput");
const uploadArea = document.getElementById("uploadArea");
const previewSection = document.getElementById("previewSection");
const fileName = document.getElementById("fileName");
const waveform = document.getElementById("waveform");
const playBtn = document.getElementById("playBtn");
const stopBtn = document.getElementById("stopBtn");
const volumeSlider = document.getElementById("volumeSlider");
const volumeValue = document.getElementById("volumeValue");
const timelineSlider = document.getElementById("timelineSlider");
const currentTime = document.getElementById("currentTime");
const totalTime = document.getElementById("totalTime");
const downloadBtn = document.getElementById("downloadBtn");
const filesList = document.getElementById("filesList");

let waveSurfer = null;
let currentFile = null;
let files = JSON.parse(localStorage.getItem("files") || "[]");

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function createWaveSurfer(url) {
  if (waveSurfer) {
    waveSurfer.destroy();
  }

  waveSurfer = WaveSurfer.create({
    container: waveform,
    height: 120,
    waveColor: "#4aa3ff",
    progressColor: "#1e6fd9",
    cursorColor: "#ffffff",
    barWidth: 2,
    barGap: 1,
    barRadius: 1,
    normalize: true,
    interact: true
  });

  waveSurfer.load(url);

  waveSurfer.on("ready", () => {
    const duration = waveSurfer.getDuration();
    totalTime.textContent = formatTime(duration);
    timelineSlider.max = duration;
  });

  waveSurfer.on("timeupdate", (time) => {
    currentTime.textContent = formatTime(time);
    if (!timelineSlider.matches(":active")) {
      timelineSlider.value = time;
    }
  });

  waveSurfer.on("finish", () => {
    playBtn.textContent = "▶ Play";
  });

  return waveSurfer;
}

function handleFile(file) {
  if (!file) return;

  currentFile = file;
  fileName.textContent = file.name;
  previewSection.style.display = "block";

  const url = URL.createObjectURL(file);
  createWaveSurfer(url);

  const fileData = {
    id: Date.now(),
    name: file.name,
    url: url,
    size: file.size,
    type: file.type,
    uploadDate: new Date().toISOString()
  };

  const existingIndex = files.findIndex(f => f.name === file.name);
  if (existingIndex >= 0) {
    if (files[existingIndex].url && files[existingIndex].url.startsWith("blob:")) {
      URL.revokeObjectURL(files[existingIndex].url);
    }
    files[existingIndex] = fileData;
  } else {
    files.push(fileData);
  }

  localStorage.setItem("files", JSON.stringify(files));
  renderFilesList();
}

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  handleFile(file);
});

uploadArea.addEventListener("click", () => {
  fileInput.click();
});

uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragover");
});

uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("dragover");
});

uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("audio/")) {
    fileInput.files = e.dataTransfer.files;
    handleFile(file);
  }
});

playBtn.addEventListener("click", () => {
  if (!waveSurfer) return;
  
  if (waveSurfer.isPlaying()) {
    waveSurfer.pause();
    playBtn.textContent = "▶ Play";
  } else {
    waveSurfer.play();
    playBtn.textContent = "⏸ Pause";
  }
});

stopBtn.addEventListener("click", () => {
  if (!waveSurfer) return;
  waveSurfer.stop();
  playBtn.textContent = "▶ Play";
  timelineSlider.value = 0;
  currentTime.textContent = "0:00";
});

volumeSlider.addEventListener("input", (e) => {
  const value = parseFloat(e.target.value);
  if (waveSurfer) {
    waveSurfer.setVolume(value);
  }
  volumeValue.textContent = `${Math.round(value * 100)}%`;
});

timelineSlider.addEventListener("input", (e) => {
  if (!waveSurfer) return;
  const time = parseFloat(e.target.value);
  const duration = waveSurfer.getDuration();
  waveSurfer.seekTo(time / duration);
  currentTime.textContent = formatTime(time);
});

downloadBtn.addEventListener("click", () => {
  if (!currentFile) return;
  
  const link = document.createElement("a");
  link.href = URL.createObjectURL(currentFile);
  link.download = currentFile.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

function renderFilesList() {
  filesList.innerHTML = "";
  
  if (files.length === 0) {
    filesList.innerHTML = '<p class="no-files">No files uploaded yet</p>';
    return;
  }

  const listTitle = document.createElement("h2");
  listTitle.textContent = "Uploaded Files";
  filesList.appendChild(listTitle);

  files.forEach(file => {
    const fileItem = document.createElement("div");
    fileItem.className = "file-item";
    
    fileItem.innerHTML = `
      <div class="file-details">
        <span class="file-name">${file.name}</span>
        <span class="file-size">${(file.size / 1024).toFixed(2)} KB</span>
      </div>
      <button class="load-btn" data-id="${file.id}">Load</button>
      <button class="play-file-btn" data-id="${file.id}">Play</button>
      <button class="download-file-btn" data-id="${file.id}">Download</button>
      <button class="delete-btn" data-id="${file.id}">Delete</button>
    `;

    const loadBtn = fileItem.querySelector(".load-btn");
    const playFileBtn = fileItem.querySelector(".play-file-btn");
    const downloadFileBtn = fileItem.querySelector(".download-file-btn");
    const deleteBtn = fileItem.querySelector(".delete-btn");

    loadBtn.addEventListener("click", () => {
      const fileData = files.find(f => f.id === file.id);
      if (!fileData) return;
      
      fileName.textContent = fileData.name;
      previewSection.style.display = "block";
      createWaveSurfer(fileData.url);
      
      fetch(fileData.url)
        .then(res => res.blob())
        .then(blob => {
          currentFile = new File([blob], fileData.name, { type: blob.type });
        });
    });

    playFileBtn.addEventListener("click", () => {
      const fileData = files.find(f => f.id === file.id);
      if (!fileData) return;
      
      const audio = new Audio(fileData.url);
      audio.play();
    });

    downloadFileBtn.addEventListener("click", () => {
      const fileData = files.find(f => f.id === file.id);
      if (!fileData) return;
      
      fetch(fileData.url)
        .then(res => res.blob())
        .then(blob => {
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = fileData.name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        });
    });

    deleteBtn.addEventListener("click", () => {
      const fileData = files.find(f => f.id === file.id);
      if (fileData && fileData.url && fileData.url.startsWith("blob:")) {
        URL.revokeObjectURL(fileData.url);
      }
      files = files.filter(f => f.id !== file.id);
      localStorage.setItem("files", JSON.stringify(files));
      renderFilesList();
    });

    filesList.appendChild(fileItem);
  });
}

renderFilesList();
