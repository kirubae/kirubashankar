// State
const state = {
    originalImage: null,
    originalFile: null,
    originalWidth: 0,
    originalHeight: 0,
    originalFormat: '',
    originalSize: 0,
    currentTab: 'resize',
    zoom: 1,
    aspectLocked: true,
    aspectRatio: 1,
    cropRatio: '1:1',
    crop: { x: 0, y: 0, width: 100, height: 100 },
    quality: 80,
    outputFormat: 'original'
};

// DOM Elements
const elements = {
    uploadArea: document.getElementById('upload-area'),
    fileInput: document.getElementById('file-input'),
    uploadBtn: document.getElementById('upload-btn'),
    editor: document.getElementById('editor'),
    previewImage: document.getElementById('preview-image'),
    previewWrapper: document.getElementById('preview-wrapper'),
    previewContainer: document.getElementById('preview-container'),
    cropOverlay: document.getElementById('crop-overlay'),
    cropBox: document.getElementById('crop-box'),
    tabs: document.querySelectorAll('.tab'),
    tabContents: document.querySelectorAll('.tab-content'),
    resizeWidth: document.getElementById('resize-width'),
    resizeHeight: document.getElementById('resize-height'),
    aspectLock: document.getElementById('aspect-lock'),
    noUpscale: document.getElementById('no-upscale'),
    cropWidth: document.getElementById('crop-width'),
    cropHeight: document.getElementById('crop-height'),
    centerCrop: document.getElementById('center-crop'),
    customRatioInputs: document.getElementById('custom-ratio-inputs'),
    customRatioW: document.getElementById('custom-ratio-w'),
    customRatioH: document.getElementById('custom-ratio-h'),
    applyCustomRatio: document.getElementById('apply-custom-ratio'),
    cropResizeEnabled: document.getElementById('crop-resize-enabled'),
    cropResizeOptions: document.getElementById('crop-resize-options'),
    cropOutputWidth: document.getElementById('crop-output-width'),
    cropOutputHeight: document.getElementById('crop-output-height'),
    outputFormat: document.getElementById('output-format'),
    qualitySlider: document.getElementById('quality-slider'),
    qualityValue: document.getElementById('quality-value'),
    qualityGroup: document.getElementById('quality-group'),
    maxDimension: document.getElementById('max-dimension'),
    stripMetadata: document.getElementById('strip-metadata'),
    infoFormat: document.getElementById('info-format'),
    infoDimensions: document.getElementById('info-dimensions'),
    infoSize: document.getElementById('info-size'),
    outputFormatDisplay: document.getElementById('output-format-display'),
    outputDimensions: document.getElementById('output-dimensions'),
    outputSize: document.getElementById('output-size'),
    resetBtn: document.getElementById('reset-btn'),
    downloadBtn: document.getElementById('download-btn'),
    zoomIn: document.getElementById('zoom-in'),
    zoomOut: document.getElementById('zoom-out'),
    zoomFit: document.getElementById('zoom-fit'),
    zoomLevel: document.getElementById('zoom-level'),
    loading: document.getElementById('loading')
};

// Utility Functions
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function getFormatExtension(mimeType) {
    const map = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif'
    };
    return map[mimeType] || 'png';
}

function getFormatName(mimeType) {
    const map = {
        'image/jpeg': 'JPEG',
        'image/png': 'PNG',
        'image/webp': 'WebP',
        'image/gif': 'GIF'
    };
    return map[mimeType] || mimeType.split('/')[1]?.toUpperCase() || 'Unknown';
}

// File Upload
function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) {
        alert('Please select a valid image file');
        return;
    }

    state.originalFile = file;
    state.originalSize = file.size;
    state.originalFormat = file.type;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            state.originalImage = img;
            state.originalWidth = img.naturalWidth;
            state.originalHeight = img.naturalHeight;
            state.aspectRatio = img.naturalWidth / img.naturalHeight;

            // Set preview
            elements.previewImage.src = e.target.result;

            // Update info
            elements.infoFormat.textContent = getFormatName(file.type);
            elements.infoDimensions.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
            elements.infoSize.textContent = formatFileSize(file.size);

            // Initialize controls
            elements.resizeWidth.value = img.naturalWidth;
            elements.resizeHeight.value = img.naturalHeight;

            // Initialize crop
            initializeCrop();

            // Show editor
            elements.uploadArea.classList.add('hidden');
            elements.editor.classList.add('active');

            // Update output info
            updateOutputInfo();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Drag and Drop
