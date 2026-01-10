// Shared WAV helpers used by editor + sample preview.

function readFourCC(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

export function getWavSampleRate(arrayBuffer) {
  try {
    if (!arrayBuffer || arrayBuffer.byteLength < 12) return null;
    const view = new DataView(arrayBuffer);

    const riff = readFourCC(view, 0);
    const wave = readFourCC(view, 8);
    if (riff !== "RIFF" || wave !== "WAVE") return null;

    // Walk chunks until we find the 'fmt ' chunk.
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

      // Chunks are padded to even sizes.
      const paddedSize = chunkSize + (chunkSize % 2);
      offset = chunkDataOffset + paddedSize;
    }

    return null;
  } catch {
    return null;
  }
}

export async function decodeToAudioBufferPreservingWavRate(arrayBuffer) {
  const wavSampleRate = getWavSampleRate(arrayBuffer);

  // Use a short-lived context to preserve WAV SR when possible.
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
