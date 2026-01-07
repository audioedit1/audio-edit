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
    if (!arrayBuffer || arrayBuffer.byteLength < 28) return null;
    const view = new DataView(arrayBuffer);
    const riff = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    );
    const wave = String.fromCharCode(
      view.getUint8(8),
      view.getUint8(9),
      view.getUint8(10),
      view.getUint8(11)
    );
    if (riff !== "RIFF" || wave !== "WAVE") return null;
    const sampleRate = view.getUint32(24, true);
    return Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : null;
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

fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  originalFile = file;
  sourceDecodedBuffer = null;

  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  waveSurfer.load(objectUrl);

  // Option B: decode the original upload ourselves for highest-fidelity export
  decodeOriginalFileToBuffer(file)
    .then(buffer => {
      sourceDecodedBuffer = buffer;
    })
    .catch(err => {
      console.error("Original decode error:", err);
      sourceDecodedBuffer = null;
    });
});

// =====================
// TRANSPORT
// =====================
document.getElementById("play").onclick = () => waveSurfer.playPause();
document.getElementById("stop").onclick = () => waveSurfer.stop();

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

    // Convert AudioBuffer to WAV
    const wav = audioBufferToWav(audioBuffer);
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
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const int16 = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

exportBtn.onclick = exportAudio;