elements.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.add('dragover');
});

elements.uploadArea.addEventListener('dragleave', () => {
    elements.uploadArea.classList.remove('dragover');
});

elements.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    handleFile(file);
});

elements.uploadArea.addEventListener('click', () => {
    elements.fileInput.click();
});

elements.uploadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.fileInput.click();
});

elements.fileInput.addEventListener('change', (e) => {
    handleFile(e.target.files[0]);
});

// Tabs
elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        state.currentTab = tabName;

        elements.tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        elements.tabContents.forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Show/hide crop overlay
        elements.cropOverlay.classList.toggle('active', tabName === 'crop');

        updateOutputInfo();
    });
});

// Resize Controls
elements.resizeWidth.addEventListener('input', () => {
    if (state.aspectLocked) {
        const newHeight = Math.round(elements.resizeWidth.value / state.aspectRatio);
        elements.resizeHeight.value = newHeight;
    }
    updateOutputInfo();
});

elements.resizeHeight.addEventListener('input', () => {
    if (state.aspectLocked) {
        const newWidth = Math.round(elements.resizeHeight.value * state.aspectRatio);
        elements.resizeWidth.value = newWidth;
    }
    updateOutputInfo();
});

elements.aspectLock.addEventListener('click', () => {
    state.aspectLocked = !state.aspectLocked;
    elements.aspectLock.classList.toggle('active', state.aspectLocked);
});

// Resize Presets
document.querySelectorAll('#resize-tab .preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const width = parseInt(btn.dataset.width);
        const height = parseInt(btn.dataset.height);

        // Clear active state from all presets
        document.querySelectorAll('#resize-tab .preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        elements.resizeWidth.value = width;
        elements.resizeHeight.value = height;
        state.aspectLocked = false;
        elements.aspectLock.classList.remove('active');
        updateOutputInfo();
    });
});

// Crop Controls
let cropAspectRatio = 1;

document.querySelectorAll('#crop-tab .preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#crop-tab .preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const ratio = btn.dataset.ratio;
        state.cropRatio = ratio;

        // Show/hide custom ratio inputs
        if (ratio === 'custom') {
            elements.customRatioInputs.style.display = 'block';
            // Apply current custom values
            const w = parseFloat(elements.customRatioW.value) || 1;
            const h = parseFloat(elements.customRatioH.value) || 1;
            cropAspectRatio = w / h;
        } else {
            elements.customRatioInputs.style.display = 'none';
            if (ratio === 'free') {
                cropAspectRatio = null;
            } else {
                const [w, h] = ratio.split(':').map(Number);
                cropAspectRatio = w / h;
            }
        }

        initializeCrop();
        updateOutputInfo();
    });
});

// Custom ratio apply button
elements.applyCustomRatio.addEventListener('click', () => {
    const w = parseFloat(elements.customRatioW.value) || 1;
    const h = parseFloat(elements.customRatioH.value) || 1;
    cropAspectRatio = w / h;
    state.cropRatio = `${w}:${h}`;
    initializeCrop();
    updateOutputInfo();
});

// Also apply on Enter key in custom ratio inputs
elements.customRatioW.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') elements.applyCustomRatio.click();
});
elements.customRatioH.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') elements.applyCustomRatio.click();
});

// Crop resize toggle
elements.cropResizeEnabled.addEventListener('change', () => {
    const enabled = elements.cropResizeEnabled.checked;
    elements.cropResizeOptions.style.display = enabled ? 'block' : 'none';

    if (enabled && !elements.cropOutputWidth.value) {
        // Initialize with current crop dimensions, maintaining exact aspect ratio
        const cropW = parseInt(elements.cropWidth.value) || 100;
        elements.cropOutputWidth.value = cropW;
        // Calculate height from aspect ratio for precision
        if (cropAspectRatio) {
            elements.cropOutputHeight.value = Math.round(cropW / cropAspectRatio);
        } else {
            elements.cropOutputHeight.value = parseInt(elements.cropHeight.value) || 100;
        }
    }
    updateOutputInfo();
});

