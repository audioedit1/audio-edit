import WaveSurfer from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js";
import RegionsPlugin from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/regions.esm.js";
import TimelinePlugin from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/timeline.esm.js";

// =====================
// WAVESURFER INIT
// =====================
const regions = RegionsPlugin.create();
const timeline = TimelinePlugin.create({
  container: "#timeline",
  timeInterval: 1,
  primaryLabelInterval: 5,
  secondaryLabelInterval: 1
});

const waveSurfer = WaveSurfer.create({
  container: "#waveform",
  height: 140,

  waveColor: "#4aa3ff",
  progressColor: "#1e6fd9",
  cursorColor: "#ffffff",

  normalize: false,
  fillParent: true,

  // maximum visual fidelity
  minPxPerSec: 5,
  barWidth: 1,
  barGap: 0,
  barRadius: 0,

  autoScroll: true,
  interact: true,
  plugins: [regions, timeline]
});

// Store decoded audio so export is reliable
let decodedBuffer = null;
let sourceDecodedBuffer = null;
waveSurfer.on("ready", () => {
  decodedBuffer = waveSurfer.getDecodedData?.() || decodedBuffer;
});
waveSurfer.on("decode", buffer => {
  decodedBuffer = buffer;
});

function getWavSampleRate(arrayBuffer) {
  try {
    if (!arrayBuffer || arrayBuffer.byteLength < 12) return null;
    const view = new DataView(arrayBuffer);

    const readFourCC = offset =>
      String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );

    const riff = readFourCC(0);
    const wave = readFourCC(8);
    if (riff !== "RIFF" || wave !== "WAVE") return null;

    // WAV is chunked. Don't assume fmt is at a fixed offset.
    // Walk chunks until we find the 'fmt ' chunk, then read sampleRate.
    let offset = 12;
    while (offset + 8 <= view.byteLength) {
      const chunkId = readFourCC(offset);
      const chunkSize = view.getUint32(offset + 4, true);
      const chunkDataOffset = offset + 8;

      if (chunkId === "fmt ") {
        if (chunkSize < 16 || chunkDataOffset + 16 > view.byteLength) return null;
        const sampleRate = view.getUint32(chunkDataOffset + 4, true);
        return Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : null;
      }

      // Chunks are padded to even sizes.
      const paddedSize = chunkSize + (chunkSize % 2);
      offset = chunkDataOffset + paddedSize;
    }

    return null;
  } catch {
    return null;
  }
}

async function decodeOriginalFileToBuffer(file) {
  const arrayBuffer = await file.arrayBuffer();
  const wavSampleRate = getWavSampleRate(arrayBuffer);

  const audioContext = wavSampleRate
    ? new AudioContext({ sampleRate: wavSampleRate })
    : new AudioContext();

  try {
    // Some browsers detach the ArrayBuffer during decode; pass a copy to be safe
    const copy = arrayBuffer.slice(0);
    const buffer = await audioContext.decodeAudioData(copy);
    return buffer;
  } finally {
    await audioContext.close();
  }
}

// =====================
// FILE LOAD
// =====================
const fileInput = document.getElementById("fileInput");
let originalFile = null;
let objectUrl = null;

// =====================
// SESSION SWITCHING (FRONTEND-ONLY, SINGLE-BUFFER)
// =====================
// Contract notes:
// - In-memory only (page lifetime)
// - Always one active buffer in WaveSurfer
// - Switching stops transport and clears regions
const sessionListEl = document.getElementById("sessionList");
const sessionEntries = [];
let activeSessionId = null;
let nextSessionId = 1;

function clearAllRegionsForSwitch() {
  try {
    Object.values(regions.getRegions?.() || {}).forEach(r => r.remove());
  } catch {
    // Best-effort only; regions must not carry over.
  }
}

function stopTransportForSwitch() {
  // Match Stop button semantics so region-out doesn't restart.
  userStopRequested = true;
  waveSurfer.stop();
  queueMicrotask(() => {
    userStopRequested = false;
  });
  syncTransportStatusLine();
}

