const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Disable GPU acceleration to prevent GPU process errors
app.disableHardwareAcceleration();

// Try to find FFmpeg - first check installed package, then bundled, then system
let ffmpegPath;
let ffprobePath;

// Check for bundled FFmpeg binaries first (more reliable)
ffmpegPath = path.join(__dirname, 'ffmpeg', 'ffmpeg.exe');
ffprobePath = path.join(__dirname, 'ffmpeg', 'ffprobe.exe');

if (fs.existsSync(ffmpegPath) && fs.existsSync(ffprobePath)) {
  console.log('Using bundled FFmpeg binaries:', ffmpegPath);
} else {
  // Fallback to npm installed version
  try {
    ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
    ffprobePath = ffmpegPath; // Use ffmpeg for probing if ffprobe not available
    console.log('Using npm-installed FFmpeg:', ffmpegPath);
  } catch (e) {
    // Last resort: hope they're in system PATH
    ffmpegPath = 'ffmpeg';
    ffprobePath = 'ffprobe';
    console.log('Using system FFmpeg from PATH');
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
    // Try to use proper ffprobe if available, otherwise fall back to ffmpeg parsing
    const useProperFfprobe = ffprobePath !== ffmpegPath && fs.existsSync(ffprobePath);
    
    if (useProperFfprobe) {
      // Use ffprobe for clean JSON output
      const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', videoPath];
      
      const ffprobe = spawn(ffprobePath, args);
      let output = '';
      let errorOutput = '';
      
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ffprobe.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      ffprobe.on('close', (code) => {
        console.log(`FFprobe exit code: ${code}`);
        console.log(`FFprobe stdout length: ${output.length}`);
        console.log(`FFprobe stderr: ${errorOutput}`);
        
        if (code !== 0) {
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
  const { duration, width, height, fps, colors } = options;
  
  // Rough estimation: (width * height * fps * duration * bits_per_pixel) / 8
  // Adjusted for GIF compression
  const bitsPerPixel = Math.log2(colors || 256);
  const rawSize = width * height * fps * duration * bitsPerPixel / 8;
  const compressedSize = rawSize * 0.3; // Assume 30% compression ratio
  
  return Math.round(compressedSize);
});