// Crop output size inputs - maintain aspect ratio
elements.cropOutputWidth.addEventListener('input', () => {
    if (cropAspectRatio) {
        const width = parseInt(elements.cropOutputWidth.value) || 100;
        elements.cropOutputHeight.value = Math.round(width / cropAspectRatio);
    }
    updateOutputInfo();
});

elements.cropOutputHeight.addEventListener('input', () => {
    if (cropAspectRatio) {
        const height = parseInt(elements.cropOutputHeight.value) || 100;
        elements.cropOutputWidth.value = Math.round(height * cropAspectRatio);
    }
    updateOutputInfo();
});

elements.centerCrop.addEventListener('click', () => {
    centerCropBox();
});

// Crop Box Interaction
let isDragging = false;
let isResizing = false;
let dragHandle = null;
let startX, startY, startCrop;

function initializeCrop() {
    const img = elements.previewImage;
    const imgRect = img.getBoundingClientRect();

    const imgWidth = imgRect.width;
    const imgHeight = imgRect.height;

    let cropWidth, cropHeight;

    if (cropAspectRatio) {
        if (imgWidth / imgHeight > cropAspectRatio) {
            cropHeight = imgHeight * 0.8;
            cropWidth = cropHeight * cropAspectRatio;
        } else {
            cropWidth = imgWidth * 0.8;
            cropHeight = cropWidth / cropAspectRatio;
        }
    } else {
        cropWidth = imgWidth * 0.8;
        cropHeight = imgHeight * 0.8;
    }

    state.crop = {
        x: (imgWidth - cropWidth) / 2,
        y: (imgHeight - cropHeight) / 2,
        width: cropWidth,
        height: cropHeight
    };

    updateCropBox();
    updateCropInputs();
}

function updateCropBox() {
    const box = elements.cropBox;
    box.style.left = state.crop.x + 'px';
    box.style.top = state.crop.y + 'px';
    box.style.width = state.crop.width + 'px';
    box.style.height = state.crop.height + 'px';
}

function updateCropInputs() {
    const img = elements.previewImage;
    const scaleX = state.originalWidth / img.width;
    const scaleY = state.originalHeight / img.height;

    elements.cropWidth.value = Math.round(state.crop.width * scaleX);
    elements.cropHeight.value = Math.round(state.crop.height * scaleY);
}

function centerCropBox() {
    const img = elements.previewImage;
    state.crop.x = (img.width - state.crop.width) / 2;
    state.crop.y = (img.height - state.crop.height) / 2;
    updateCropBox();
}

elements.cropBox.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('crop-handle')) {
        isResizing = true;
        dragHandle = e.target.dataset.handle;
    } else {
        isDragging = true;
    }

    startX = e.clientX;
    startY = e.clientY;
    startCrop = { ...state.crop };

    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging && !isResizing) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const img = elements.previewImage;
    const imgWidth = img.width;
    const imgHeight = img.height;

    if (isDragging) {
        let newX = startCrop.x + dx;
        let newY = startCrop.y + dy;

        newX = Math.max(0, Math.min(newX, imgWidth - state.crop.width));
        newY = Math.max(0, Math.min(newY, imgHeight - state.crop.height));

        state.crop.x = newX;
        state.crop.y = newY;
    } else if (isResizing) {
        let newWidth = startCrop.width;
        let newHeight = startCrop.height;
        let newX = startCrop.x;
        let newY = startCrop.y;

        if (dragHandle.includes('e')) {
            newWidth = Math.max(50, startCrop.width + dx);
        }
        if (dragHandle.includes('w')) {
            const dw = Math.min(dx, startCrop.width - 50);
            newWidth = startCrop.width - dw;
            newX = startCrop.x + dw;
        }
        if (dragHandle.includes('s')) {
            newHeight = Math.max(50, startCrop.height + dy);
        }
        if (dragHandle.includes('n')) {
            const dh = Math.min(dy, startCrop.height - 50);
            newHeight = startCrop.height - dh;
            newY = startCrop.y + dh;
        }

        // Apply aspect ratio constraint
        if (cropAspectRatio) {
            if (dragHandle === 'e' || dragHandle === 'w') {
                newHeight = newWidth / cropAspectRatio;
            } else if (dragHandle === 'n' || dragHandle === 's') {
                newWidth = newHeight * cropAspectRatio;
            } else {
                // Corner handles
                const aspectFromWidth = newWidth / cropAspectRatio;
                const aspectFromHeight = newHeight * cropAspectRatio;

                if (Math.abs(newHeight - aspectFromWidth) < Math.abs(newWidth - aspectFromHeight)) {
                    newHeight = aspectFromWidth;
                } else {
                    newWidth = aspectFromHeight;
                }
            }
        }

        // Bounds check
        newWidth = Math.min(newWidth, imgWidth - newX);
        newHeight = Math.min(newHeight, imgHeight - newY);
        newX = Math.max(0, newX);
        newY = Math.max(0, newY);

        state.crop = { x: newX, y: newY, width: newWidth, height: newHeight };
        updateCropInputs();
    }

    updateCropBox();
    updateOutputInfo();
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    isResizing = false;
    dragHandle = null;
});

