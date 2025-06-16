const { ipcRenderer } = require('electron');
const path = require('path');

class GIFConverter {
    constructor() {
        this.currentVideo = null;
        this.videoInfo = null;
        this.cropSelection = null;
        this.videoDisplayArea = null;
        this.batchQueue = [];
        
        this.initializeElements();
        this.bindEvents();
        this.setupCropCanvas();
    }

    initializeElements() {
        // File controls
        this.selectFileBtn = document.getElementById('selectFileBtn');
        this.selectMultipleBtn = document.getElementById('selectMultipleBtn');
        this.dropZone = document.getElementById('dropZone');
        
        // Video preview
        this.videoContainer = document.getElementById('videoContainer');
        this.videoPreview = document.getElementById('videoPreview');
        this.cropOverlay = document.getElementById('cropOverlay');
        
        // Settings
        this.outputWidth = document.getElementById('outputWidth');
        this.outputHeight = document.getElementById('outputHeight');
        this.maintainAspect = document.getElementById('maintainAspect');
        this.fpsSlider = document.getElementById('fpsSlider');
        this.fpsValue = document.getElementById('fpsValue');
        this.colorsSlider = document.getElementById('colorsSlider');
        this.colorsValue = document.getElementById('colorsValue');
        this.ditherSelect = document.getElementById('ditherSelect');
        this.maxSizeSlider = document.getElementById('maxSizeSlider');
        this.maxSizeValue = document.getElementById('maxSizeValue');
        
        // Preview info
        this.estimatedSize = document.getElementById('estimatedSize');
        this.outputDimensions = document.getElementById('outputDimensions');
        this.videoDuration = document.getElementById('videoDuration');
        
        // Convert controls
        this.convertBtn = document.getElementById('convertBtn');
        this.previewBtn = document.getElementById('previewBtn');
        this.progressContainer = document.getElementById('progressContainer');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        
        // Preview elements
        this.previewResult = document.getElementById('previewResult');
        this.previewImage = document.getElementById('previewImage');
        this.actualSize = document.getElementById('actualSize');
        
        // Crop controls
        this.cropInfo = document.getElementById('cropInfo');
        this.clearCropBtn = document.getElementById('clearCropBtn');
        
        // Batch controls
        this.batchSection = document.getElementById('batchSection');
        this.batchList = document.getElementById('batchList');
    }

    bindEvents() {
        // File selection
        this.selectFileBtn.addEventListener('click', () => this.selectSingleFile());
        this.selectMultipleBtn.addEventListener('click', () => this.selectMultipleFiles());
        
        // Drag and drop
        this.dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.dropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.dropZone.addEventListener('drop', (e) => this.handleDrop(e));
        
        // Video events
        this.videoPreview.addEventListener('loadedmetadata', () => this.updateCropCanvas());
        this.videoPreview.addEventListener('resize', () => this.updateCropCanvas());
        
        // Settings sliders
        this.fpsSlider.addEventListener('input', (e) => {
            this.fpsValue.textContent = e.target.value;
            this.updatePreview();
        });
        
        this.colorsSlider.addEventListener('input', (e) => {
            this.colorsValue.textContent = e.target.value;
            this.updatePreview();
        });
        
        this.maxSizeSlider.addEventListener('input', (e) => {
            this.maxSizeValue.textContent = parseFloat(e.target.value).toFixed(1);
            this.updatePreview();
        });
        
        // Dimension inputs
        this.outputWidth.addEventListener('input', () => this.handleDimensionChange('width'));
        this.outputHeight.addEventListener('input', () => this.handleDimensionChange('height'));
        this.maintainAspect.addEventListener('change', () => this.updatePreview());
        
        // Other settings
        this.ditherSelect.addEventListener('change', () => this.updatePreview());
        
        // Convert & Preview buttons
        this.convertBtn.addEventListener('click', () => this.convertToGIF());
        this.previewBtn.addEventListener('click', () => this.generatePreview());
        
        // Crop controls
        this.clearCropBtn.addEventListener('click', () => this.clearCrop());
        
        // IPC listeners
        ipcRenderer.on('conversion-progress', (event, percent) => {
            this.updateProgress(percent);
        });
    }

