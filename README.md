# GIF Converter

A desktop application to convert MP4/QuickTime videos to optimized GIFs with manual cropping, resizing, and quality controls.

## Features

- **Video to GIF Conversion**: Convert MP4 and QuickTime (H.264) videos to GIF format
- **Manual Crop Selection**: Visual crop overlay to select specific areas of the video
- **Size Optimization**: Control dimensions, frame rate, colors, and dither methods
- **Size Constraints**: Automatic optimization to meet file size limits (default 2MB max)
- **Real-time Preview**: See estimated file size and output dimensions before conversion
- **Batch Processing**: Convert multiple videos at once
- **Photoshop-style Interface**: Familiar Save for Web inspired layout

## Default Settings

- **Max Output Size**: 2MB
- **Max Height**: 80px
- **Max Width**: 250px
- **Frame Rate**: 15 fps
- **Colors**: 256
- **Dither**: Bayer (Balanced)

## Requirements

- **Node.js** (v16 or higher)
- **FFmpeg** (bundled with application)
- **Windows** operating system

## Installation & Setup

### Option 1: Quick Start (Recommended)

1. Double-click `run.bat` to automatically install dependencies and start the application
2. The script will check for Node.js and install all required packages
3. If FFmpeg is missing, it will prompt you to download it

### Option 2: Manual Setup

1. **Install Node.js** from https://nodejs.org/
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Download FFmpeg** (REQUIRED):
   - Run `download-ffmpeg.bat` for instructions
   - Or download from https://www.gyan.dev/ffmpeg/builds/
   - Download "release essentials" build
   - Extract `ffmpeg.exe` and `ffprobe.exe` to the `ffmpeg/` folder
   - The real files should be 50-100MB+ in size
4. **Start the Application**:
   ```bash
   npm start
   ```

## Usage

### Single File Conversion

1. **Load Video**: 
   - Click "Select Video" or drag & drop an MP4/MOV file
   - Video preview will appear on the left side

2. **Crop (Optional)**:
   - Click and drag on the video preview to select crop area
   - Crop coordinates will be displayed below the video
   - Click "Clear Crop" to remove selection

3. **Adjust Settings**:
   - **Size & Dimensions**: Set output width/height, maintain aspect ratio
   - **Quality**: Adjust frame rate (5-30 fps), colors (32-256), dither method
   - **Size Constraints**: Set maximum file size limit

4. **Preview**: 
   - Real-time estimated file size and dimensions shown in the settings panel
   - Settings auto-adjust if constraints are exceeded

5. **Convert**: 
   - Click "Convert to GIF"
   - Choose output location
   - Progress bar shows conversion status

### Batch Processing

1. **Select Multiple Files**: Click "Select Multiple" or drag & drop multiple videos
2. **Batch List**: All selected files appear in the batch section
3. **Process All**: Convert all files with current settings
4. **Individual Removal**: Remove specific files from batch before processing

## Settings Explained

### Size & Dimensions
- **Width/Height**: Output GIF dimensions in pixels
- **Maintain Aspect Ratio**: Automatically adjust height when width changes (and vice versa)

### Quality & Compression
- **Frame Rate**: Frames per second (lower = smaller file size)
- **Colors**: Color palette size (lower = smaller file size, less quality)
- **Dither Method**: 
  - **Bayer**: Balanced quality/speed
  - **Floyd-Steinberg**: Smoother gradients
  - **Sierra**: Sharper detail retention
  - **None**: Fastest conversion

### Size Constraints
- **Max Size**: File size limit that triggers automatic optimization
- **Auto-Optimization**: Settings automatically adjust to meet constraints

## File Structure

```
GIFConverter/
├── package.json          # Node.js dependencies and build config
├── main.js              # Electron main process
├── run.bat              # Windows startup script
├── renderer/            # UI files
│   ├── index.html      # Main interface
│   ├── style.css       # Photoshop-inspired styling  
│   └── app.js          # Frontend logic
├── ffmpeg/             # FFmpeg binaries
│   └── ffmpeg.exe      # Video processing engine
└── README.md           # This file
```

## Technical Details

- **Framework**: Electron (Node.js + Chromium)
- **Video Processing**: FFmpeg with fluent-ffmpeg wrapper
- **UI Style**: Photoshop Save for Web inspired interface
- **Platform**: Windows (WSL compatible for development)

## Troubleshooting

### "Node.js not found"
- Install Node.js from https://nodejs.org/
- Restart command prompt after installation

### "FFmpeg not found"
- Download FFmpeg from https://ffmpeg.org/download.html
- Extract `ffmpeg.exe` to the `ffmpeg/` folder

### "Dependencies failed to install"
- Check internet connection
- Run `npm install` manually in the project folder
- Try `npm install --force` if conflicts occur

### "Video won't load"
- Check file format (MP4 H.264 or QuickTime H.264 only)
- Try a different video file to test
- Check file isn't corrupted

### "Conversion fails"
- Check output folder has write permissions
- Ensure enough disk space available
- Try reducing quality settings

## Development

To modify or extend the application:

1. **Frontend Changes**: Edit files in `renderer/` folder
2. **Backend Logic**: Modify `main.js` for Electron/FFmpeg integration
3. **Styling**: Update `renderer/style.css` for UI changes
4. **Build Portable**: Run `npm run dist` to create distributable

## License

MIT License - Feel free to modify and distribute.