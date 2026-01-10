// =====================
// SAMPLE PREVIEW AUDIO SYSTEM (ISOLATED)
// =====================
// Contract constraints:
// - Separate AudioContext.
// - No access to editor WaveSurfer instances or internals.
// - No export logic.
// - Validation-only instrumentation may observe editor-exported WAV blobs.

const EXPORT_WAV_MIME = "audio/wav";

// Isolation: preview system owns its own AudioContext.
// Note: sampleRate is device/default. When decoding WAV, we attempt to preserve source SR.
let previewAudioContext = null;

// Cache decoded (and export-equivalent-faded) buffers by src URL.
const decodedCache = new Map();

// Track all active preview controllers for stop-all behavior.
const controllers = new Set();

// Track last user-initiated preview to associate with export captures.
let lastArmedPreview = null;

// Track last captured editor export blob (validation-only, short-lived).
let lastCapturedExport = null;

// =====================
// LIBRARY PREVIEW PANEL (UI ONLY)
// =====================
// Contract constraints:
// - No changes to playback logic
// - No new audio processing beyond reading already-decoded preview buffers
// - No meters, gain, pan, or metadata panels

const LIBRARY_PREVIEW_LANES_ID = "libraryPreviewLanes";

function getLibraryPreviewLanesEl() {
  return document.getElementById(LIBRARY_PREVIEW_LANES_ID);
}

function channelLabel(index, totalChannels) {
  if (totalChannels === 1) return "";
  if (totalChannels === 2) return index === 0 ? "L" : "R";
  return `Ch ${index + 1}`;
}

function ensureLaneDom(lanesEl, channelIndex, totalChannels) {
  const lane = document.createElement("div");
  lane.className = "library-preview__lane";

  const label = document.createElement("div");
  label.className = "library-preview__label";
  label.textContent = channelLabel(channelIndex, totalChannels);

  const canvas = document.createElement("canvas");
  canvas.className = "library-preview__canvas";
  canvas.dataset.channelIndex = String(channelIndex);

  lane.appendChild(label);
  lane.appendChild(canvas);
  lanesEl.appendChild(lane);

  return canvas;
}

function resizeCanvasToCssPixels(canvas) {
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

  const targetW = cssW * dpr;
  const targetH = cssH * dpr;

  if (canvas.width !== targetW) canvas.width = targetW;
  if (canvas.height !== targetH) canvas.height = targetH;

  return { dpr };
}

function drawWaveformLane(canvas, samples) {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) return;

  const { dpr } = resizeCanvasToCssPixels(canvas);
  const w = canvas.width;
  const h = canvas.height;

  ctx2d.clearRect(0, 0, w, h);

  // Neutral waveform color.
  ctx2d.fillStyle = "#7a7a7a";

  const mid = Math.floor(h / 2);
  const len = samples.length;
  if (!len) return;

  // One vertical line per pixel column.
  const step = Math.max(1, Math.floor(len / w));

  for (let x = 0; x < w; x++) {
    const start = x * step;
    if (start >= len) break;
    const end = Math.min(len, start + step);

    let min = 1;
    let max = -1;
    for (let i = start; i < end; i++) {
      const v = samples[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }

    const y1 = mid - Math.floor(max * (mid - 1));
    const y2 = mid - Math.floor(min * (mid - 1));
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);

    // 1px wide bar; align to device pixels.
    ctx2d.fillRect(x, top, 1, Math.max(1, bottom - top));
  }

  // Keep consistent sharpness when dpr > 1.
  void dpr;
}

let lastRenderedPreviewBuffer = null;
let previewResizeObserver = null;

