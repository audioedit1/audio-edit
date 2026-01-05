import WaveSurfer from 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js';

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
});

// =====================
// FILE UPLOAD
// =====================
const fileInput = document.getElementById('fileInput');

fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  // revoke previous object URL if any
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
document.getElementById('play').onclick = () => {
  waveSurfer.playPause();
};

document.getElementById('stop').onclick = () => {
  waveSurfer.stop();
};

// =====================
// DEBUG (OPTIONAL, SAFE)
// =====================
waveSurfer.on('ready', () => {
  console.log('WaveSurfer ready');
});

waveSurfer.on('seek', progress => {
  console.log('Seek:', progress);
});
