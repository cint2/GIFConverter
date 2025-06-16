# Claude Code Memory for GIFConverter

## Project Overview
Desktop application to convert MP4/QuickTime videos to optimized GIFs with manual cropping, resizing, and quality controls. Built using Electron with FFmpeg integration.

## Technology Stack
- **Framework**: Electron (Node.js + Chromium)
- **Video Processing**: FFmpeg with direct command execution
- **UI Style**: Photoshop Save for Web inspired interface
- **Platform**: Windows (WSL compatible for development)

## Key Features Implemented
- Photoshop Save for Web style interface with professional layout
- Drag & drop + file selection for video loading
- Visual crop overlay with click and drag selection (aspect ratio preserved)
- **Preview Generation**: Create 3-second preview GIFs with actual file sizes
- **Improved File Size Estimation**: More accurate predictions based on content and settings
- Quality controls: FPS, colors, enhanced dither method options
- Size constraints with auto-optimization (2MB/80px height/250px width)
- Batch processing for multiple files
- Portable package with run.bat launcher

## Project Structure
```
GIFConverter/
├── package.json          # Node.js dependencies and build config
├── main.js              # Electron main process with FFmpeg integration
├── run.bat              # Windows startup script
├── clean-install.bat    # Clean dependency installation
├── renderer/            # UI files
│   ├── index.html      # Main interface
│   ├── style.css       # Photoshop-inspired styling  
│   └── app.js          # Frontend logic and crop functionality
├── ffmpeg/             # FFmpeg binaries (user-provided)
│   ├── ffmpeg.exe      # Video processing engine (50-100MB+)
│   ├── ffprobe.exe     # Video metadata extraction
│   ├── ffplay.exe      # Media player (optional)
│   └── hwinfo.exe      # Hardware info (optional)
├── download-ffmpeg.bat # FFmpeg installation instructions
├── README.md           # Complete documentation
└── CLAUDE.md           # This file
```

## FFmpeg Integration Strategy
- **Priority 1**: Bundled binaries in `/ffmpeg/` folder (most reliable)
- **Priority 2**: npm-installed `@ffmpeg-installer/ffmpeg` package
- **Priority 3**: System PATH FFmpeg installation
- **Fallback**: If ffprobe fails, automatically uses ffmpeg stderr parsing

## Default Settings & Constraints
- Max output size: 2MB
- Max height: 80px  
- Max width: 250px
- Default frame rate: 15 fps
- Default colors: 256
- Default dither: Floyd-Steinberg (best quality)

## Dither Methods (Quality Ranking)
1. **Floyd-Steinberg** - Best quality for photos and gradients
2. **Sierra-2** - High quality, slightly faster than Floyd-Steinberg
3. **Sierra-2-4A** - Good quality with faster processing
4. **Bayer Fine** (scale=3) - Good for graphics, faster processing
5. **Bayer** (scale=5) - Balanced quality and speed
6. **None** - Smallest file size but visible banding

## Development Notes

### Dependencies Used
- `electron@28.0.0` - Latest stable Electron
- `@ffmpeg-installer/ffmpeg@1.1.0` - Backup FFmpeg source
- `electron-builder@24.13.0` - For creating portable executables

### Removed Dependencies
- Removed `fluent-ffmpeg` (deprecated)
- Removed `@ffprobe-installer/ffprobe` (unreliable)
- Uses direct FFmpeg command execution instead of wrappers

### Error Handling & Debugging
- GPU acceleration disabled to prevent Electron GPU process errors
- Automatic ffprobe → ffmpeg fallback for video metadata extraction
- Comprehensive logging for debugging video processing issues
- Version testing of FFmpeg binaries at startup

### Installation & Setup
1. **Quick Start**: `run.bat` - automatically installs dependencies and starts app
2. **Clean Install**: `clean-install.bat` - removes old packages and reinstalls fresh
3. **FFmpeg Setup**: User places FFmpeg binaries in `/ffmpeg/` folder for best reliability

### UI Design Philosophy
- Inspired by Photoshop's "Save for Web" dialog
- Single window interface for streamlined workflow
- Left panel: Video preview with crop overlay
- Right panel: Settings and controls in organized groups
- Real-time preview of output dimensions and file size

### Video Processing Pipeline
1. **Load Video**: Drag & drop or file selection
2. **Extract Metadata**: FFprobe or FFmpeg stderr parsing with robust fallback
3. **Crop Selection**: Visual canvas overlay with letterboxing detection
4. **Settings Adjustment**: Real-time preview updates with accurate estimation
5. **Preview Generation**: 3-second preview with actual file size measurement
6. **Size Optimization**: Auto-adjust settings to meet constraints
7. **Conversion**: Two-pass FFmpeg (palette generation + GIF creation)

### Known Issues & Solutions
- **GPU Process Errors**: Resolved by disabling hardware acceleration
- **FFprobe Path Issues**: Resolved with robust path detection and fallback
- **FFmpeg Binary Detection**: Added file size validation (must be >10MB)
- **Crop Tool Letterboxing**: Fixed coordinate calculation for videos with black bars
- **File Size Estimation**: Improved accuracy with content-aware compression factors
- **Deprecated Package Warnings**: Resolved by using direct FFmpeg execution
- **WSL Compatibility**: Windows paths properly handled for development

### Future Enhancement Possibilities
- Additional video format support (AVI, WebM, etc.)
- More dithering algorithms
- Timeline scrubbing for crop selection
- Batch processing with individual settings per file
- GIF optimization algorithms beyond FFmpeg defaults

## Testing Checklist
- [ ] FFmpeg binary detection and version testing
- [ ] Video file drag & drop functionality
- [ ] Video metadata extraction (duration, dimensions, fps)
- [ ] Crop overlay drawing and coordinate calculation
- [ ] Settings sliders and real-time preview updates
- [ ] File size estimation accuracy
- [ ] GIF conversion with various quality settings
- [ ] Batch processing workflow
- [ ] Error handling for corrupted/invalid video files
- [ ] Portable deployment and run.bat functionality

## Commit Strategy
- Use descriptive commit messages following conventional commits
- Include both functional changes and documentation updates
- Tag releases for major milestones
- Maintain clean commit history for debugging

## User Experience Goals
- Professional appearance matching familiar tools (Photoshop)
- Intuitive workflow requiring minimal learning
- Real-time feedback on all settings changes
- Automatic optimization to meet size constraints
- Clear error messages with helpful suggestions
- Fast processing with progress indication