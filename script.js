import WaveSurfer from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js";

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const categoryFilter = document.getElementById("categoryFilter");
const durationFilter = document.getElementById("durationFilter");
const resultsContainer = document.getElementById("results");
const uploadBtn = document.getElementById("uploadBtn");
const uploadModal = document.getElementById("uploadModal");
const closeModal = document.getElementById("closeModal");
const uploadForm = document.getElementById("uploadForm");
const libraryBtn = document.getElementById("libraryBtn");

let sounds = JSON.parse(localStorage.getItem("sounds") || "[]");
let activePlayer = null;
let nextId = Math.max(0, ...sounds.map(s => s.id || 0)) + 1;

if (sounds.length === 0) {
  sounds = [
    { id: 1, title: "Door Creak", category: "Foley", duration: "2.3", tags: ["door", "creak", "wood"], url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", uploadDate: new Date().toISOString() },
    { id: 2, title: "Forest Ambience", category: "Ambience", duration: "45.2", tags: ["forest", "nature", "birds"], url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", uploadDate: new Date().toISOString() },
    { id: 3, title: "Button Click", category: "UI", duration: "0.3", tags: ["ui", "click", "button"], url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", uploadDate: new Date().toISOString() },
    { id: 4, title: "Rain Drops", category: "Nature", duration: "12.5", tags: ["rain", "water", "weather"], url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", uploadDate: new Date().toISOString() },
    { id: 5, title: "Car Engine", category: "Vehicle", duration: "8.7", tags: ["car", "engine", "vehicle"], url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3", uploadDate: new Date().toISOString() },
    { id: 6, title: "Footsteps", category: "Foley", duration: "3.2", tags: ["footsteps", "walking", "foley"], url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3", uploadDate: new Date().toISOString() },
    { id: 7, title: "Dog Bark", category: "Animal", duration: "1.1", tags: ["dog", "bark", "animal"], url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3", uploadDate: new Date().toISOString() },
    { id: 8, title: "Typewriter", category: "Mechanical", duration: "5.4", tags: ["typewriter", "mechanical", "typing"], url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3", uploadDate: new Date().toISOString() }
  ];
  localStorage.setItem("sounds", JSON.stringify(sounds));
}

function stopActivePlayer() {
  if (activePlayer) {
    activePlayer.pause();
    activePlayer = null;
  }
}

function getDurationCategory(duration) {
  const dur = parseFloat(duration);
  if (dur < 5) return "short";
  if (dur < 30) return "medium";
  return "long";
}

function formatDuration(seconds) {
  const dur = parseFloat(seconds);
  if (dur < 60) {
    return `${dur.toFixed(1)}s`;
  }
  const mins = Math.floor(dur / 60);
  const secs = Math.floor(dur % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function filterSounds(query, category, duration) {
  let filtered = sounds;

  if (query.trim()) {
    const lowerQuery = query.toLowerCase();
    filtered = filtered.filter(item => {
      const titleMatch = item.title.toLowerCase().includes(lowerQuery);
      const tagMatch = item.tags && item.tags.some(tag => tag.toLowerCase().includes(lowerQuery));
      return titleMatch || tagMatch;
    });
  }

  if (category) {
    filtered = filtered.filter(item => item.category === category);
  }

  if (duration) {
    filtered = filtered.filter(item => {
      const itemDuration = getDurationCategory(item.duration);
      return itemDuration === duration;
    });
  }

  return filtered;
}

function createPlayer(audioUrl, container) {
  const player = WaveSurfer.create({
    container: container,
    height: 70,
    waveColor: "#6366f1",
    progressColor: "#4f46e5",
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
  const tagsHtml = item.tags ? item.tags.map(tag => `<span class="tag">${tag}</span>`).join("") : "";
  
  card.innerHTML = `
    <div class="card-header">
      <div class="card-title-row">
        <h3>${item.title}</h3>
        <span class="duration-badge">${formatDuration(item.duration)}</span>
      </div>
      <div class="card-meta">
        <span class="category">${item.category}</span>
        ${tagsHtml ? `<div class="tags">${tagsHtml}</div>` : ""}
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
    resultsContainer.innerHTML = '<div class="no-results">No sound effects found</div>';
    return;
  }

  results.forEach(item => {
    const card = createResultCard(item);
    resultsContainer.appendChild(card);
  });
}

function performSearch() {
  const query = searchInput.value;
  const category = categoryFilter.value;
  const duration = durationFilter.value;
  const results = filterSounds(query, category, duration);
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
  const category = document.getElementById("uploadCategory").value;
  const tagsInput = document.getElementById("uploadTags").value;
  const file = document.getElementById("uploadFile").files[0];
  
  if (!file) return;
  
  const duration = await getAudioDuration(file);
  const url = URL.createObjectURL(file);
  const tags = tagsInput ? tagsInput.split(",").map(t => t.trim()).filter(t => t) : [];
  
  const newSound = {
    id: nextId++,
    title,
    category,
    duration: duration.toString(),
    tags,
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

libraryBtn.addEventListener("click", () => {
  searchInput.value = "";
  categoryFilter.value = "";
  durationFilter.value = "";
  renderResults(sounds);
});

searchBtn.addEventListener("click", performSearch);
searchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    performSearch();
  }
});

categoryFilter.addEventListener("change", performSearch);
durationFilter.addEventListener("change", performSearch);

renderResults(sounds);