    setupCropCanvas() {
        let isDrawing = false;
        let startX, startY;

        this.cropOverlay.addEventListener('mousedown', (e) => {
            if (!this.videoPreview.videoWidth) return;
            
            isDrawing = true;
            startX = e.offsetX;
            startY = e.offsetY;
        });

        this.cropOverlay.addEventListener('mousemove', (e) => {
            if (!isDrawing) return;
            
            const currentX = e.offsetX;
            const currentY = e.offsetY;
            
            this.drawCropRect(startX, startY, currentX - startX, currentY - startY);
        });

        this.cropOverlay.addEventListener('mouseup', (e) => {
            if (!isDrawing) return;
            
            isDrawing = false;
            const currentX = e.offsetX;
            const currentY = e.offsetY;
            
            // Check if we have video display area info
            if (!this.videoDisplayArea) {
                console.error('Video display area not calculated');
                return;
            }
            
            // Calculate positions relative to actual video display area
            const relativeStartX = startX - this.videoDisplayArea.offsetX;
            const relativeStartY = startY - this.videoDisplayArea.offsetY;
            const relativeCurrentX = currentX - this.videoDisplayArea.offsetX;
            const relativeCurrentY = currentY - this.videoDisplayArea.offsetY;
            
            // Check if selection is within video bounds
            if (relativeStartX < 0 || relativeStartY < 0 || 
                relativeCurrentX < 0 || relativeCurrentY < 0 ||
                relativeStartX > this.videoDisplayArea.width || 
                relativeCurrentX > this.videoDisplayArea.width ||
                relativeStartY > this.videoDisplayArea.height || 
                relativeCurrentY > this.videoDisplayArea.height) {
                console.log('Crop selection outside video bounds');
                return;
            }
            
            // Calculate scale factors
            const scaleX = this.videoPreview.videoWidth / this.videoDisplayArea.width;
            const scaleY = this.videoPreview.videoHeight / this.videoDisplayArea.height;
            
            // Calculate crop coordinates in video space
            const cropX = Math.min(relativeStartX, relativeCurrentX) * scaleX;
            const cropY = Math.min(relativeStartY, relativeCurrentY) * scaleY;
            const cropWidth = Math.abs(relativeCurrentX - relativeStartX) * scaleX;
            const cropHeight = Math.abs(relativeCurrentY - relativeStartY) * scaleY;
            
            if (cropWidth > 10 && cropHeight > 10) {
                this.cropSelection = {
                    x: Math.round(cropX),
                    y: Math.round(cropY),
                    width: Math.round(cropWidth),
                    height: Math.round(cropHeight)
                };
                
                console.log('Crop selection set:', this.cropSelection);
                this.updateCropInfo();
                
                // Auto-calculate output dimensions based on crop
                this.calculateOutputDimensionsFromCrop();
                this.updatePreview();
            }
        });
    }

    drawCropRect(x, y, width, height) {
        const ctx = this.cropOverlay.getContext('2d');
        ctx.clearRect(0, 0, this.cropOverlay.width, this.cropOverlay.height);
        
        // Draw semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, this.cropOverlay.width, this.cropOverlay.height);
        
        // Clear the selection area
        ctx.clearRect(x, y, width, height);
        
        // Draw selection border
        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
    }

    updateCropCanvas() {
        if (!this.videoPreview.videoWidth) return;
        
        const rect = this.videoPreview.getBoundingClientRect();
        this.cropOverlay.width = rect.width;
        this.cropOverlay.height = rect.height;
        this.cropOverlay.style.width = rect.width + 'px';
        this.cropOverlay.style.height = rect.height + 'px';
        
        // Calculate actual video display area (accounting for letterboxing)
        const videoAspect = this.videoPreview.videoWidth / this.videoPreview.videoHeight;
        const containerAspect = rect.width / rect.height;
        
        let displayWidth, displayHeight, offsetX, offsetY;
        
        if (videoAspect > containerAspect) {
            // Video is wider - letterbox top/bottom
            displayWidth = rect.width;
            displayHeight = rect.width / videoAspect;
            offsetX = 0;
            offsetY = (rect.height - displayHeight) / 2;
        } else {
            // Video is taller - letterbox left/right
            displayHeight = rect.height;
            displayWidth = rect.height * videoAspect;
            offsetX = (rect.width - displayWidth) / 2;
            offsetY = 0;
        }
        
        this.videoDisplayArea = {
            width: displayWidth,
            height: displayHeight,
            offsetX: offsetX,
            offsetY: offsetY
        };
    }

