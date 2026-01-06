import WaveSurfer from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js";

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const resultsContainer = document.getElementById("results");

let activePlayer = null;

const mockResults = [
  { id: 1, title: "Deep House Loop", genre: "House", bpm: 128, duration: "4:32", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
  { id: 2, title: "Jazz Piano", genre: "Jazz", bpm: 120, duration: "3:15", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
  { id: 3, title: "Rock Drums", genre: "Rock", bpm: 140, duration: "2:48", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
  { id: 4, title: "Ambient Pad", genre: "Ambient", bpm: 90, duration: "5:12", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3" },
  { id: 5, title: "Hip Hop Beat", genre: "Hip Hop", bpm: 95, duration: "3:30", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3" },
  { id: 6, title: "Techno Bass", genre: "Techno", bpm: 130, duration: "4:00", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3" },
  { id: 7, title: "Acoustic Guitar", genre: "Folk", bpm: 110, duration: "3:45", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3" },
  { id: 8, title: "Synth Lead", genre: "Electronic", bpm: 125, duration: "2:20", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3" }
];

function filterResults(query) {
  if (!query.trim()) return mockResults;
  const lowerQuery = query.toLowerCase();
  return mockResults.filter(item => 
    item.title.toLowerCase().includes(lowerQuery) ||
    item.genre.toLowerCase().includes(lowerQuery)
  );
}

function stopActivePlayer() {
  if (activePlayer) {
    activePlayer.pause();
    activePlayer = null;
  }
}

function createPlayer(audioUrl, container) {
  const player = WaveSurfer.create({
    container: container,
    height: 80,
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
        <span class="duration">${item.duration}</span>
      </div>
    </div>
    <div id="${waveformId}" class="waveform-container"></div>
    <div class="card-controls">
      <button class="play-btn" data-id="${item.id}">▶ Play</button>
      <button class="stop-btn" data-id="${item.id}">⏹ Stop</button>
    </div>
  `;

  const playBtn = card.querySelector(".play-btn");
  const stopBtn = card.querySelector(".stop-btn");
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
    resultsContainer.innerHTML = '<div class="no-results">No results found</div>';
    return;
  }

  results.forEach(item => {
    const card = createResultCard(item);
    resultsContainer.appendChild(card);
  });
}

function performSearch() {
  const query = searchInput.value;
  const results = filterResults(query);
  renderResults(results);
}

searchBtn.addEventListener("click", performSearch);
searchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    performSearch();
  }
});

renderResults(mockResults);
