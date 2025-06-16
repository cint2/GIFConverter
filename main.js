const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Disable GPU acceleration to prevent GPU process errors
app.disableHardwareAcceleration();

// Try to find FFmpeg - first check installed package, then bundled, then system
let ffmpegPath;
let ffprobePath;

// Try different FFmpeg sources in order of preference
let ffmpegSource = 'none';

// First try npm installed version (most reliable)
try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  ffmpegPath = ffmpegInstaller.path;
  // Extract directory path and look for ffprobe
  const ffmpegDir = path.dirname(ffmpegPath);
  const possibleFfprobePath = path.join(ffmpegDir, 'ffprobe.exe');
  if (fs.existsSync(possibleFfprobePath)) {
    ffprobePath = possibleFfprobePath;
  } else {
    ffprobePath = ffmpegPath; // Use ffmpeg for probing if ffprobe not available
  }
  ffmpegSource = 'npm-installed';
  console.log('Using npm-installed FFmpeg:', ffmpegPath);
} catch (e) {
  // Check for bundled FFmpeg binaries
  const bundledFfmpegPath = path.join(__dirname, 'ffmpeg', 'ffmpeg.exe');
  const bundledFfprobePath = path.join(__dirname, 'ffmpeg', 'ffprobe.exe');
  
  if (fs.existsSync(bundledFfmpegPath) && fs.existsSync(bundledFfprobePath)) {
    // Check if they're real FFmpeg binaries (should be > 10MB)
    const ffmpegStats = fs.statSync(bundledFfmpegPath);
    if (ffmpegStats.size > 10 * 1024 * 1024) {
      ffmpegPath = bundledFfmpegPath;
      ffprobePath = bundledFfprobePath;
      ffmpegSource = 'bundled';
      console.log('Using bundled FFmpeg binaries:', ffmpegPath);
    } else {
      console.log('Bundled FFmpeg files are too small, likely placeholders');
    }
  }
  
  // If still not found, try system PATH
  if (!ffmpegSource || ffmpegSource === 'none') {
    ffmpegPath = 'ffmpeg';
    ffprobePath = 'ffprobe';
    ffmpegSource = 'system-path';
    console.log('Attempting to use system FFmpeg from PATH');
  }
}

console.log('FFmpeg path:', ffmpegPath);
console.log('FFprobe path:', ffprobePath);

// Test ffprobe executable
const testFfprobe = spawn(ffprobePath, ['-version']);
testFfprobe.on('close', (code) => {
  console.log(`FFprobe version test exit code: ${code}`);
});
testFfprobe.on('error', (err) => {
  console.log(`FFprobe version test error: ${err.message}`);
});

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false
  });

  mainWindow.loadFile('renderer/index.html');
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for video processing
ipcMain.handle('select-video-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mov'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('select-video-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mov'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths;
  }
  return [];
});

ipcMain.handle('save-gif-file', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'GIF Files', extensions: ['gif'] }
    ]
  });
  
  if (!result.canceled) {
    return result.filePath;
  }
  return null;
});