function renderLibraryPreviewFromBuffer(audioBuffer) {
  const lanesEl = getLibraryPreviewLanesEl();
  if (!lanesEl) return;
  if (!audioBuffer) return;

  lastRenderedPreviewBuffer = audioBuffer;

  // Rebuild lanes to match channel count.
  lanesEl.textContent = "";
  const channels = Math.max(1, Number(audioBuffer.numberOfChannels) || 1);

  const canvases = [];
  for (let ch = 0; ch < channels; ch++) {
    canvases.push(ensureLaneDom(lanesEl, ch, channels));
  }

  // Draw all lanes with time-aligned x mapping.
  for (let ch = 0; ch < channels; ch++) {
    try {
      const data = audioBuffer.getChannelData(ch);
      drawWaveformLane(canvases[ch], data);
    } catch {
      // best-effort
    }
  }

  // Re-render on resize (UI only).
  if (!previewResizeObserver) {
    previewResizeObserver = new ResizeObserver(() => {
      if (!lastRenderedPreviewBuffer) return;
      renderLibraryPreviewFromBuffer(lastRenderedPreviewBuffer);
    });
    previewResizeObserver.observe(lanesEl);
  }
}

function ensurePreviewAudioContext() {
  if (!previewAudioContext || previewAudioContext.state === "closed") {
    previewAudioContext = new AudioContext();
  }
  return previewAudioContext;
}

function dbFromAmplitude(value) {
  const v = Math.max(0, Number(value) || 0);
  if (v === 0) return -Infinity;
  return 20 * Math.log10(v);
}

function absMax(values) {
  let max = 0;
  for (let i = 0; i < values.length; i++) {
    const a = Math.abs(values[i]);
    if (a > max) max = a;
  }
  return max;
}

function rms(values) {
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    sumSq += v * v;
  }
  return Math.sqrt(sumSq / Math.max(1, values.length));
}

function computeMetrics(audioBuffer) {
  const numberOfChannels = audioBuffer.numberOfChannels;

  let peak = 0;
  let rmsAll = 0;

  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    const p = absMax(data);
    const r = rms(data);
    if (p > peak) peak = p;
    rmsAll += r * r;
  }

  const rmsCombined = Math.sqrt(rmsAll / Math.max(1, numberOfChannels));

  return {
    sampleRate: audioBuffer.sampleRate,
    length: audioBuffer.length,
    duration: audioBuffer.duration,
    channels: numberOfChannels,
    peak,
    peakDb: dbFromAmplitude(peak),
    rms: rmsCombined,
    rmsDb: dbFromAmplitude(rmsCombined)
  };
}

function cloneToPreviewContextBuffer(ctx, sourceBuffer) {
  const cloned = ctx.createBuffer(
    sourceBuffer.numberOfChannels,
    sourceBuffer.length,
    sourceBuffer.sampleRate
  );

  for (let ch = 0; ch < sourceBuffer.numberOfChannels; ch++) {
    cloned.copyToChannel(sourceBuffer.getChannelData(ch), ch);
  }

  return cloned;
}

