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
  });
}

boot();
