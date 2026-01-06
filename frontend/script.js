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

// #region agent log
fetch('http://127.0.0.1:7242/ingest/0d41191a-b265-4eaf-961d-e6c56c64f590',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:12',message:'DOM elements initialized',data:{uploadBtnExists:!!uploadBtn,uploadModalExists:!!uploadModal,uploadFormExists:!!uploadForm},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion

const API_BASE_URL = 'http://localhost:3000/api';

let sounds = [];
let activePlayer = null;

// Load sounds from backend
async function loadSounds() {
  try {
    const response = await fetch(`${API_BASE_URL}/sounds`);
    if (response.ok) {
      const data = await response.json();
      sounds = data.map(sound => ({
        ...sound,
        url: `${API_BASE_URL}/audio/${sound.filename}` // Generate URL from backend
      }));
      renderResults(sounds);
    } else {
      console.error('Failed to load sounds:', response.statusText);
      renderResults([]);
    }
  } catch (error) {
    console.error('Error loading sounds:', error);
    renderResults([]);
  }
}

// Initialize by loading sounds from backend
loadSounds();

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
  link.download = `${sound.title}${sound.originalName ? sound.originalName.substring(sound.originalName.lastIndexOf('.')) : '.mp3'}`;
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0d41191a-b265-4eaf-961d-e6c56c64f590',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:202',message:'getAudioDuration called',data:{fileName:file?.name,fileSize:file?.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    const audio = new Audio();
    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;
    audio.onloadedmetadata = () => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0d41191a-b265-4eaf-961d-e6c56c64f590',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:207',message:'Audio metadata loaded',data:{duration:audio.duration},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      resolve(audio.duration);
      URL.revokeObjectURL(objectUrl);
    };
    audio.onerror = (err) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0d41191a-b265-4eaf-961d-e6c56c64f590',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:210',message:'Audio load error',data:{error:err?.message || 'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      resolve(0);
    };
  });
}

uploadForm.addEventListener("submit", async (e) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/0d41191a-b265-4eaf-961d-e6c56c64f590',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:214',message:'Form submit event fired',data:{formExists:!!uploadForm},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  e.preventDefault();
  
  const title = document.getElementById("uploadTitle").value;
  const category = document.getElementById("uploadCategory").value;
  const tagsInput = document.getElementById("uploadTags").value;
  const file = document.getElementById("uploadFile").files[0];
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/0d41191a-b265-4eaf-961d-e6c56c64f590',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:222',message:'Form data extracted',data:{title,category,hasFile:!!file,fileName:file?.name,fileSize:file?.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  
  if (!file) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0d41191a-b265-4eaf-961d-e6c56c64f590',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:225',message:'No file selected - early return',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    alert('Please select an audio file');
    return;
  }
  
  try {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0d41191a-b265-4eaf-961d-e6c56c64f590',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:228',message:'Starting getAudioDuration',data:{fileName:file.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    const duration = await getAudioDuration(file);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0d41191a-b265-4eaf-961d-e6c56c64f590',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:229',message:'getAudioDuration completed',data:{duration},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    // Create FormData for file upload
    const formData = new FormData();
    formData.append('audio', file);
    formData.append('title', title);
    formData.append('category', category);
    formData.append('tags', tagsInput);
    formData.append('duration', duration.toString());
    
    // Upload to backend
    const response = await fetch(`${API_BASE_URL}/sounds`, {
      method: 'POST',
      body: formData
    });
    
    if (response.ok) {
      const newSound = await response.json();
      // Add URL to the sound object
      newSound.url = `${API_BASE_URL}/audio/${newSound.filename}`;
      
      // Reload sounds from backend
      await loadSounds();
      
      uploadModal.style.display = "none";
      uploadForm.reset();
    } else {
      const error = await response.json();
      alert(`Upload failed: ${error.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Upload error:', error);
    alert('Failed to upload audio file. Please check if the backend server is running.');
  }
});

uploadBtn.addEventListener("click", () => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/0d41191a-b265-4eaf-961d-e6c56c64f590',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:246',message:'Upload button clicked',data:{uploadBtnExists:!!uploadBtn,uploadModalExists:!!uploadModal},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  uploadModal.style.display = "flex";
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/0d41191a-b265-4eaf-961d-e6c56c64f590',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'script.js:249',message:'Modal display set',data:{display:uploadModal.style.display},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
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

// Initial render will be handled by loadSounds()