function readFourCC(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function getWavSampleRate(arrayBuffer) {
  try {
    if (!arrayBuffer || arrayBuffer.byteLength < 12) return null;
    const view = new DataView(arrayBuffer);

    const riff = readFourCC(view, 0);
    const wave = readFourCC(view, 8);
    if (riff !== "RIFF" || wave !== "WAVE") return null;

    let offset = 12;
    while (offset + 8 <= view.byteLength) {
      const chunkId = readFourCC(view, offset);
      const chunkSize = view.getUint32(offset + 4, true);
      const chunkDataOffset = offset + 8;

      if (chunkId === "fmt ") {
        if (chunkSize < 16 || chunkDataOffset + 16 > view.byteLength) return null;
        const sampleRate = view.getUint32(chunkDataOffset + 4, true);
        return Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : null;
      }

      const paddedSize = chunkSize + (chunkSize % 2);
      offset = chunkDataOffset + paddedSize;
    }

    return null;
  } catch {
    return null;
  }
}

async function decodeToAudioBufferPreservingWavRate(arrayBuffer) {
  const wavSampleRate = getWavSampleRate(arrayBuffer);

  // Create a temporary decoding context with the WAV sample rate when available.
  // This is isolated and short-lived.
  const decodingContext = wavSampleRate
    ? new AudioContext({ sampleRate: wavSampleRate })
    : new AudioContext();

  try {
    const copy = arrayBuffer.slice(0);
    return await decodingContext.decodeAudioData(copy);
  } finally {
    try {
      await decodingContext.close();
    } catch {
      // best-effort
    }
  }
}

async function fetchAndDecodeSample(src) {
  const cached = decodedCache.get(src);
  if (cached) return cached;

  const resp = await fetch(src);
  if (!resp.ok) {
    throw new Error(`Failed to fetch sample: ${resp.status} ${resp.statusText}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  const decoded = await decodeToAudioBufferPreservingWavRate(arrayBuffer);

  // Preview must represent the raw sample exactly as-is.
  // No fades, smoothing, normalization, or conditioning is permitted.
  const ctx = ensurePreviewAudioContext();
  const previewBuffer = cloneToPreviewContextBuffer(ctx, decoded);

  const entry = {
    src,
    rawDecoded: decoded,
    previewBuffer
  };

  decodedCache.set(src, entry);
  return entry;
}

function stopAllPreviews(except) {
  controllers.forEach(controller => {
    if (controller !== except) controller.stop();
  });
}

function findFirstAudioSource(cardEl) {
  const attrCandidates = [
    "data-preview-src",
    "data-audio-src",
    "data-src",
    "data-url"
  ];

  for (const attr of attrCandidates) {
    const value = cardEl.getAttribute(attr);
    if (value) return value;
  }

  const link = cardEl.querySelector("a[href]");
  if (link?.getAttribute("href")) return link.getAttribute("href");

  return null;
}

function pickCardControls(cardEl) {
  const actionButtons = Array.from(cardEl.querySelectorAll(".sample-card__actions button"));
  const playBtn = cardEl.querySelector("[data-preview-play]") || actionButtons[0] || null;
  const stopBtn = cardEl.querySelector("[data-preview-stop]") || actionButtons[1] || null;

  const loopInput =
    cardEl.querySelector("[data-preview-loop]") ||
    cardEl.querySelector('.sample-card__meta input[type="checkbox"]') ||
    null;

  const durationEl = cardEl.querySelector(".sample-card__duration") || null;

  return { playBtn, stopBtn, loopInput, durationEl };
}

function formatMmSs(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function wireSampleCard(cardEl) {
  const src = findFirstAudioSource(cardEl);
  if (!src) return null;

  const { playBtn, stopBtn, loopInput, durationEl } = pickCardControls(cardEl);
  if (!playBtn && !stopBtn) return null;

  const ctx = ensurePreviewAudioContext();

  let loaded = false;
  let playing = false;

  let previewBuffer = null;

  // Playback state for pause/resume without timers.
  let currentSource = null;
  let startedAt = 0;
  let offsetSeconds = 0;

  function currentPlaybackPositionSeconds() {
    if (!playing) return offsetSeconds;
    const elapsed = ctx.currentTime - startedAt;
    const duration = previewBuffer?.duration || 0;

    if (duration > 0 && (loopInput?.checked)) {
      const pos = (offsetSeconds + elapsed) % duration;
      return pos;
    }

    return Math.min(duration, offsetSeconds + elapsed);
  }

  function syncPlayButton() {
    if (!playBtn) return;
    playBtn.textContent = playing ? "Pause" : "Play";
  }

  function cleanupSource() {
    if (!currentSource) return;
    try {
      currentSource.onended = null;
      currentSource.stop(0);
    } catch {
      // best-effort
    }
    try {
      currentSource.disconnect();
    } catch {
      // best-effort
    }
    currentSource = null;
  }

  function stop(resetOffset = true) {
    if (playing) {
      offsetSeconds = currentPlaybackPositionSeconds();
    }

    playing = false;
    cleanupSource();

    if (resetOffset) offsetSeconds = 0;
    syncPlayButton();
  }

  function startPlayback(fromSeconds) {
    if (!previewBuffer) return;

    cleanupSource();

    const source = ctx.createBufferSource();
    source.buffer = previewBuffer;

    const shouldLoop = Boolean(loopInput?.checked);
    if (shouldLoop) {
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = previewBuffer.duration;
    } else {
      source.loop = false;
    }

    source.connect(ctx.destination);

    startedAt = ctx.currentTime;
    offsetSeconds = Math.max(0, Math.min(previewBuffer.duration, Number(fromSeconds) || 0));

    // Keep this deterministic: no fades beyond what is baked into previewBuffer.
    source.start(0, offsetSeconds);

    currentSource = source;
    playing = true;
    syncPlayButton();

    source.onended = () => {
      // If looping, onended should not fire.
      if (source !== currentSource) return;
      playing = false;
      offsetSeconds = 0;
      currentSource = null;
      syncPlayButton();
    };
  }

  async function ensureLoaded() {
    if (loaded) return;

    const entry = await fetchAndDecodeSample(src);
    previewBuffer = entry.previewBuffer;

    // UI-only: update the fixed library preview panel when a buffer is available.
    renderLibraryPreviewFromBuffer(previewBuffer);

    if (durationEl) {
      durationEl.textContent = formatMmSs(previewBuffer.duration);
    }

    loaded = true;
  }

  async function togglePlayPause() {
    stopAllPreviews(controller);

    try {
      await ctx.resume();
    } catch {
      // best-effort
    }

    await ensureLoaded();

    if (playing) {
      // Pause
      stop(false);

      // Arm validation association.
      lastArmedPreview = {
        src,
        previewBuffer,
        armedAt: Date.now()
      };

      // If we already captured an export, attempt validation now.
      maybeValidateAgainstLastExport();
      return;
    }

    // Play/resume
    startPlayback(offsetSeconds);
  }

  // Validation rule: toggling loop while playing should restart from same position.
  function onLoopChange() {
    if (!previewBuffer) return;
    if (!playing) return;

    const pos = currentPlaybackPositionSeconds();
    startPlayback(pos);
  }

  const controller = {
    stop() {
      stop(true);
    },
    destroy() {
      stop(true);
      controllers.delete(controller);
    }
  };

  controllers.add(controller);

  if (playBtn) {
    playBtn.addEventListener("click", () => {
      togglePlayPause().catch(err => {
        console.error("Sample preview play error:", err);
      });
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      stop(true);

      // Arm validation association.
      if (previewBuffer) {
        lastArmedPreview = {
          src,
          previewBuffer,
          armedAt: Date.now()
        };
        maybeValidateAgainstLastExport();
      }
    });
  }

  if (loopInput) {
    loopInput.addEventListener("change", () => {
      onLoopChange();
    });
  }

  return controller;
}

function isWavBlob(blob) {
  if (!blob) return false;
  if (blob.type && blob.type.toLowerCase() === EXPORT_WAV_MIME) return true;

  // Some browsers may omit type; treat unknown as not-wav.
  return false;
}

function installExportBlobObserver() {
  const originalCreateObjectURL = URL.createObjectURL.bind(URL);

  URL.createObjectURL = object => {
    try {
      if (object instanceof Blob && isWavBlob(object)) {
        // Validation-only capture; do not modify the blob.
        lastCapturedExport = {
          blob: object,
          capturedAt: Date.now()
        };

        // Attempt validation if a preview was recently armed.
        maybeValidateAgainstLastExport();
      }
    } catch (err) {
      console.warn("Sample preview export observer error:", err);
    }

    return originalCreateObjectURL(object);
  };

  window.addEventListener("beforeunload", () => {
    try {
      URL.createObjectURL = originalCreateObjectURL;
    } catch {
      // best-effort
    }
  });
}

function withinMs(ts, maxAgeMs) {
  if (!ts) return false;
  return Date.now() - ts <= maxAgeMs;
}

async function decodeExportBlobToAudioBuffer(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const decoded = await decodeToAudioBufferPreservingWavRate(arrayBuffer);

  // Convert decoded buffer into our preview context (so comparisons are apples-to-apples).
  const ctx = ensurePreviewAudioContext();
  return cloneToPreviewContextBuffer(ctx, decoded);
}

function metricDiffDb(aDb, bDb) {
  if (!Number.isFinite(aDb) || !Number.isFinite(bDb)) {
    // If both are -Infinity (silence), treat as equal.
    if (aDb === -Infinity && bDb === -Infinity) return 0;
    return Infinity;
  }
  return Math.abs(aDb - bDb);
}

function logValidationResult(result) {
  const prefix = result.pass ? "[SamplePreview] PASS" : "[SamplePreview] FAIL";
  const details = {
    src: result.src,
    peakDiffDb: result.peakDiffDb,
    rmsDiffDb: result.rmsDiffDb,
    preview: result.preview,
    export: result.export
  };

  if (result.pass) {
    console.log(prefix, details);
  } else {
    console.warn(prefix, details);
  }
}

let validationInFlight = false;

function maybeValidateAgainstLastExport() {
  if (validationInFlight) return;

  // Only validate when both sides are present and recent.
  if (!lastArmedPreview?.previewBuffer) return;
  if (!lastCapturedExport?.blob) return;

  // Require recent association to avoid accidental mismatches.
  if (!withinMs(lastArmedPreview.armedAt, 60_000)) return;
  if (!withinMs(lastCapturedExport.capturedAt, 60_000)) return;

  validationInFlight = true;

  (async () => {
    const src = lastArmedPreview.src;

    try {
      const exportBuffer = await decodeExportBlobToAudioBuffer(lastCapturedExport.blob);

      // Compare metrics against the preview buffer that is used for playback.
      const previewMetrics = computeMetrics(lastArmedPreview.previewBuffer);
      const exportMetrics = computeMetrics(exportBuffer);

      const peakDiffDb = metricDiffDb(previewMetrics.peakDb, exportMetrics.peakDb);
      const rmsDiffDb = metricDiffDb(previewMetrics.rmsDb, exportMetrics.rmsDb);

      // A1 tolerances (human-approved)
      const pass = peakDiffDb <= 0.1 && rmsDiffDb <= 0.2;

      logValidationResult({
        pass,
        src,
        peakDiffDb,
        rmsDiffDb,
        preview: previewMetrics,
        export: exportMetrics
      });

      // Clear captured data to prevent persistence/leaks.
      lastCapturedExport = null;
      lastArmedPreview = null;

      if (!pass) {
        console.warn(
          "[SamplePreview] Preview–export equivalence outside tolerance. " +
            "Per contract, this must be flagged. Export is not blocked (forbidden)."
        );
      }

      console.log(
        "[SamplePreview] LUFS check skipped (not implemented reliably)."
      );
    } catch (err) {
      console.warn("[SamplePreview] Validation failed; cannot prove equivalence.", err);

      // Clear captured data to prevent persistence/leaks.
      lastCapturedExport = null;
      lastArmedPreview = null;
    } finally {
      validationInFlight = false;
    }
  })();
}

function boot() {
  // Keep this system fully isolated and disposable.
  installExportBlobObserver();

  const sampleCards = Array.from(document.querySelectorAll(".sample-grid .sample-card"));
  sampleCards.forEach(cardEl => {
    try {
      wireSampleCard(cardEl);
    } catch (err) {
      console.error("Sample preview init error:", err);
    }
  });

  window.addEventListener("beforeunload", () => {
    controllers.forEach(controller => {
      controller.stop();
      controller.destroy();
    });

    try {
      previewAudioContext?.close();
    } catch {
      // best-effort
    }

    decodedCache.clear();
    lastCapturedExport = null;
    lastArmedPreview = null;

    try {
      previewResizeObserver?.disconnect();
    } catch {
      // best-effort
    }
    previewResizeObserver = null;
    lastRenderedPreviewBuffer = null;
  });
}

boot();