    updateCropInfo() {
        if (this.cropSelection) {
            this.cropInfo.textContent = `Crop: ${this.cropSelection.width}×${this.cropSelection.height} at (${this.cropSelection.x}, ${this.cropSelection.y})`;
        } else {
            this.cropInfo.textContent = 'No crop selected';
        }
    }

    clearCrop() {
        this.cropSelection = null;
        const ctx = this.cropOverlay.getContext('2d');
        ctx.clearRect(0, 0, this.cropOverlay.width, this.cropOverlay.height);
        this.updateCropInfo();
        
        // Reset to default dimensions
        if (this.videoInfo) {
            this.adjustDimensions();
        }
        this.updatePreview();
    }
    
    calculateOutputDimensionsFromCrop() {
        if (!this.cropSelection) return;
        
        const cropAspectRatio = this.cropSelection.width / this.cropSelection.height;
        const maxHeight = 80;
        const maxWidth = 250;
        
        let outputWidth, outputHeight;
        
        // If crop height is less than or equal to maxHeight
        if (this.cropSelection.height <= maxHeight) {
            outputHeight = this.cropSelection.height;
            outputWidth = Math.round(outputHeight * cropAspectRatio);
        } else {
            // Scale down to fit maxHeight
            outputHeight = maxHeight;
            outputWidth = Math.round(outputHeight * cropAspectRatio);
            
            // Check if width exceeds maxWidth
            if (outputWidth > maxWidth) {
                outputWidth = maxWidth;
                outputHeight = Math.round(outputWidth / cropAspectRatio);
            }
        }
        
        // Update the dimension inputs
        this.outputWidth.value = outputWidth;
        this.outputHeight.value = outputHeight;
        
        // Disable maintain aspect ratio when crop is active
        this.maintainAspect.checked = false;
        
        console.log(`Crop dimensions: ${this.cropSelection.width}x${this.cropSelection.height}`);
        console.log(`Output dimensions: ${outputWidth}x${outputHeight}`);
    }

    async selectSingleFile() {
        const filePath = await ipcRenderer.invoke('select-video-file');
        if (filePath) {
            this.loadVideo(filePath);
        }
    }

