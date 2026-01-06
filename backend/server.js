const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = 3000;

// Enable CORS for frontend
app.use(cors());
app.use(express.json());

// Create necessary directories
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
const METADATA_FILE = path.join(DATA_DIR, 'sounds.json');

fs.ensureDirSync(UPLOADS_DIR);
fs.ensureDirSync(DATA_DIR);

// Initialize metadata file if it doesn't exist
if (!fs.existsSync(METADATA_FILE)) {
  fs.writeJsonSync(METADATA_FILE, []);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `audio-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/wave', 'audio/x-wav', 'audio/ogg', 'audio/webm'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  }
});

// Helper function to get audio duration (simplified - you might want to use a library like node-ffprobe)
function getAudioDuration(filePath) {
  // This is a placeholder - in production you'd want to use a library like node-ffprobe
  // For now, we'll return a default value and let the frontend handle it
  return 0;
}

// Load metadata
function loadMetadata() {
  try {
    return fs.readJsonSync(METADATA_FILE);
  } catch (error) {
    return [];
  }
}

// Save metadata
function saveMetadata(data) {
  fs.writeJsonSync(METADATA_FILE, data, { spaces: 2 });
}

// API Routes

// Get all sounds
app.get('/api/sounds', (req, res) => {
  try {
    const sounds = loadMetadata();
    res.json(sounds);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load sounds' });
  }
});

// Get a specific sound by ID
app.get('/api/sounds/:id', (req, res) => {
  try {
    const sounds = loadMetadata();
    const sound = sounds.find(s => s.id === parseInt(req.params.id));
    if (!sound) {
      return res.status(404).json({ error: 'Sound not found' });
    }
    res.json(sound);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load sound' });
  }
});

// Upload a new sound
app.post('/api/sounds', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const { title, category, tags, duration } = req.body;
    
    if (!title || !category) {
      // Clean up uploaded file if validation fails
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Title and category are required' });
    }

    const sounds = loadMetadata();
    const nextId = sounds.length > 0 ? Math.max(...sounds.map(s => s.id || 0)) + 1 : 1;
    
    const tagsArray = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];
    
    const newSound = {
      id: nextId,
      title,
      category,
      duration: duration || '0',
      tags: tagsArray,
      filename: req.file.filename,
      originalName: req.file.originalname,
      uploadDate: new Date().toISOString()
    };

    sounds.push(newSound);
    saveMetadata(sounds);

    res.status(201).json(newSound);
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message || 'Failed to upload sound' });
  }
});

// Delete a sound
app.delete('/api/sounds/:id', (req, res) => {
  try {
    const sounds = loadMetadata();
    const soundIndex = sounds.findIndex(s => s.id === parseInt(req.params.id));
    
    if (soundIndex === -1) {
      return res.status(404).json({ error: 'Sound not found' });
    }

    const sound = sounds[soundIndex];
    const filePath = path.join(UPLOADS_DIR, sound.filename);

    // Delete the file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Remove from metadata
    sounds.splice(soundIndex, 1);
    saveMetadata(sounds);

    res.json({ message: 'Sound deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete sound' });
  }
});

// Serve audio files
app.get('/api/audio/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(UPLOADS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio file not found' });
  }

  res.sendFile(filePath);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Audio Edit Backend Server running on http://localhost:${PORT}`);
  console.log(`Uploads directory: ${UPLOADS_DIR}`);
});
