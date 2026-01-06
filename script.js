import WaveSurfer from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js";

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const genreFilter = document.getElementById("genreFilter");
const bpmFilter = document.getElementById("bpmFilter");
const resultsContainer = document.getElementById("results");
const uploadBtn = document.getElementById("uploadBtn");
const uploadModal = document.getElementById("uploadModal");
const closeModal = document.getElementById("closeModal");
const uploadForm = document.getElementById("uploadForm");

let sounds = JSON.parse(localStorage.getItem("sounds") || "[]");
let activePlayer = null;
let nextId = Math.max(0, ...sounds.map(s => s.id || 0)) + 1;

if (sounds.length === 0) {
  sounds = [
    { id: 1, title: "Deep House Loop", genre: "House", bpm: 128, duration: "4:32", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", uploadDate: new Date().toISOString() },
    { id: 2, title: "Jazz Piano", genre: "Jazz", bpm: 120, duration: "3:15", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", uploadDate: new Date().toISOString() },
    { id: 3, title: "Rock Drums", genre: "Rock", bpm: 140, duration: "2:48", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", uploadDate: new Date().toISOString() },
    { id: 4, title: "Ambient Pad", genre: "Ambient", bpm: 90, duration: "5:12", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", uploadDate: new Date().toISOString() },
    { id: 5, title: "Hip Hop Beat", genre: "Hip Hop", bpm: 95, duration: "3:30", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3", uploadDate: new Date().toISOString() },
    { id: 6, title: "Techno Bass", genre: "Techno", bpm: 130, duration: "4:00", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3", uploadDate: new Date().toISOString() }
  ];
  localStorage.setItem("sounds", JSON.stringify(sounds));
}

function stopActivePlayer() {
  if (activePlayer) {
    activePlayer.pause();
    activePlayer = null;
  }
}

function getBpmRange(bpm) {
  if (bpm < 90) return "60-90";
  if (bpm < 120) return "90-120";
  if (bpm < 140) return "120-140";
  return "140+";
}

function filterSounds(query, genre, bpm) {
  let filtered = sounds;

  if (query.trim()) {
    const lowerQuery = query.toLowerCase();
    filtered = filtered.filter(item => 
      item.title.toLowerCase().includes(lowerQuery) ||
      item.genre.toLowerCase().includes(lowerQuery)
    );
  }

  if (genre) {
    filtered = filtered.filter(item => item.genre === genre);
  }

  if (bpm) {
    filtered = filtered.filter(item => {
      const itemBpmRange = getBpmRange(item.bpm);
      return itemBpmRange === bpm;
    });
  }

  return filtered;
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function createPlayer(audioUrl, container) {
  const player = WaveSurfer.create({
    container: container,
    height: 60,
    waveColor: "#4aa3ff",
    progressColor: "#1e6fd9",
    cursorColor: "#ffffff",
    barWidth: 2,
    barGap: 1,
    barRadius: 1,
    normalize: true,
    interact: true
  });

  player.load(audioUrl);
  return player;
}

function downloadSound(sound) {
  const link = document.createElement("a");
  link.href = sound.url;
  link.download = `${sound.title}.mp3`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function createResultCard(item) {
  const card = document.createElement("div");
  card.className = "result-card";
  
  const waveformId = `waveform-${item.id}`;
  
  card.innerHTML = `
    <div class="card-header">
      <h3>${item.title}</h3>
      <div class="meta">
        <span class="genre">${item.genre}</span>
        <span class="bpm">${item.bpm} BPM</span>
        <span class="duration">${item.duration || "N/A"}</span>
      </div>
    </div>
    <div id="${waveformId}" class="waveform-container"></div>
    <div class="card-controls">
      <button class="play-btn" data-id="${item.id}">▶ Play</button>
      <button class="stop-btn" data-id="${item.id}">⏹ Stop</button>
      <button class="download-btn" data-id="${item.id}">⬇ Download</button>
    </div>
  `;

  const playBtn = card.querySelector(".play-btn");
  const stopBtn = card.querySelector(".stop-btn");
  const downloadBtn = card.querySelector(".download-btn");
  const waveformContainer = card.querySelector(`#${waveformId}`);
  
  let player = null;
  let isPlaying = false;

  player = createPlayer(item.url, waveformContainer);

  playBtn.addEventListener("click", () => {
    if (isPlaying) {
      player.pause();
      playBtn.textContent = "▶ Play";
      isPlaying = false;
      activePlayer = null;
    } else {
      stopActivePlayer();
      player.play();
      playBtn.textContent = "⏸ Pause";
      isPlaying = true;
      activePlayer = player;
    }
  });

  stopBtn.addEventListener("click", () => {
    player.stop();
    playBtn.textContent = "▶ Play";
    isPlaying = false;
    activePlayer = null;
  });

  downloadBtn.addEventListener("click", () => {
    downloadSound(item);
  });

  player.on("finish", () => {
    playBtn.textContent = "▶ Play";
    isPlaying = false;
    activePlayer = null;
  });

  return card;
}

function renderResults(results) {
  resultsContainer.innerHTML = "";
  
  if (results.length === 0) {
    resultsContainer.innerHTML = '<div class="no-results">No sounds found</div>';
    return;
  }

  results.forEach(item => {
    const card = createResultCard(item);
    resultsContainer.appendChild(card);
  });
}

function performSearch() {
  const query = searchInput.value;
  const genre = genreFilter.value;
  const bpm = bpmFilter.value;
  const results = filterSounds(query, genre, bpm);
  renderResults(results);
}

function getAudioDuration(file) {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.src = URL.createObjectURL(file);
    audio.onloadedmetadata = () => {
      resolve(audio.duration);
      URL.revokeObjectURL(audio.src);
    };
    audio.onerror = () => resolve(0);
  });
}

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const title = document.getElementById("uploadTitle").value;
  const genre = document.getElementById("uploadGenre").value;
  const bpm = parseInt(document.getElementById("uploadBpm").value);
  const file = document.getElementById("uploadFile").files[0];
  
  if (!file) return;
  
  const duration = await getAudioDuration(file);
  const durationStr = formatDuration(duration);
  const url = URL.createObjectURL(file);
  
  const newSound = {
    id: nextId++,
    title,
    genre,
    bpm,
    duration: durationStr,
    url,
    uploadDate: new Date().toISOString()
  };
  
  sounds.push(newSound);
  localStorage.setItem("sounds", JSON.stringify(sounds));
  
  uploadModal.style.display = "none";
  uploadForm.reset();
  performSearch();
});

uploadBtn.addEventListener("click", () => {
  uploadModal.style.display = "flex";
});

closeModal.addEventListener("click", () => {
  uploadModal.style.display = "none";
});

uploadModal.addEventListener("click", (e) => {
  if (e.target === uploadModal) {
    uploadModal.style.display = "none";
  }
});

searchBtn.addEventListener("click", performSearch);
searchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    performSearch();
  }
});

genreFilter.addEventListener("change", performSearch);
bpmFilter.addEventListener("change", performSearch);

renderResults(sounds);