function renderSessionList() {
  if (!sessionListEl) return;

  sessionListEl.textContent = "";

  if (!sessionEntries.length) {
    const li = document.createElement("li");
    li.className = "session__empty";
    li.textContent = "No files loaded yet.";
    sessionListEl.appendChild(li);
    return;
  }

  for (const entry of sessionEntries) {
    const li = document.createElement("li");
    li.className = "session__item";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "session__button";
    btn.textContent = entry.name;
    btn.dataset.sessionId = String(entry.id);

    const isActive = entry.id === activeSessionId;
    btn.setAttribute("aria-current", isActive ? "true" : "false");

    btn.addEventListener("click", () => {
      if (entry.id === activeSessionId) return;
      loadSessionEntry(entry);
    });

    li.appendChild(btn);
    sessionListEl.appendChild(li);
  }
}

function rememberFileInSession(file) {
  const entry = {
    id: nextSessionId++,
    name: file?.name || `Untitled-${Date.now()}`,
    file,
    url: URL.createObjectURL(file)
  };
  sessionEntries.push(entry);
  return entry;
}

function loadSessionEntry(entry) {
  if (!entry?.file || !entry?.url) return;

  // Reset phase-1 state: no carry-over.
  stopTransportForSwitch();
  clearAllRegionsForSwitch();

  originalFile = entry.file;
  sourceDecodedBuffer = null;

  // Keep a pointer for any legacy code paths; do NOT revoke here
  // because entries must remain switchable for the page lifetime.
  objectUrl = entry.url;
  waveSurfer.load(entry.url);

  decodeOriginalFileToBuffer(entry.file)
    .then(buffer => {
      sourceDecodedBuffer = buffer;
    })
    .catch(err => {
      console.error("Original decode error:", err);
      sourceDecodedBuffer = null;
    });

  activeSessionId = entry.id;
  renderSessionList();
}

window.addEventListener("beforeunload", () => {
  // Best-effort cleanup.
  for (const entry of sessionEntries) {
    try {
      if (entry?.url) URL.revokeObjectURL(entry.url);
    } catch {
      // ignore
    }
  }
});

fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  const entry = rememberFileInSession(file);
  activeSessionId = entry.id;
  renderSessionList();
  loadSessionEntry(entry);
});

// =====================
// TRANSPORT
// =====================
const playBtn = document.getElementById("play");
const stopBtn = document.getElementById("stop");

if (playBtn) playBtn.onclick = () => waveSurfer.playPause();

const loopToggleBtn = document.getElementById("loopToggle");
const loopStatusEl = document.getElementById("loopStatus");
const transportStatusEl = document.getElementById("transportStatus");

const volumeSliderEl = document.getElementById("volume");
const zoomSliderEl = document.getElementById("zoom");

const SESSION_KEYS = {
  loopEnabled: "transport.loopEnabled",
  volume: "transport.volume",
  zoom: "transport.zoom"
};

function setAriaDisabled(el, isDisabled) {
  if (!el) return;
  el.setAttribute("aria-disabled", isDisabled ? "true" : "false");
}

function readSessionString(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionString(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Ignore (privacy mode, storage disabled, etc.)
  }
}

function hasLoadedAudio() {
  const d = Number(waveSurfer.getDuration?.() || 0);
  return Number.isFinite(d) && d > 0;
}

let loopEnabled = false;

function syncTransportStatusLine() {
  const playing = Boolean(waveSurfer.isPlaying?.());
  const base = playing ? "Playing" : "Stopped";
  const loopText = loopEnabled ? "Loop armed" : "Loop off";

  if (transportStatusEl) {
    transportStatusEl.textContent = `${base} • ${loopText}`;
  }

  if (playBtn) {
    playBtn.setAttribute("aria-pressed", playing ? "true" : "false");
  }

  // UI-only dimming for actions that are meaningless without loaded audio.
  const canUseTransport = hasLoadedAudio();
  setAriaDisabled(playBtn, !canUseTransport);
  setAriaDisabled(stopBtn, !canUseTransport);
  setAriaDisabled(loopToggleBtn, !canUseTransport);
}

function syncLoopToggleLabel() {
  if (!loopToggleBtn) return;
  loopToggleBtn.textContent = loopEnabled ? "Loop: On (L)" : "Loop: Off (L)";
  loopToggleBtn.setAttribute("aria-pressed", loopEnabled ? "true" : "false");

  if (loopStatusEl) {
    loopStatusEl.textContent = loopEnabled ? "Loop armed" : "Loop off";
    loopStatusEl.dataset.state = loopEnabled ? "armed" : "off";
  }

  syncTransportStatusLine();
}

syncLoopToggleLabel();