ipcMain.handle('get-video-info', async (event, videoPath) => {
  return new Promise((resolve, reject) => {
    // Check if we have valid FFmpeg
    if (ffmpegSource === 'none') {
      reject(new Error('FFmpeg not found. Please download FFmpeg from https://ffmpeg.org/download.html and place ffmpeg.exe and ffprobe.exe in the ffmpeg/ folder.'));
      return;
    }
    
    // Try to use proper ffprobe if available, otherwise fall back to ffmpeg parsing
    const useProperFfprobe = ffprobePath !== ffmpegPath && fs.existsSync(ffprobePath);
    
    if (useProperFfprobe) {
      // Use ffprobe for clean JSON output
      const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', videoPath];
      
      const ffprobe = spawn(ffprobePath, args, {
        windowsHide: true,
        shell: false
      });
      let output = '';
      let errorOutput = '';
      
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ffprobe.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      ffprobe.on('error', (err) => {
        console.log('FFprobe spawn error:', err.message);
        console.log('FFprobe path was:', ffprobePath);
        fallbackToFfmpegParsing();
      });
      
      ffprobe.on('close', (code) => {
        console.log(`FFprobe exit code: ${code}`);
        console.log(`FFprobe stdout length: ${output.length}`);
        console.log(`FFprobe stderr: ${errorOutput}`);
        
        if (code !== 0 || code === null) {
          console.log('FFprobe failed, falling back to FFmpeg parsing method...');
          // Fallback to ffmpeg parsing
          fallbackToFfmpegParsing();
          return;
        }
        
        try {
          const metadata = JSON.parse(output);
          const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
          
          if (!videoStream) {
            reject(new Error('No video stream found'));
            return;
          }
          
          // Parse frame rate safely
          let fps = 30;
          if (videoStream.r_frame_rate) {
            const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
            fps = den ? num / den : num;
          }
          
          resolve({
            duration: parseFloat(metadata.format.duration) || 0,
            width: videoStream.width || 0,
            height: videoStream.height || 0,
            fps: fps
          });
        } catch (e) {
          reject(new Error(`Failed to parse ffprobe output: ${e.message}`));
        }
      });
      
      ffprobe.on('error', (err) => {
        console.log('FFprobe spawn error, falling back to FFmpeg parsing...');
        fallbackToFfmpegParsing();
      });
      
      // Define fallback function
      function fallbackToFfmpegParsing() {
        const args = ['-i', videoPath, '-t', '0.1', '-f', 'null', '-'];
        
        console.log('Attempting FFmpeg fallback with path:', ffmpegPath);
        const ffmpeg = spawn(ffmpegPath, args, {
          windowsHide: true,
          shell: false
        });
        let errorOutput = '';
        
        ffmpeg.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        ffmpeg.on('error', (err) => {
          console.log('FFmpeg spawn error:', err.message);
          console.log('FFmpeg path was:', ffmpegPath);
          reject(new Error(`FFmpeg could not be executed: ${err.message}. Please ensure FFmpeg is installed.`));
        });
        
        ffmpeg.on('close', (code) => {
          try {
            const durationMatch = errorOutput.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
            const videoMatch = errorOutput.match(/Video: .+?(\d{3,5})x(\d{3,5})/);
            const fpsMatch = errorOutput.match(/(\d+(?:\.\d+)?) fps/);
            
            if (!durationMatch || !videoMatch) {
              reject(new Error('Could not parse video information from ffmpeg output'));
              return;
            }
            
            const [, hours, minutes, seconds] = durationMatch;
            const duration = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
            
            const [, width, height] = videoMatch;
            const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 30;
            
            resolve({
              duration: duration,
              width: parseInt(width),
              height: parseInt(height),
              fps: fps
            });
          } catch (e) {
            reject(new Error(`Failed to parse video metadata: ${e.message}`));
          }
        });
        
        ffmpeg.on('error', (err) => {
          reject(new Error(`Failed to start FFmpeg: ${err.message}`));
        });
      }
    } else {
      // Fallback to ffmpeg stderr parsing
      const args = ['-i', videoPath, '-t', '0.1', '-f', 'null', '-'];
      
      const ffmpeg = spawn(ffmpegPath, args);
      let errorOutput = '';
      
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      ffmpeg.on('close', (code) => {
        try {
          const durationMatch = errorOutput.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
          const videoMatch = errorOutput.match(/Video: .+?(\d{3,5})x(\d{3,5})/);
          const fpsMatch = errorOutput.match(/(\d+(?:\.\d+)?) fps/);
          
          if (!durationMatch || !videoMatch) {
            reject(new Error('Could not parse video information from ffmpeg output'));
            return;
          }
          
          const [, hours, minutes, seconds] = durationMatch;
          const duration = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
          
          const [, width, height] = videoMatch;
          const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 30;
          
          resolve({
            duration: duration,
            width: parseInt(width),
            height: parseInt(height),
            fps: fps
          });
        } catch (e) {
          reject(new Error(`Failed to parse video metadata: ${e.message}`));
        }
      });
      
      ffmpeg.on('error', (err) => {
        reject(new Error(`Failed to start FFmpeg: ${err.message}`));
      });
    }
  });
});