// Compress Controls
elements.qualitySlider.addEventListener('input', () => {
    state.quality = parseInt(elements.qualitySlider.value);
    elements.qualityValue.textContent = state.quality + '%';
    updateOutputInfo();
});

elements.outputFormat.addEventListener('change', () => {
    state.outputFormat = elements.outputFormat.value;

    // Show/hide quality slider based on format
    const format = state.outputFormat === 'original' ? state.originalFormat : state.outputFormat;
    const showQuality = format === 'image/jpeg' || format === 'image/webp';
    elements.qualityGroup.style.display = showQuality ? 'block' : 'none';

    updateOutputInfo();
});

elements.maxDimension.addEventListener('input', updateOutputInfo);

// Zoom Controls
elements.zoomIn.addEventListener('click', () => {
    state.zoom = Math.min(state.zoom + 0.25, 3);
    applyZoom();
});

elements.zoomOut.addEventListener('click', () => {
    state.zoom = Math.max(state.zoom - 0.25, 0.25);
    applyZoom();
});

elements.zoomFit.addEventListener('click', () => {
    state.zoom = 1;
    applyZoom();
});

function applyZoom() {
    elements.previewImage.style.transform = `scale(${state.zoom})`;
    elements.zoomLevel.textContent = Math.round(state.zoom * 100) + '%';

    if (state.currentTab === 'crop') {
        initializeCrop();
    }
}

// Update Output Info
function updateOutputInfo() {
    let outputWidth, outputHeight, outputFormat;

    if (state.currentTab === 'resize') {
        outputWidth = parseInt(elements.resizeWidth.value) || state.originalWidth;
        outputHeight = parseInt(elements.resizeHeight.value) || state.originalHeight;

        // Apply no-upscale constraint
        if (elements.noUpscale.checked) {
            if (outputWidth > state.originalWidth) {
                const scale = state.originalWidth / outputWidth;
                outputWidth = state.originalWidth;
                if (state.aspectLocked) {
                    outputHeight = Math.round(outputHeight * scale);
                }
            }
            if (outputHeight > state.originalHeight) {
                const scale = state.originalHeight / outputHeight;
                outputHeight = state.originalHeight;
                if (state.aspectLocked) {
                    outputWidth = Math.round(outputWidth * scale);
                }
            }
        }

        outputFormat = state.originalFormat;
    } else if (state.currentTab === 'crop') {
        const img = elements.previewImage;
        const scaleX = state.originalWidth / img.width;
        const scaleY = state.originalHeight / img.height;

        // Get crop area dimensions
        const cropW = Math.round(state.crop.width * scaleX);
        const cropH = Math.round(state.crop.height * scaleY);

        // Check if resize is enabled
        if (elements.cropResizeEnabled.checked) {
            outputWidth = parseInt(elements.cropOutputWidth.value) || cropW;
            outputHeight = parseInt(elements.cropOutputHeight.value) || cropH;
        } else {
            outputWidth = cropW;
            outputHeight = cropH;
        }
        outputFormat = state.originalFormat;
    } else if (state.currentTab === 'compress') {
        outputWidth = state.originalWidth;
        outputHeight = state.originalHeight;

        const maxDim = parseInt(elements.maxDimension.value);
        if (maxDim && maxDim > 0) {
            const maxOriginal = Math.max(outputWidth, outputHeight);
            if (maxOriginal > maxDim) {
                const scale = maxDim / maxOriginal;
                outputWidth = Math.round(outputWidth * scale);
                outputHeight = Math.round(outputHeight * scale);
            }
        }

        outputFormat = state.outputFormat === 'original' ? state.originalFormat : state.outputFormat;
    }

    elements.outputFormatDisplay.textContent = getFormatName(outputFormat);
    elements.outputDimensions.textContent = `${outputWidth} × ${outputHeight}`;

    // Estimate file size (rough approximation)
    const pixels = outputWidth * outputHeight;
    let estimatedSize;

    if (outputFormat === 'image/png') {
        estimatedSize = pixels * 3 * 0.5; // PNG with compression
    } else if (outputFormat === 'image/webp') {
        estimatedSize = pixels * 3 * (state.quality / 100) * 0.3;
    } else {
        estimatedSize = pixels * 3 * (state.quality / 100) * 0.15;
    }

    elements.outputSize.textContent = '~' + formatFileSize(estimatedSize);
}

