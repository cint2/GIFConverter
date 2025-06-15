const { ipcRenderer } = require('electron');
const path = require('path');

class GIFConverter {
    constructor() {
        this.currentVideo = null;
        this.videoInfo = null;
        this.cropSelection = null;
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
        this.progressContainer = document.getElementById('progressContainer');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        
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
        
        // Convert button
        this.convertBtn.addEventListener('click', () => this.convertToGIF());
        
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
            
            const rect = this.cropOverlay.getBoundingClientRect();
            const videoRect = this.videoPreview.getBoundingClientRect();
            
            // Calculate crop coordinates relative to actual video
            const scaleX = this.videoPreview.videoWidth / videoRect.width;
            const scaleY = this.videoPreview.videoHeight / videoRect.height;
            
            const cropX = Math.min(startX, currentX) * scaleX;
            const cropY = Math.min(startY, currentY) * scaleY;
            const cropWidth = Math.abs(currentX - startX) * scaleX;
            const cropHeight = Math.abs(currentY - startY) * scaleY;
            
            if (cropWidth > 10 && cropHeight > 10) {
                this.cropSelection = {
                    x: Math.round(cropX),
                    y: Math.round(cropY),
                    width: Math.round(cropWidth),
                    height: Math.round(cropHeight)
                };
                
                this.updateCropInfo();
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
        this.updatePreview();
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
            
            // Auto-adjust dimensions based on constraints
            this.adjustDimensions();
            
        } catch (error) {
            console.error('Error loading video:', error);
            alert('Error loading video file. Please check the file format.');
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
        
        const aspectRatio = this.videoInfo.width / this.videoInfo.height;
        
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
            const estimatedBytes = await ipcRenderer.invoke('estimate-gif-size', {
                width, height, fps, colors, duration
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
}

// Initialize the application
const gifConverter = new GIFConverter();