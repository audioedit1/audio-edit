import WaveSurfer from 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js'
import RegionsPlugin from 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/regions.esm.js'

// =====================
// WAVESURFER INIT
// =====================
const waveSurfer = WaveSurfer.create({
  container: '#waveform',
  waveColor: '#4aa3ff',
  progressColor: '#1e6fd9',
  cursorColor: '#ffffff',
  height: 100,
  responsive: true,
  plugins: [
    RegionsPlugin.create({
      dragSelection: true,
    }),
  ],
})

// =====================
// FILE UPLOAD
// =====================
const fileInput = document.getElementById('fileInput')

fileInput.addEventListener('change', e => {
  const file = e.target.files[0]
  if (!file) return

  if (waveSurfer._objectUrl) {
    URL.revokeObjectURL(waveSurfer._objectUrl)
  }

  const url = URL.createObjectURL(file)
  waveSurfer._objectUrl = url
  waveSurfer.load(url)
})

// =====================
// TRANSPORT
// =====================
document.getElementById('play').onclick = () => {
  waveSurfer.playPause()
}

document.getElementById('stop').onclick = () => {
  waveSurfer.stop()
}

// =====================
// REGIONS EVENTS
// =====================
waveSurfer.on('region-created', region => {
  console.log('Region created:', region.start, region.end)
})

waveSurfer.on('region-updated', region => {
  console.log('Region updated:', region.start, region.end)
})

waveSurfer.on('region-clicked', (region, e) => {
  e.stopPropagation()
  region.play()
})