ipcMain.handle('convert-to-gif', async (event, options) => {
  const { inputPath, outputPath, cropX, cropY, cropWidth, cropHeight, outputWidth, outputHeight, fps, colors, dither } = options;
  
  return new Promise((resolve, reject) => {
    // Build filter chain
    let videoFilters = [];
    
    // Add crop filter if specified
    if (cropX !== undefined && cropY !== undefined && cropWidth && cropHeight) {
      videoFilters.push(`crop=${cropWidth}:${cropHeight}:${cropX}:${cropY}`);
    }
    
    // Add scale filter
    if (outputWidth && outputHeight) {
      videoFilters.push(`scale=${outputWidth}:${outputHeight}:flags=lanczos`);
    }
    
    // Add fps filter
    videoFilters.push(`fps=${fps || 15}`);
    
    // Create palette generation command
    const paletteFile = path.join(__dirname, 'temp_palette.png');
    const paletteArgs = [
      '-i', inputPath,
      '-vf', `${videoFilters.join(',')},palettegen=max_colors=${colors || 256}`,
      '-y', paletteFile
    ];
    
    const paletteProcess = spawn(ffmpegPath, paletteArgs);
    
    paletteProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Palette generation failed with code ${code}`));
        return;
      }
      
      // Now create GIF using the palette
      const gifArgs = [
        '-i', inputPath,
        '-i', paletteFile,
        '-filter_complex', `[0:v]${videoFilters.join(',')}[v];[v][1:v]paletteuse=dither=${dither || 'bayer:bayer_scale=5'}`,
        '-y', outputPath
      ];
      
      const gifProcess = spawn(ffmpegPath, gifArgs);
      let errorOutput = '';
      
      gifProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        // Extract progress if possible
        const progressMatch = errorOutput.match(/time=(\d+:\d+:\d+\.\d+)/);
        if (progressMatch) {
          // Simple progress estimation - could be improved
          event.sender.send('conversion-progress', Math.min(95, Math.random() * 100));
        }
      });
      
      gifProcess.on('close', (code) => {
        // Clean up palette file
        if (fs.existsSync(paletteFile)) {
          fs.unlinkSync(paletteFile);
        }
        
        if (code !== 0) {
          reject(new Error(`GIF conversion failed with code ${code}: ${errorOutput}`));
        } else {
          event.sender.send('conversion-progress', 100);
          resolve(outputPath);
        }
      });
      
      gifProcess.on('error', (err) => {
        // Clean up palette file on error
        if (fs.existsSync(paletteFile)) {
          fs.unlinkSync(paletteFile);
        }
        reject(err);
      });
    });
    
    paletteProcess.on('error', reject);
  });
});

// Utility function to estimate GIF file size
ipcMain.handle('estimate-gif-size', async (event, options) => {
  const { duration, width, height, fps, colors, dither } = options;
  
  // More accurate GIF size estimation
  // Base formula: total_frames * frame_size * compression_factor
  const totalFrames = Math.round(duration * fps);
  const bitsPerPixel = Math.ceil(Math.log2(colors || 256));
  
  // Base frame size (uncompressed)
  const frameSize = (width * height * bitsPerPixel) / 8;
  
  // GIF uses LZW compression, effectiveness varies by content
  // Compression factors based on typical GIF behavior
  let compressionFactor = 0.48; // Base compression (fine-tuned based on real outputs)
  
  // Adjust for color count (fewer colors = better compression)
  if (colors <= 32) compressionFactor *= 0.85;
  else if (colors <= 64) compressionFactor *= 0.9;
  else if (colors <= 128) compressionFactor *= 0.95;
  
  // Adjust for dithering (dithering reduces compression efficiency)
  if (dither === 'floyd_steinberg') compressionFactor *= 1.35;
  else if (dither === 'sierra2') compressionFactor *= 1.3;
  else if (dither === 'sierra2_4a') compressionFactor *= 1.25;
  else if (dither && dither.includes('bayer:bayer_scale=3')) compressionFactor *= 1.2;
  else if (dither && dither.includes('bayer:bayer_scale=5')) compressionFactor *= 1.15;
  else if (dither === 'none') compressionFactor *= 0.9;
  
  // Adjust for frame rate (higher fps = less inter-frame compression)
  if (fps >= 25) compressionFactor *= 1.15;
  else if (fps >= 20) compressionFactor *= 1.08;
  else if (fps <= 10) compressionFactor *= 0.95;
  
  // Account for GIF overhead (headers, palette, etc.)
  const overhead = 800 + (colors * 3) + (totalFrames * 20);
  
  const estimatedSize = (totalFrames * frameSize * compressionFactor) + overhead;
  
  return Math.round(estimatedSize);
});

// Generate preview GIF
ipcMain.handle('generate-preview', async (event, options) => {
  const { inputPath, fps, colors, dither, crop, width, height, duration } = options;
  const tempDir = app.getPath('temp');
  const previewPath = path.join(tempDir, `preview_${Date.now()}.gif`);
  
  return new Promise((resolve, reject) => {
    // Build ffmpeg command - limit to 3 seconds for preview
    const previewDuration = Math.min(duration, 3);
    const args = [
      '-i', inputPath,
      '-t', previewDuration.toString(),
      '-vf', buildFilterChain(crop, width, height, fps, colors, dither),
      '-f', 'gif',
      '-y',
      previewPath
    ];
    
    const ffmpeg = spawn(ffmpegPath, args);
    
    ffmpeg.on('error', (err) => {
      reject(new Error(`FFmpeg error: ${err.message}`));
    });
    
    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg exited with code ${code}`));
        return;
      }
      
      // Get file size
      try {
        const stats = fs.statSync(previewPath);
        resolve({
          previewPath: previewPath,
          fileSize: stats.size
        });
      } catch (err) {
        reject(new Error(`Could not read preview file: ${err.message}`));
      }
    });
  });
});

// Helper function to build filter chain
function buildFilterChain(crop, width, height, fps, colors, dither) {
  let filters = [];
  
  // Crop filter
  if (crop && crop.width > 0 && crop.height > 0) {
    filters.push(`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`);
  }
  
  // Scale filter
  filters.push(`scale=${width}:${height}:flags=lanczos`);
  
  // FPS filter
  filters.push(`fps=${fps}`);
  
  // Palette generation with dithering
  const paletteGen = `palettegen=max_colors=${colors}`;
  const paletteUse = dither === 'none' 
    ? `paletteuse=dither=none` 
    : `paletteuse=dither=${dither}:diff_mode=rectangle`;
  
  // Split stream for palette generation
  filters.push('split[s0][s1]');
  filters.push(`[s0]${paletteGen}[p]`);
  filters.push(`[s1][p]${paletteUse}`);
  
  return filters.join(',');
}