if (loopToggleBtn) {
  loopToggleBtn.onclick = () => {
    loopEnabled = !loopEnabled;
    writeSessionString(SESSION_KEYS.loopEnabled, loopEnabled ? "1" : "0");
    syncLoopToggleLabel();
  };
}

document.addEventListener("keydown", e => {
  if (e.key !== "l" && e.key !== "L") return;

  const target = e.target;
  const active = document.activeElement;

  const targetIsEditable =
    (target instanceof HTMLElement &&
      (target.closest("input") || target.closest("textarea") || target.isContentEditable)) ||
    (active instanceof HTMLElement &&
      ((active.tagName === "INPUT") || (active.tagName === "TEXTAREA") || active.isContentEditable));

  if (targetIsEditable) return;

  loopToggleBtn?.click();
});

let userStopRequested = false;
if (stopBtn) {
  stopBtn.onclick = () => {
    // Prevent region looping logic from immediately restarting playback
    userStopRequested = true;
    waveSurfer.stop();
    queueMicrotask(() => {
      userStopRequested = false;
    });
    syncTransportStatusLine();
  };
}

// Keep Transport UI reflecting existing playback state.
waveSurfer.on("play", syncTransportStatusLine);
waveSurfer.on("pause", syncTransportStatusLine);
waveSurfer.on("finish", syncTransportStatusLine);
waveSurfer.on("ready", syncTransportStatusLine);

// Session-only preferences (no new behavior): store UI control values.
if (volumeSliderEl) {
  volumeSliderEl.addEventListener("input", () => {
    writeSessionString(SESSION_KEYS.volume, String(volumeSliderEl.value));
  });
}

if (zoomSliderEl) {
  zoomSliderEl.addEventListener("input", () => {
    writeSessionString(SESSION_KEYS.zoom, String(zoomSliderEl.value));
  });
}

