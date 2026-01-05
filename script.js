import WaveSurfer from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js";
import RegionsPlugin from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/regions.esm.js";
import TimelinePlugin from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/timeline.esm.js";

let frozenDecodedBuffer = null;

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

fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

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
  // Freeze decoded buffer for offline render
  frozenDecodedBuffer = waveSurfer.getDecodedData();

  regions.enableDragSelection({
    color: "rgba(74,163,255,0.3)",
    minLength: 0
  });
});

regions.on("region-created", region => {
  clearRegionsExcept(region);
});

// DAW-style loop: do NOT mutate region
regions.on("region-out", region => {
  waveSurfer.play(region.start, region.end);
});

// =====================
// CLEAR REGION ON EMPTY WAVEFORM CLICK
// =====================
waveSurfer.on("click", () => {
  Object.values(regions.getRegions()).forEach(r => r.remove());
});

// =====================
// EXPORT / BOUNCE
// =====================
const exportBtn = document.getElementById("export");

exportBtn.onclick = () => {
  const regionList = Object.values(regions.getRegions());

  if (regionList.length !== 1) {
    alert("Please select exactly one region to export.");
    return;
  }

  const region = regionList[0];
  const buffer = frozenDecodedBuffer;


  if (!buffer) {
    alert("Audio not ready.");
    return;
  }

  const sampleRate = buffer.sampleRate;
  const channelCount = buffer.numberOfChannels;

  let startSample = Math.floor(region.start * sampleRate);
  let endSample   = Math.floor(region.end * sampleRate);

  startSample = Math.max(0, startSample);
  endSample   = Math.min(buffer.length, endSample);

  const length = endSample - startSample;

  if (length <= 0) {
    alert("Invalid region length.");
    return;
  }

  // ---- DIRECT WAV ENCODE (NO AudioBuffer) ----
  const wavBlob = encodeWavFromRegion(
    buffer,
    startSample,
    length
  );

  const url = URL.createObjectURL(wavBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "export.wav";
  a.click();
  URL.revokeObjectURL(url);
};

// =====================
// WAV ENCODER (PCM 16-bit)
// =====================
function encodeWavFromRegion(buffer, startSample, length) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;

  // 16-bit PCM
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);
  let offset = 0;

  function writeString(str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset++, str.charCodeAt(i));
    }
  }

  function writeUint32(value) {
    view.setUint32(offset, value, true);
    offset += 4;
  }

  function writeUint16(value) {
    view.setUint16(offset, value, true);
    offset += 2;
  }

  // ---- RIFF HEADER ----
  writeString("RIFF");
  writeUint32(36 + dataSize);
  writeString("WAVE");

  // ---- fmt CHUNK ----
  writeString("fmt ");
  writeUint32(16);              // PCM
  writeUint16(1);               // format = PCM
  writeUint16(numChannels);
  writeUint32(sampleRate);
  writeUint32(sampleRate * blockAlign);
  writeUint16(blockAlign);
  writeUint16(16);              // bits per sample

  // ---- data CHUNK ----
  writeString("data");
  writeUint32(dataSize);

  // ---- PCM DATA ----
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = buffer.getChannelData(ch)[startSample + i];

      // clamp
      sample = Math.max(-1, Math.min(1, sample));

      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}