// Reset
elements.resetBtn.addEventListener('click', () => {
    elements.editor.classList.remove('active');
    elements.uploadArea.classList.remove('hidden');
    elements.fileInput.value = '';
    state.zoom = 1;
    elements.previewImage.style.transform = 'scale(1)';
    elements.zoomLevel.textContent = '100%';
});

// Download
elements.downloadBtn.addEventListener('click', async () => {
    elements.loading.classList.add('active');

    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        let outputWidth, outputHeight, sx = 0, sy = 0, sw = state.originalWidth, sh = state.originalHeight;
        let outputFormat = state.originalFormat;
        let quality = state.quality / 100;

        if (state.currentTab === 'resize') {
            outputWidth = parseInt(elements.resizeWidth.value) || state.originalWidth;
            outputHeight = parseInt(elements.resizeHeight.value) || state.originalHeight;

            if (elements.noUpscale.checked) {
                if (outputWidth > state.originalWidth) {
                    const scale = state.originalWidth / outputWidth;
                    outputWidth = state.originalWidth;
                    if (state.aspectLocked) outputHeight = Math.round(outputHeight * scale);
                }
                if (outputHeight > state.originalHeight) {
                    const scale = state.originalHeight / outputHeight;
                    outputHeight = state.originalHeight;
                    if (state.aspectLocked) outputWidth = Math.round(outputWidth * scale);
                }
            }
        } else if (state.currentTab === 'crop') {
            const img = elements.previewImage;
            const scaleX = state.originalWidth / img.width;
            const scaleY = state.originalHeight / img.height;

            sx = state.crop.x * scaleX;
            sy = state.crop.y * scaleY;
            sw = state.crop.width * scaleX;
            sh = state.crop.height * scaleY;

            // Check if resize is enabled
            if (elements.cropResizeEnabled.checked) {
                outputWidth = parseInt(elements.cropOutputWidth.value) || Math.round(sw);
                outputHeight = parseInt(elements.cropOutputHeight.value) || Math.round(sh);
            } else {
                outputWidth = Math.round(sw);
                outputHeight = Math.round(sh);
            }
        } else if (state.currentTab === 'compress') {
            outputWidth = state.originalWidth;
            outputHeight = state.originalHeight;

            const maxDim = parseInt(elements.maxDimension.value);
            if (maxDim && maxDim > 0) {
                const maxOriginal = Math.max(outputWidth, outputHeight);
                if (maxOriginal > maxDim) {
                    const scale = maxDim / maxOriginal;
                    outputWidth = Math.round(outputWidth * scale);
                    outputHeight = Math.round(outputHeight * scale);
                }
            }

            outputFormat = state.outputFormat === 'original' ? state.originalFormat : state.outputFormat;
        }

        canvas.width = outputWidth;
        canvas.height = outputHeight;

        // Draw image
        ctx.drawImage(state.originalImage, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);

        // Convert to blob
        const blob = await new Promise(resolve => {
            if (outputFormat === 'image/png') {
                canvas.toBlob(resolve, 'image/png');
            } else {
                canvas.toBlob(resolve, outputFormat, quality);
            }
        });

        // Generate filename
        const originalName = state.originalFile.name.replace(/\.[^.]+$/, '');
        const action = state.currentTab;
        const ext = getFormatExtension(outputFormat);
        const filename = `${originalName}_${action}_${outputWidth}x${outputHeight}.${ext}`;

        // Download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error processing image:', error);
        alert('Error processing image. Please try again.');
    } finally {
        elements.loading.classList.remove('active');
    }
});

// Initialize quality group visibility
elements.qualityGroup.style.display = 'block';
