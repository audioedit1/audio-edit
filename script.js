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
// CLEAR REGION ON EMPTY WAVEFORM CLICK
// =====================
waveSurfer.on("click", () => {
  Object.values(regions.getRegions()).forEach(r => r.remove());
});

// =====================
// RENDER / EXPORT
// =====================
const renderBtn = document.getElementById("render");

renderBtn.onclick = async () => {
  const audioBuffer = waveSurfer.getDecodedData();
  if (!audioBuffer) return;

  const regionList = Object.values(regions.getRegions());
  const hasRegion = regionList.length > 0;

  const startTime = hasRegion ? regionList[0].start : 0;
  const endTime = hasRegion ? regionList[0].end : audioBuffer.duration;

  const sampleRate = audioBuffer.sampleRate;
  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.floor(endTime * sampleRate);
  const frameCount = endSample - startSample;

  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    frameCount,
    sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0, startTime, endTime - startTime);

  const renderedBuffer = await offlineCtx.startRendering();

  const wavBlob = bufferToWav(renderedBuffer);
  const url = URL.createObjectURL(wavBlob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "render.wav";
  a.click();

  URL.revokeObjectURL(url);
};

// =====================
// WAV ENCODERS
// 32-bit float / 24-bit dither / 16-bit dither
// =====================

function bufferToWav32Float(buffer) {
  return encodeWav(buffer, "float32");
}

function bufferToWav24BitDither(buffer) {
  return encodeWav(buffer, "pcm24-dither");
}

function bufferToWav16BitDither(buffer) {
  return encodeWav(buffer, "pcm16-dither");
}

// =====================
// CORE WAV ENCODER
// =====================
function encodeWav(buffer, mode) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;

  let bytesPerSample;
  let formatTag;
  let bitDepth;

  if (mode === "float32") {
    bytesPerSample = 4;
    formatTag = 3; // IEEE float
    bitDepth = 32;
  } else if (mode === "pcm24-dither") {
    bytesPerSample = 3;
    formatTag = 1; // PCM
    bitDepth = 24;
  } else {
    bytesPerSample = 2;
    formatTag = 1; // PCM
    bitDepth = 16;
  }

  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);
  let offset = 0;

  function writeString(str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset++, str.charCodeAt(i));
    }
  }

  // RIFF
  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeString("WAVE");

  // fmt
  writeString("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, formatTag, true);
  offset += 2;
  view.setUint16(offset, numChannels, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, byteRate, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, bitDepth, true);
  offset += 2;

  // data
  writeString("data");
  view.setUint32(offset, dataSize, true);
  offset += 4;

  // write samples
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = buffer.getChannelData(ch)[i];

      if (formatTag === 3) {
        // 32-bit float
        view.setFloat32(offset, sample, true);
        offset += 4;
      } else {
        // PCM with TPDF dither
        const dither =
          (Math.random() - Math.random()) *
          (1 / (1 << (bitDepth - 1)));

        sample = Math.max(-1, Math.min(1, sample + dither));

        if (bitDepth === 24) {
          let intSample = Math.round(sample * 0x7fffff);
          view.setUint8(offset++, intSample & 0xff);
          view.setUint8(offset++, (intSample >> 8) & 0xff);
          view.setUint8(offset++, (intSample >> 16) & 0xff);
        } else {
          view.setInt16(
            offset,
            Math.round(sample * 0x7fff),
            true
          );
          offset += 2;
        }
      }
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}