// Deterministic restore within the same tab session.
queueMicrotask(() => {
  const loopStored = readSessionString(SESSION_KEYS.loopEnabled);
  if (loopStored === "0" || loopStored === "1") {
    loopEnabled = loopStored === "1";
  }

  const volumeStored = readSessionString(SESSION_KEYS.volume);
  if (volumeSliderEl && volumeStored != null) {
    const v = Number(volumeStored);
    if (Number.isFinite(v)) {
      volumeSliderEl.value = String(v);
      volumeSliderEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  const zoomStored = readSessionString(SESSION_KEYS.zoom);
  if (zoomSliderEl && zoomStored != null) {
    const z = Number(zoomStored);
    if (Number.isFinite(z)) {
      zoomSliderEl.value = String(z);
      zoomSliderEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  syncLoopToggleLabel();
});

// =====================
// VOLUME / MUTE (PREVIEW LEVEL)
// =====================
const volumeSlider = document.getElementById("volume");
const muteBtn = document.getElementById("mute");

let lastVolume = Number(volumeSlider.value);
let muted = false;

volumeSlider.oninput = e => {
  const value = Number(e.target.value);
  lastVolume = value;

  if (!muted) {
    waveSurfer.setVolume(value);
  }
};

muteBtn.onclick = () => {
  muted = !muted;

  if (muted) {
    waveSurfer.setVolume(0);
    muteBtn.textContent = "Unmute";
  } else {
    waveSurfer.setVolume(lastVolume);
    muteBtn.textContent = "Mute";
  }
};
// =====================
// ZOOM
// =====================
const zoomSlider = document.getElementById("zoom");

zoomSlider.oninput = e => {
  const sliderValue = Number(e.target.value);

  // push WaveSurfer to its ceiling
  const minZoom = 5;        // overview
  const maxZoom = 50000;    // extreme detail illusion

  const zoom =
    minZoom *
    Math.pow(maxZoom / minZoom, sliderValue / 100);

  waveSurfer.zoom(zoom);
};

// =====================
// REGIONS (SELECTION / CLIPS)
// =====================

// helper: remove all regions except one
function clearRegionsExcept(keepRegion) {
  Object.values(regions.getRegions()).forEach(r => {
    if (r !== keepRegion) r.remove();
  });
}

waveSurfer.on("ready", () => {
  regions.enableDragSelection({
    color: "rgba(74,163,255,0.3)"
  });
});

// keep only the newest region
regions.on("region-created", region => {
  clearRegionsExcept(region);
  region.loop = true;
});

// loop playback
regions.on("region-out", region => {
  // When stopping, WaveSurfer seeks (often to 0), which can trigger region-out.
  // Guard against that so Stop always stops.
  if (userStopRequested) return;
  if (!waveSurfer.isPlaying?.()) return;
  if (!loopEnabled) return;
  if (region.loop) region.play();
});

// =====================
// CLEAR REGION ON EMPTY WAVEFORM CLICK
// =====================
waveSurfer.on("click", () => {
  Object.values(regions.getRegions()).forEach(r => r.remove());
});

// =====================
// EXPORT AUDIO
// =====================
const exportBtn = document.getElementById("export");

function is24BitExportSelected() {
  return document.querySelector('input[name="exportBitDepth"]:checked')?.value === "24";
}

// Dormant alternative export/render path (default OFF).
// Scaffold only: do not use OfflineAudioContext yet (no nodes, no startRendering).
const EXPORT_OFFLINE_RENDER = false;

async function exportAudio() {
  if (!waveSurfer.getDuration()) {
    alert("Please load an audio file first.");
    return;
  }

  try {
    // Prefer decoding the original file (best fidelity), then fall back to WaveSurfer's decoded buffer
    const audioBuffer = sourceDecodedBuffer || decodedBuffer || waveSurfer.getDecodedData?.();
    
    if (!audioBuffer) {
      // Fallback: export original file if buffer not available
      if (originalFile) {
        const url = URL.createObjectURL(originalFile);
        const a = document.createElement("a");
        a.href = url;
        a.download = originalFile.name || `exported-audio-${Date.now()}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }
      alert("Audio data not available yet. Please wait for the waveform to finish loading.");
      return;
    }

    // Export selection rule (locked):
    // - If exactly one region exists, export that region
    // - If no region exists, export the full buffer
    // Any other case (e.g. multiple regions) exports the full buffer.
    const existingRegions = Object.values(regions.getRegions?.() || {});
    let bufferToExport;

    if (existingRegions.length === 0) {
      bufferToExport = audioBuffer;
    } else if (existingRegions.length === 1) {
      const region = existingRegions[0];
      const startSeconds = Number(region?.start ?? 0);
      const endSeconds = Number(region?.end ?? 0);

      const durationSeconds = audioBuffer.duration;
      const safeStart = Math.max(0, Math.min(durationSeconds, startSeconds));
      const safeEnd = Math.max(0, Math.min(durationSeconds, endSeconds));
      const startTime = Math.min(safeStart, safeEnd);
      const endTime = Math.max(safeStart, safeEnd);

      const startFrame = Math.max(0, Math.min(audioBuffer.length, Math.floor(startTime * audioBuffer.sampleRate)));
      const endFrame = Math.max(0, Math.min(audioBuffer.length, Math.floor(endTime * audioBuffer.sampleRate)));
      const frameCount = Math.max(0, endFrame - startFrame);

      if (frameCount > 0) {
        const sliced = new AudioBuffer({
          length: frameCount,
          numberOfChannels: audioBuffer.numberOfChannels,
          sampleRate: audioBuffer.sampleRate
        });

        for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
          const src = audioBuffer.getChannelData(ch);
          const dst = sliced.getChannelData(ch);
          dst.set(src.subarray(startFrame, endFrame));
        }

        bufferToExport = sliced;
      } else {
        bufferToExport = audioBuffer;
      }
    } else {
      bufferToExport = audioBuffer;
    }

    // Export-only fades (preview playback remains unchanged because we don't mutate WaveSurfer buffers)
    // Default behavior stays identical.
    // - 16-bit path: uses OfflineAudioContext only when EXPORT_OFFLINE_RENDER is enabled
    // - 24-bit path: always routes through OfflineAudioContext (do not reapply fades manually)
    const export24Bit = is24BitExportSelected();

    if (EXPORT_OFFLINE_RENDER || export24Bit) {
      bufferToExport = await renderWithOfflineAudioContext(bufferToExport);
    } else {
      // Apply a short linear fade-in/out to avoid clicks at export boundaries.
      {
        const fadeMs = 5;
        const fadeSamplesRequested = Math.floor((bufferToExport.sampleRate * fadeMs) / 1000);
        const fadeSamples = Math.max(
          0,
          Math.min(fadeSamplesRequested, Math.floor(bufferToExport.length / 2))
        );

        if (fadeSamples > 0) {
          const faded = new AudioBuffer({
            length: bufferToExport.length,
            numberOfChannels: bufferToExport.numberOfChannels,
            sampleRate: bufferToExport.sampleRate
          });

          const denom = fadeSamples - 1;
          for (let ch = 0; ch < bufferToExport.numberOfChannels; ch++) {
            const src = bufferToExport.getChannelData(ch);
            const dst = faded.getChannelData(ch);
            dst.set(src);

            // Fade-in
            for (let i = 0; i < fadeSamples; i++) {
              const gain = denom > 0 ? i / denom : 0;
              dst[i] *= gain;
            }

            // Fade-out
            for (let i = 0; i < fadeSamples; i++) {
              const gain = denom > 0 ? (denom - i) / denom : 0;
              const idx = bufferToExport.length - fadeSamples + i;
              dst[idx] *= gain;
            }
          }

          bufferToExport = faded;
        }
      }
    }

    // Convert AudioBuffer to WAV
  // Default path stays 16-bit PCM WAV with TPDF dither.
  // 24-bit path uses OfflineAudioContext render (above) and has no dither.
  const wav = export24Bit ? audioBufferToWav24(bufferToExport) : audioBufferToWav(bufferToExport);
    const blob = new Blob([wav], { type: "audio/wav" });
    const url = URL.createObjectURL(blob); 
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `exported-audio-${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Export error:", error);
    alert("Failed to export audio: " + error.message);
  }
}

// Helper: Convert AudioBuffer to WAV format
function audioBufferToWav(buffer) {
  const length = buffer.length; // sample-frames per channel
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2; // PCM16
  const blockAlign = numberOfChannels * bytesPerSample; 
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const fileSize = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(fileSize);
  const view = new DataView(arrayBuffer);

  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // audio format (1 = PCM)
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Convert audio data
  const channels = Array.from({ length: numberOfChannels }, (_, ch) => buffer.getChannelData(ch));
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numberOfChannels; ch++) {
      // Export-only TPDF dither (±1 LSB) applied immediately before int16 quantization.
      // Triangular PDF from two independent uniforms; no noise shaping.
      const tpdf = (Math.random() + Math.random() - 1) * (1 / 32768);
      const sample = Math.max(-1, Math.min(1, channels[ch][i] + tpdf));
      const int16 = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

// Helper: Convert AudioBuffer to 24-bit PCM WAV format (no dither)
function audioBufferToWav24(buffer) {
  const length = buffer.length; // sample-frames per channel
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 3; // PCM24
  const blockAlign = numberOfChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const fileSize = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(fileSize);
  const view = new DataView(arrayBuffer);

  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // audio format (1 = PCM)
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 24, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Convert audio data
  const channels = Array.from({ length: numberOfChannels }, (_, ch) => buffer.getChannelData(ch));
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      let int24 = sample < 0 ? Math.round(sample * 0x800000) : Math.round(sample * 0x7fffff);
      int24 = Math.max(-0x800000, Math.min(0x7fffff, int24));

      // Write signed 24-bit little-endian
      view.setUint8(offset, int24 & 0xff);
      view.setUint8(offset + 1, (int24 >> 8) & 0xff);
      view.setUint8(offset + 2, (int24 >> 16) & 0xff);
      offset += 3;
    }
  }

  return arrayBuffer;
}

// OfflineAudioContext render path used for export-only fades when enabled.
// This intentionally does not affect preview playback (export uses a rendered copy).
async function renderWithOfflineAudioContext(buffer) {
  // Keep fade duration and linear shape identical to the existing export-only fade.
  const fadeMs = 5;
  const sampleRate = buffer.sampleRate;
  const fadeSamplesRequested = Math.floor((sampleRate * fadeMs) / 1000);
  const fadeSamples = Math.max(0, Math.min(fadeSamplesRequested, Math.floor(buffer.length / 2)));

  // Nothing to do for extremely short buffers.
  if (fadeSamples <= 1) return buffer;

  const denom = fadeSamples - 1;
  const fadeInEndTime = denom / sampleRate;
  const fadeOutStartTime = (buffer.length - fadeSamples) / sampleRate;
  const fadeOutEndTime = (buffer.length - 1) / sampleRate;

  const offline = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;

  const gain = offline.createGain();
  source.connect(gain);
  gain.connect(offline.destination);

  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(1, fadeInEndTime);
  gain.gain.setValueAtTime(1, fadeOutStartTime);
  gain.gain.linearRampToValueAtTime(0, fadeOutEndTime);

  source.start(0);
  return await offline.startRendering();
}

exportBtn.onclick = exportAudio;

// =====================
// EXPORT UX (WRAPPER ONLY — DO NOT TOUCH exportAudio)
// =====================

const exportStatusEl = document.getElementById("exportStatus");
let isExporting = false;
let exportStatusClearTimer = null;

function setExportStatus(state, message) {
  if (!exportStatusEl) return;

  const normalizedState = state || "";
  const normalizedMessage = message == null ? "" : String(message);

  exportStatusEl.dataset.state = normalizedState;
  exportStatusEl.textContent = normalizedMessage || "Idle";

  if (normalizedState === "running") {
    exportStatusEl.setAttribute("aria-busy", "true");
  } else {
    exportStatusEl.removeAttribute("aria-busy");
  }

  if (exportStatusClearTimer) {
    clearTimeout(exportStatusClearTimer);
    exportStatusClearTimer = null;
  }
}

function scheduleClearStatus(delayMs) {
  if (!exportStatusEl) return;
  if (exportStatusClearTimer) clearTimeout(exportStatusClearTimer);

  exportStatusClearTimer = setTimeout(() => {
    setExportStatus("", "");
  }, delayMs);
}

async function runExportWithUI() {
  if (isExporting) return;
  isExporting = true;

  exportBtn.disabled = true;
  setExportStatus("running", "Rendering...");

  // exportAudio() uses alert() for some failure/info cases and catches its own errors.
  // To provide clear UX without touching export logic, we observe alert messages.
  const originalAlert = window.alert;
  let sawAlert = false;
  let lastAlertMessage = "";

  window.alert = message => {
    sawAlert = true;
    lastAlertMessage = String(message ?? "");
    originalAlert(message);
  };

  try {
    await exportAudio();

    if (sawAlert) {
      const msg = lastAlertMessage;
      const isFailure = /Failed to export audio/i.test(msg);
      const isInfo = /Please load an audio file first\.|Audio data not available yet\./i.test(msg);

      if (isFailure) {
        setExportStatus("error", "Export failed");
      } else if (isInfo) {
        setExportStatus("", "");
      } else {
        // Unknown alert text; treat as non-success but don’t invent details.
        setExportStatus("", "");
      }
    } else {
      setExportStatus("success", "Exported");
      scheduleClearStatus(4000);
    }
  } catch (err) {
    console.error("Export wrapper error:", err);
    setExportStatus("error", "Export failed");
  } finally {
    window.alert = originalAlert;
    exportBtn.disabled = false;
    isExporting = false;
  }
}

// Override the earlier handler without modifying the EXPORT AUDIO section.
exportBtn.onclick = runExportWithUI;

// Sample Library preview system is implemented in `sample-preview.js`.
// This block is intentionally disabled here to keep the editor audio engine
// (above) frozen and to ensure preview playback meets the Preview–Export
// Equivalence Tests (v1.0), including gapless AudioBufferSourceNode looping.

// =====================
// PHASE-1: EDITOR BIN + INSPECTOR (UI + STATE ONLY)
// =====================
// Contract constraints:
// - Metadata only (id, name, url, duration, SR, channels, loudness text)
// - No WaveSurfer interaction
// - No AudioContext usage
// - No preview/export coupling

const LIBRARY_ADD_EVENT = "library:add-to-editor";
const EDITOR_BIN_CHANGED_EVENT = "editor:bin-changed";

const editorBinListEl = document.getElementById("editorBinList");
const editorInspectorEl = document.getElementById("editorInspector");

const editorState = {
  bin: [],
  selectedSampleId: null
};

function formatDurationMmSs(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function safeText(value) {
  return value == null ? "" : String(value);
}

function emitBinChanged() {
  const ids = editorState.bin.map(s => s.id);
  window.dispatchEvent(new CustomEvent(EDITOR_BIN_CHANGED_EVENT, { detail: { ids } }));
}

function renderEditorBin() {
  if (!editorBinListEl) return;

  editorBinListEl.textContent = "";

  if (!editorState.bin.length) {
    const li = document.createElement("li");
    li.className = "editor-bin__empty";
    li.textContent = "No samples added yet.";
    editorBinListEl.appendChild(li);
    return;
  }

  for (const sample of editorState.bin) {
    const li = document.createElement("li");
    li.className = "editor-bin__item";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "editor-bin__button";
    btn.dataset.sampleId = safeText(sample.id);

    const isSelected = sample.id === editorState.selectedSampleId;
    btn.setAttribute("aria-current", isSelected ? "true" : "false");

    const name = document.createElement("span");
    name.className = "editor-bin__name";
    name.textContent = safeText(sample.name || sample.id);

    const meta = document.createElement("span");
    meta.className = "editor-bin__meta";

    const durationText = Number.isFinite(Number(sample.durationSec))
      ? formatDurationMmSs(sample.durationSec)
      : "–";
    const srText = Number.isFinite(Number(sample.sampleRate)) ? `${Number(sample.sampleRate)} Hz` : "–";
    const chText = Number.isFinite(Number(sample.channels)) ? `${Number(sample.channels)} ch` : "–";
    const loudText = safeText(sample.loudnessText || "").trim() || "–";

    meta.textContent = `${durationText} • ${srText} • ${chText} • ${loudText}`;

    btn.appendChild(name);
    btn.appendChild(meta);

    btn.addEventListener("click", () => {
      editorState.selectedSampleId = sample.id;
      renderEditorBin();
      renderEditorInspector();
    });

    li.appendChild(btn);
    editorBinListEl.appendChild(li);
  }
}

function renderEditorInspector() {
  if (!editorInspectorEl) return;

  editorInspectorEl.textContent = "";

  const selected = editorState.bin.find(s => s.id === editorState.selectedSampleId) || null;
  if (!selected) {
    const empty = document.createElement("div");
    empty.className = "inspector__empty";
    empty.textContent = "No selection.";
    editorInspectorEl.appendChild(empty);
    return;
  }

  const title = document.createElement("h4");
  title.className = "inspector__name";
  title.textContent = safeText(selected.name || selected.id);
  editorInspectorEl.appendChild(title);

  const metaList = document.createElement("ul");
  metaList.className = "inspector__meta";

  const fields = [
    ["ID", selected.id],
    ["URL", selected.url],
    ["Duration", Number.isFinite(Number(selected.durationSec)) ? `${formatDurationMmSs(selected.durationSec)}` : "–"],
    ["Sample Rate", Number.isFinite(Number(selected.sampleRate)) ? `${Number(selected.sampleRate)} Hz` : "–"],
    ["Channels", Number.isFinite(Number(selected.channels)) ? `${Number(selected.channels)}` : "–"],
    ["Loudness", safeText(selected.loudnessText || "").trim() || "–"]
  ];

  for (const [label, value] of fields) {
    const li = document.createElement("li");
    li.textContent = `${label}: ${safeText(value)}`;
    metaList.appendChild(li);
  }

  editorInspectorEl.appendChild(metaList);

  const placeholders = document.createElement("div");
  placeholders.className = "inspector__placeholder";
  placeholders.innerHTML = `
    <div><strong>Gain</strong> (coming soon)</div>
    <div><strong>Meter</strong> (coming soon)</div>
  `;
  editorInspectorEl.appendChild(placeholders);
}

function addSampleToEditorBin(sampleMeta) {
  if (!sampleMeta || typeof sampleMeta !== "object") return;

  const id = safeText(sampleMeta.id).trim();
  if (!id) return;

  const existing = editorState.bin.find(s => s.id === id) || null;
  if (existing) {
    // Duplicate add: ignore, but select the existing item for clear UI feedback.
    editorState.selectedSampleId = existing.id;
    renderEditorBin();
    renderEditorInspector();
    emitBinChanged();
    return;
  }

  const entry = {
    id,
    name: safeText(sampleMeta.name).trim(),
    url: safeText(sampleMeta.url).trim(),
    durationSec: Number(sampleMeta.durationSec),
    sampleRate: Number(sampleMeta.sampleRate),
    channels: Number(sampleMeta.channels),
    loudnessText: safeText(sampleMeta.loudnessText)
  };

  editorState.bin.push(entry);
  editorState.selectedSampleId = entry.id;

  renderEditorBin();
  renderEditorInspector();
  emitBinChanged();
}

window.addEventListener(LIBRARY_ADD_EVENT, e => {
  addSampleToEditorBin(e?.detail);
});

// Initial render.
renderEditorBin();
renderEditorInspector();