    async selectMultipleFiles() {
        const filePaths = await ipcRenderer.invoke('select-video-files');
        if (filePaths.length > 0) {
            if (filePaths.length === 1) {
                this.loadVideo(filePaths[0]);
            } else {
                this.loadBatchFiles(filePaths);
            }
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        this.dropZone.classList.add('drag-over');
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.dropZone.classList.remove('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        this.dropZone.classList.remove('drag-over');
        
        const files = Array.from(e.dataTransfer.files).filter(file => 
            file.type === 'video/mp4' || file.type === 'video/quicktime'
        );
        
        if (files.length > 0) {
            if (files.length === 1) {
                this.loadVideo(files[0].path);
            } else {
                this.loadBatchFiles(files.map(f => f.path));
            }
        }
    }

    async loadVideo(filePath) {
        try {
            this.currentVideo = filePath;
            this.videoInfo = await ipcRenderer.invoke('get-video-info', filePath);
            
            this.videoPreview.src = `file://${filePath}`;
            this.dropZone.style.display = 'none';
            this.videoContainer.style.display = 'block';
            
            this.updateVideoInfo();
            this.convertBtn.disabled = false;
            this.previewBtn.disabled = false;
            
            // Auto-adjust dimensions based on constraints
            this.adjustDimensions();
            
        } catch (error) {
            console.error('Error loading video:', error);
            
            // Check if it's an FFmpeg-related error
            if (error.message && error.message.includes('FFmpeg')) {
                alert('FFmpeg Error:\n\n' + error.message + '\n\nPlease run download-ffmpeg.bat for instructions on installing FFmpeg.');
            } else {
                alert('Error loading video file:\n' + error.message);
            }
            
            // Reset UI
            this.dropZone.style.display = 'block';
            this.videoContainer.style.display = 'none';
            this.convertBtn.disabled = true;
        }
    }

    loadBatchFiles(filePaths) {
        this.batchQueue = filePaths;
        this.batchSection.style.display = 'block';
        this.updateBatchList();
    }

    updateBatchList() {
        this.batchList.innerHTML = this.batchQueue.map((filePath, index) => `
            <div class="batch-item">
                <span class="batch-filename">${path.basename(filePath)}</span>
                <button class="btn small" onclick="gifConverter.removeBatchItem(${index})">Remove</button>
            </div>
        `).join('');
    }

    removeBatchItem(index) {
        this.batchQueue.splice(index, 1);
        this.updateBatchList();
        
        if (this.batchQueue.length === 0) {
            this.batchSection.style.display = 'none';
        }
    }

    updateVideoInfo() {
        if (!this.videoInfo) return;
        
        this.videoDuration.textContent = `${this.videoInfo.duration.toFixed(1)}s`;
        this.updatePreview();
    }

    adjustDimensions() {
        if (!this.videoInfo) return;
        
        // Don't auto-adjust if crop is active
        if (this.cropSelection) return;
        
        const { width, height } = this.videoInfo;
        const maxWidth = 250;
        const maxHeight = 80;
        
        let newWidth = width;
        let newHeight = height;
        
        // Scale down if needed
        if (width > maxWidth || height > maxHeight) {
            const scaleX = maxWidth / width;
            const scaleY = maxHeight / height;
            const scale = Math.min(scaleX, scaleY);
            
            newWidth = Math.round(width * scale);
            newHeight = Math.round(height * scale);
        }
        
        this.outputWidth.value = newWidth;
        this.outputHeight.value = newHeight;
        
        this.updatePreview();
    }

    handleDimensionChange(changedDimension) {
        if (!this.maintainAspect.checked || !this.videoInfo) {
            this.updatePreview();
            return;
        }
        
        // Use crop aspect ratio if crop is active, otherwise use video aspect ratio
        let aspectRatio;
        if (this.cropSelection) {
            aspectRatio = this.cropSelection.width / this.cropSelection.height;
        } else {
            aspectRatio = this.videoInfo.width / this.videoInfo.height;
        }
        
        if (changedDimension === 'width') {
            const newWidth = parseInt(this.outputWidth.value);
            const newHeight = Math.round(newWidth / aspectRatio);
            this.outputHeight.value = newHeight;
        } else {
            const newHeight = parseInt(this.outputHeight.value);
            const newWidth = Math.round(newHeight * aspectRatio);
            this.outputWidth.value = newWidth;
        }
        
        this.updatePreview();
    }

    updatePreview() {
        if (!this.videoInfo) return;
        
        const width = parseInt(this.outputWidth.value);
        const height = parseInt(this.outputHeight.value);
        const fps = parseInt(this.fpsSlider.value);
        const colors = parseInt(this.colorsSlider.value);
        const duration = this.videoInfo.duration;
        
        // Update dimensions display
        this.outputDimensions.textContent = `${width} × ${height}`;
        
        // Estimate file size
        this.estimateFileSize(width, height, fps, colors, duration);
    }

    async estimateFileSize(width, height, fps, colors, duration) {
        try {
            const dither = this.ditherSelect.value;
            const estimatedBytes = await ipcRenderer.invoke('estimate-gif-size', {
                width, height, fps, colors, duration, dither
            });
            
            const estimatedMB = estimatedBytes / (1024 * 1024);
            this.estimatedSize.textContent = `${estimatedMB.toFixed(2)} MB`;
            
            // Check constraints
            const maxSize = parseFloat(this.maxSizeSlider.value) * 1024 * 1024;
            if (estimatedBytes > maxSize || width > 250 || height > 80) {
                this.estimatedSize.style.color = '#d32f2f';
                this.suggestOptimizations(estimatedBytes, maxSize, width, height);
            } else {
                this.estimatedSize.style.color = '#2e7d32';
            }
            
        } catch (error) {
            console.error('Error estimating file size:', error);
        }
    }

    suggestOptimizations(currentSize, maxSize, width, height) {
        // Auto-adjust settings if size is too large
        if (currentSize > maxSize) {
            // Reduce colors first
            if (this.colorsSlider.value > 128) {
                this.colorsSlider.value = 128;
                this.colorsValue.textContent = '128';
            }
            // Reduce FPS if still too large
            else if (this.fpsSlider.value > 10) {
                this.fpsSlider.value = 10;
                this.fpsValue.textContent = '10';
            }
        }
        
        // Adjust dimensions if too large
        if (width > 250 || height > 80) {
            const scaleX = 250 / width;
            const scaleY = 80 / height;
            const scale = Math.min(scaleX, scaleY);
            
            this.outputWidth.value = Math.round(width * scale);
            this.outputHeight.value = Math.round(height * scale);
        }
        
        // Trigger update after adjustments
        setTimeout(() => this.updatePreview(), 100);
    }

    async convertToGIF() {
        if (!this.currentVideo) return;
        
        const outputPath = await ipcRenderer.invoke('save-gif-file');
        if (!outputPath) return;
        
        this.convertBtn.disabled = true;
        this.progressContainer.style.display = 'block';
        
        const options = {
            inputPath: this.currentVideo,
            outputPath: outputPath,
            outputWidth: parseInt(this.outputWidth.value),
            outputHeight: parseInt(this.outputHeight.value),
            fps: parseInt(this.fpsSlider.value),
            colors: parseInt(this.colorsSlider.value),
            dither: this.ditherSelect.value
        };
        
        if (this.cropSelection) {
            options.cropX = this.cropSelection.x;
            options.cropY = this.cropSelection.y;
            options.cropWidth = this.cropSelection.width;
            options.cropHeight = this.cropSelection.height;
        }
        
        try {
            const result = await ipcRenderer.invoke('convert-to-gif', options);
            alert(`GIF created successfully!\nSaved to: ${result}`);
        } catch (error) {
            console.error('Conversion error:', error);
            alert(`Conversion failed: ${error.message}`);
        } finally {
            this.convertBtn.disabled = false;
            this.progressContainer.style.display = 'none';
            this.progressFill.style.width = '0%';
            this.progressText.textContent = '0%';
        }
    }

    updateProgress(percent) {
        if (percent) {
            const roundedPercent = Math.round(percent);
            this.progressFill.style.width = `${roundedPercent}%`;
            this.progressText.textContent = `${roundedPercent}%`;
        }
    }
    
    async generatePreview() {
        if (!this.currentVideo) return;
        
        try {
            this.previewBtn.disabled = true;
            this.previewBtn.textContent = 'Generating Preview...';
            
            const options = {
                inputPath: this.currentVideo,
                fps: parseInt(this.fpsSlider.value),
                colors: parseInt(this.colorsSlider.value),
                dither: this.ditherSelect.value,
                crop: this.cropSelection,
                width: parseInt(this.outputWidth.value),
                height: parseInt(this.outputHeight.value),
                duration: this.videoInfo.duration,
                isPreview: true
            };
            
            const { previewPath, fileSize } = await ipcRenderer.invoke('generate-preview', options);
            
            // Display preview
            this.previewImage.src = `file://${previewPath}`;
            this.actualSize.textContent = `${(fileSize / (1024 * 1024)).toFixed(2)} MB`;
            this.previewResult.style.display = 'block';
            
            // Update estimated size display with actual size comparison
            const estimatedMB = parseFloat(this.estimatedSize.textContent);
            const actualMB = fileSize / (1024 * 1024);
            const accuracy = Math.round((estimatedMB / actualMB) * 100);
            
            this.estimatedSize.innerHTML = `${estimatedMB.toFixed(2)} MB <small>(${accuracy}% accurate)</small>`;
            
        } catch (error) {
            console.error('Error generating preview:', error);
            alert('Error generating preview: ' + error.message);
        } finally {
            this.previewBtn.disabled = false;
            this.previewBtn.textContent = 'Generate Preview';
        }
    }
}

// Initialize the application
const gifConverter = new GIFConverter();