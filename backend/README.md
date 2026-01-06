# Audio Edit Backend

Backend server for the Audio Edit application that handles audio file uploads and storage.

## Setup Instructions

1. **Install Dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Start the Server**
   ```bash
   npm start
   ```

   The server will run on `http://localhost:3000`

## API Endpoints

- `GET /api/sounds` - Get all audio files metadata
- `GET /api/sounds/:id` - Get a specific audio file metadata
- `POST /api/sounds` - Upload a new audio file
- `DELETE /api/sounds/:id` - Delete an audio file
- `GET /api/audio/:filename` - Serve an audio file
- `GET /api/health` - Health check endpoint

## File Structure

- `uploads/` - Directory where audio files are stored
- `data/sounds.json` - JSON file storing metadata for all audio files

## Upload Format

When uploading a file, send a `multipart/form-data` request with:
- `audio` - The audio file
- `title` - Title of the sound
- `category` - Category of the sound
- `tags` - Comma-separated tags (optional)
- `duration` - Duration in seconds (optional)

## Notes

- Maximum file size: 50MB
- Supported audio formats: MP3, WAV, OGG, WebM
- The server uses CORS to allow requests from the frontend
