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

// =====================
// FILE LOAD
// =====================
const fileInput = document.getElementById("fileInput");
let originalFile = null;

fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  originalFile = file;

  if (waveSurfer._objectUrl) {
    URL.revokeObjectURL(waveSurfer._objectUrl);
  }

  const url = URL.createObjectURL(file);
  waveSurfer._objectUrl = url;
  waveSurfer.load(url);
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
    // Get decoded audio data from WaveSurfer backend
    const backend = waveSurfer.getBackend();
    const audioBuffer = backend?.getDecodedData?.() || backend?.buffer;
    
    if (!audioBuffer) {
      // Fallback: export original file if buffer not available
      if (originalFile) {
        const url = URL.createObjectURL(originalFile);
        const a = document.createElement("a");
        a.href = url;
        a.download = originalFile.name || `exported-audio-${Date.now()}.${originalFile.name.split('.').pop() || 'wav'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }
      alert("Audio data not available. Please wait for the file to load completely.");
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
  const length = buffer.length;
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = numberOfChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const bufferSize = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, bufferSize - 8, true);
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
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

exportBtn.onclick = exportAudio;