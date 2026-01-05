import WaveSurfer from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js";
import RegionsPlugin from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/regions.esm.js";
import TimelinePlugin from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/timeline.esm.js";

// =====================
// OFFLINE DECODE (EXPORT SOURCE)
// =====================
let exportAudioContext = null;
let originalDecodedBuffer = null;

function ensureExportContext() {
  if (!exportAudioContext) {
    exportAudioContext = new AudioContext();
  }
  if (exportAudioContext.state === "suspended") {
    exportAudioContext.resume();
  }
}

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

fileInput.addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;

  ensureExportContext();

  if (waveSurfer._objectUrl) {
    URL.revokeObjectURL(waveSurfer._objectUrl);
  }

  const url = URL.createObjectURL(file);
  waveSurfer._objectUrl = url;
  waveSurfer.load(url);

  // DAW-SAFE decode (export source of truth)
  const arrayBuffer = await file.arrayBuffer();
  originalDecodedBuffer = await exportAudioContext.decodeAudioData(arrayBuffer);

  console.log("EXPORT BUFFER OK", {
    sampleRate: originalDecodedBuffer.sampleRate,
    duration: originalDecodedBuffer.duration,
    length: originalDecodedBuffer.length
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
function clearRegionsExcept(keep) {
  Object.values(regions.getRegions()).forEach(r => {
    if (r !== keep) r.remove();
  });
}

waveSurfer.on("ready", () => {
  regions.enableDragSelection({
    color: "rgba(74,163,255,0.3)",
    minLength: 0.05 // ⬅ PREVENT MICRO-REGIONS (50ms)
  });
});

regions.on("region-created", r => {
  clearRegionsExcept(r);
  console.log("REGION CREATED", {
    start: r.start,
    end: r.end,
    duration: r.end - r.start
  });
});

// DAW-style loop playback only
regions.on("region-out", r => {
  waveSurfer.play(r.start, r.end);
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
    console.log("NO REGION");
    return;
  }

  const region = regionList[0];
  const buffer = originalDecodedBuffer;

  console.log("BUFFER STATE", {
    exists: !!buffer,
    duration: buffer?.duration,
    sampleRate: buffer?.sampleRate
  });

  const startSample = Math.floor(region.start * buffer.sampleRate);
  const endSample = Math.floor(region.end * buffer.sampleRate);

  console.log("SLICE INFO", {
    regionStart: region.start,
    regionEnd: region.end,
    startSample,
    endSample,
    length: endSample - startSample
  });

  const testSlice = buffer
    .getChannelData(0)
    .slice(startSample, endSample);

  console.log("SLICE RESULT", {
    sliceLength: testSlice.length,
    firstSamples: testSlice.slice(0, 10)
  });
};


// =====================
// WAV ENCODER (PCM 16-bit)
// =====================
function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2 + 44;
  const arrayBuffer = new ArrayBuffer(length);
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

  writeString("RIFF");
  writeUint32(length - 8);
  writeString("WAVE");
  writeString("fmt ");
  writeUint32(16);
  writeUint16(1);
  writeUint16(numChannels);
  writeUint32(sampleRate);
  writeUint32(sampleRate * numChannels * 2);
  writeUint16(numChannels * 2);
  writeUint16(16);
  writeString("data");
  writeUint32(length - offset - 4);

  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = buffer.getChannelData(ch)[i];
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
      offset += 2;
    }
  }

  return new Blob([view], { type: "audio/wav" });
}
