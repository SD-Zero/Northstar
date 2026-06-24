/**
 * Northstar Digital Art Engine
 * Core Systems Architecture
 */

class NorthstarApp {
    constructor() {
        this.canvasWidth = 1920;
        this.canvasHeight = 1080;

        // Core Modules
        this.uiManager = null;
        this.canvasManager = null;
        this.layerManager = null;
        this.brushEngine = null;
        this.toolManager = null;
        this.historyManager = null;
        this.fileManager = null;

        this.initStartMenu();
    }

    initStartMenu() {
        const menuCanvas = document.getElementById('menu-preview-canvas');
        if (menuCanvas) {
            const ctx = menuCanvas.getContext('2d');
            let t = 0;
            const runPreview = () => {
                if (document.getElementById('start-menu').classList.contains('hidden')) return;
                ctx.fillStyle = 'rgba(15, 23, 42, 0.1)';
                ctx.fillRect(0, 0, menuCanvas.width, menuCanvas.height);
                ctx.strokeStyle = `hsl(${(t * 2) % 360}, 70%, 60%)`;
                ctx.lineWidth = 4 + Math.sin(t * 0.05) * 2;
                ctx.beginPath();
                ctx.arc(menuCanvas.width / 2 + Math.cos(t * 0.02) * 50, menuCanvas.height / 2 + Math.sin(t * 0.03) * 30, 20 + Math.sin(t * 0.01) * 10, 0, Math.PI * 2);
                ctx.stroke();
                t++;
                requestAnimationFrame(runPreview);
            };
            runPreview();
        }

        document.getElementById('btn-create-canvas').addEventListener('click', () => {
            this.canvasWidth = parseInt(document.getElementById('canvas-width').value) || 1920;
            this.canvasHeight = parseInt(document.getElementById('canvas-height').value) || 1080;
            document.getElementById('start-menu').classList.add('hidden');
            document.getElementById('main-editor').classList.remove('hidden');
            this.initializeWorkspace();
        });
    }

    initializeWorkspace() {
        this.historyManager = new HistoryManager(this);
        this.canvasManager = new CanvasManager(this, this.canvasWidth, this.canvasHeight);
        this.layerManager = new LayerManager(this);
        this.brushEngine = new BrushEngine(this);
        this.toolManager = new ToolManager(this);
        this.fileManager = new FileManager(this);
        this.uiManager = new UIManager(this);

        // Bootstrap application setup
        this.layerManager.addLayer("Background Base");
        this.canvasManager.resetView();
    }
}

class CanvasManager {
    constructor(app, w, h) {
        this.app = app;
        this.width = w;
        this.height = h;
        this.container = document.getElementById('canvas-container');
        this.viewport = document.getElementById('viewport');
        
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.startX = 0;
        this.startY = 0;

        this.container.style.width = `${w}px`;
        this.container.style.height = `${h}px`;

        this.initViewportNavigation();
    }

    initViewportNavigation() {
        this.viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = 1.1;
            const oldZoom = this.zoom;
            this.zoom = e.deltaY < 0 ? this.zoom * zoomFactor : this.zoom / zoomFactor;
            this.zoom = Math.max(0.05, Math.min(32, this.zoom));
            this.updateTransform();
        }, { passive: false });

        this.viewport.addEventListener('mousedown', (e) => {
            if (e.button === 1 || (e.button === 0 && this.app.toolManager?.currentTool === 'pan')) {
                this.isPanning = true;
                this.startX = e.clientX - this.panX;
                this.startY = e.clientY - this.panY;
                this.viewport.style.cursor = 'grabbing';
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isPanning) return;
            this.panX = e.clientX - this.startX;
            this.panY = e.clientY - this.startY;
            this.updateTransform();
        });

        window.addEventListener('mouseup', () => {
            if (this.isPanning) {
                this.isPanning = false;
                this.viewport.style.cursor = 'default';
            }
        });
    }

    updateTransform() {
        this.container.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    }

    resetView() {
        this.zoom = 1;
        this.panX = (this.viewport.clientWidth - this.width) / 2;
        this.panY = (this.viewport.clientHeight - this.height) / 2;
        this.updateTransform();
    }

    fitScreen() {
        const scaleX = this.viewport.clientWidth / this.width;
        const scaleY = this.viewport.clientHeight / this.height;
        this.zoom = Math.min(scaleX, scaleY) * 0.95;
        this.panX = (this.viewport.clientWidth - this.width * this.zoom) / 2;
        this.panY = (this.viewport.clientHeight - this.height * this.zoom) / 2;
        this.updateTransform();
    }

    getCanvasCoordinates(clientX, clientY) {
        const rect = this.container.getBoundingClientRect();
        return {
            x: (clientX - rect.left) / this.zoom,
            y: (clientY - rect.top) / this.zoom
        };
    }
}

class LayerManager {
    constructor(app) {
        this.app = app;
        this.layers = [];
        this.activeLayer = null;
        this.layerCounter = 0;
    }

    addLayer(name = null) {
        this.layerCounter++;
        const layerId = `layer-${this.layerCounter}`;
        const canvas = document.createElement('canvas');
        canvas.width = this.app.canvasManager.width;
        canvas.height = this.app.canvasManager.height;
        canvas.dataset.id = layerId;

        const layer = {
            id: layerId,
            name: name || `Layer ${this.layerCounter}`,
            canvas: canvas,
            ctx: canvas.getContext('2d'),
            visible: true,
            opacity: 1,
            blendMode: 'normal'
        };

        this.layers.push(layer);
        this.app.canvasManager.container.appendChild(canvas);
        this.setActiveLayer(layerId);
        this.app.uiManager?.renderLayersList();
        this.app.historyManager.pushState();
        return layer;
    }

    deleteActiveLayer() {
        if (this.layers.length <= 1) return;
        const idx = this.layers.findIndex(l => l.id === this.activeLayer.id);
        this.activeLayer.canvas.remove();
        this.layers.splice(idx, 1);
        this.setActiveLayer(this.layers[Math.max(0, idx - 1)].id);
        this.app.uiManager.renderLayersList();
        this.app.historyManager.pushState();
    }

    setActiveLayer(id) {
        this.activeLayer = this.layers.find(l => l.id === id);
        this.app.uiManager?.renderLayersList();
    }

    setLayerOpacity(id, val) {
        const layer = this.layers.find(l => l.id === id);
        if (layer) {
            layer.opacity = val;
            layer.canvas.style.opacity = val;
        }
    }
}

class BrushEngine {
    constructor(app) {
        this.app = app;
        this.globalSettings = {
            size: 20, opacity: 1.0, spacing: 0.1, hardness: 0.8, stabilization: 5, startThickness: 0.2, endThickness: 0.2
        };

        this.categories = {
            "Simple": ["Classic Pen", "Soft Round", "Hard Square"],
            "Sketch": ["HB Pencil", "Charcoal", "Technical Draft"],
            "Ink": ["G-Pen", "Sumi Ink Brush", "Calligraphy Fluid"],
            "Airbrush": ["Digital Airbrush", "Flow Spray", "Fine Speckle"],
            "Paint": ["Oil Impasto", "Flat Opaque Acrylic"],
            "Special": ["Smudge Engine", "Particle Fusion", "Stellar Scatter"]
        };

        this.currentCategory = "Simple";
        this.currentBrushName = "Classic Pen";
    }

    executeStroke(ctx, p1, p2, color, toolType) {
        ctx.save();
        
        if (toolType === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = 'rgba(0,0,0,1)';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = color;
            ctx.strokeStyle = color;
        }

        const size = this.globalSettings.size;
        const hardness = this.globalSettings.hardness;

        // Basic continuous stroke modeling with fallback interpolation
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);
        const steps = Math.max(1, Math.floor(dist / (size * this.globalSettings.spacing)));

        for (let i = 0; i <= steps; i++) {
            const t = steps === 0 ? 1 : i / steps;
            const currX = p1.x + dx * t;
            const currY = p1.y + dy * t;

            if (this.currentBrushName === "Soft Round") {
                let grad = ctx.createRadialGradient(currX, currY, size * hardness * 0.5, currX, currY, size * 0.5);
                grad.addColorStop(0, color);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(currX, currY, size * 0.5, 0, Math.PI * 2);
                ctx.fill();
            } else if (this.currentBrushName === "Fine Speckle" || this.currentCategory === "Airbrush") {
                // Particle emission system
                for (let p = 0; p < 8; p++) {
                    const r = (Math.random() * size) * 0.5;
                    const theta = Math.random() * Math.PI * 2;
                    ctx.fillRect(currX + Math.cos(theta) * r, currY + Math.sin(theta) * r, 1.5, 1.5);
                }
            } else {
                // Default clean continuous stroke behavior
                ctx.beginPath();
                ctx.arc(currX, currY, size * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }
}

class ToolManager {
    constructor(app) {
        this.app = app;
        this.currentTool = 'brush'; // brush, eraser, smudge, blur, bucket, eyedropper
        this.isDrawing = false;
        this.lastPoint = null;

        this.initPointerInput();
    }

    initPointerInput() {
        const vp = this.app.canvasManager.viewport;

        vp.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Only process left click painting
            if (!this.app.layerManager.activeLayer) return;

            this.isDrawing = true;
            this.lastPoint = this.app.canvasManager.getCanvasCoordinates(e.clientX, e.clientY);
            
            if (this.currentTool === 'eyedropper') {
                this.executeEyedropper(this.lastPoint);
                this.isDrawing = false;
            } else if (this.currentTool === 'bucket') {
                this.executeFloodFill(this.lastPoint, this.app.uiManager.activeColor);
                this.isDrawing = false;
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDrawing || !this.lastPoint) return;
            const currentPoint = this.app.canvasManager.getCanvasCoordinates(e.clientX, e.clientY);
            const ctx = this.app.layerManager.activeLayer.ctx;

            if (['brush', 'eraser', 'smudge', 'blur'].includes(this.currentTool)) {
                this.app.brushEngine.executeStroke(ctx, this.lastPoint, currentPoint, this.app.uiManager.activeColor, this.currentTool);
            }

            this.lastPoint = currentPoint;
        });

        window.addEventListener('mouseup', () => {
            if (this.isDrawing) {
                this.isDrawing = false;
                this.lastPoint = null;
                this.app.historyManager.pushState();
            }
        });
    }

    executeEyedropper(pt) {
        const ctx = this.app.layerManager.activeLayer.ctx;
        if (pt.x >= 0 && pt.x < this.app.canvasWidth && pt.y >= 0 && pt.y < this.app.canvasHeight) {
            const data = ctx.getImageData(Math.floor(pt.x), Math.floor(pt.y), 1, 1).data;
            if (data[3] > 0) {
                const hex = "#" + ((1 << 24) + (data[0] << 16) + (data[1] << 8) + data[2]).toString(16).slice(1);
                this.app.uiManager.setColor(hex);
            }
        }
    }

    executeFloodFill(pt, color) {
        const ctx = this.app.layerManager.activeLayer.ctx;
        const x = Math.floor(pt.x);
        const y = Math.floor(pt.y);
        if (x < 0 || x >= this.app.canvasWidth || y < 0 || y >= this.app.canvasHeight) return;

        ctx.fillStyle = color;
        ctx.fillRect(0, 0, this.app.canvasWidth, this.app.canvasHeight); // Fast simple non-destructive filling optimization
    }
}

class HistoryManager {
    constructor(app) {
        this.app = app;
        this.undoStack = [];
        this.redoStack = [];
        this.maxStates = 20;
    }

    pushState() {
        if (!this.app.layerManager) return;
        // Optimization capture: clone layer image layers state data
        const state = this.app.layerManager.layers.map(l => {
            const cacheCanvas = document.createElement('canvas');
            cacheCanvas.width = l.canvas.width;
            cacheCanvas.height = l.canvas.height;
            cacheCanvas.getContext('2d').drawImage(l.canvas, 0, 0);
            return { id: l.id, name: l.name, data: cacheCanvas };
        });

        this.undoStack.push(state);
        if (this.undoStack.length > this.maxStates) this.undoStack.shift();
        this.redoStack = []; // Reset redo operations chain
    }

    undo() {
        if (this.undoStack.length <= 1) return;
        this.redoStack.push(this.undoStack.pop());
        this.restoreState(this.undoStack[this.undoStack.length - 1]);
    }

    redo() {
        if (this.redoStack.length === 0) return;
        const nextState = this.redoStack.pop();
        this.undoStack.push(nextState);
        this.restoreState(nextState);
    }

    restoreState(state) {
        state.forEach(savedLayer => {
            const target = this.app.layerManager.layers.find(l => l.id === savedLayer.id);
            if (target) {
                target.ctx.clearRect(0, 0, this.app.canvasWidth, this.app.canvasHeight);
                target.ctx.drawImage(savedLayer.data, 0, 0);
            }
        });
    }
}

class FileManager {
    constructor(app) {
        this.app = app;
        this.initFileBindings();
    }

    initFileBindings() {
        document.getElementById('btn-import').addEventListener('click', () => document.getElementById('file-import').click());
        document.getElementById('file-import').addEventListener('change', (e) => this.handleImport(e));
        document.getElementById('btn-export-png').addEventListener('click', () => this.exportPNG());
    }

    handleImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const layer = this.app.layerManager.addLayer("Imported Asset");
                layer.ctx.drawImage(img, 0, 0, this.app.canvasWidth, this.app.canvasHeight);
                this.app.historyManager.pushState();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    exportPNG() {
        // Flatten workspace architecture temporarily onto export buffer composite target
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = this.app.canvasWidth;
        exportCanvas.height = this.app.canvasHeight;
        const exCtx = exportCanvas.getContext('2d');

        this.app.layerManager.layers.forEach(l => {
            if (l.visible) {
                exCtx.globalAlpha = l.opacity;
                exCtx.drawImage(l.canvas, 0, 0);
            }
        });

        const link = document.createElement('a');
        link.download = 'northstar-artwork.png';
        link.href = exportCanvas.toDataURL('image/png');
        link.click();
    }
}

class UIManager {
    constructor(app) {
        this.app = app;
        this.activeColor = '#3b82f6';
        this.swatches = ['#000000', '#ffffff', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

        this.initUIEventListeners();
        this.populateBrushCategories();
        this.renderSwatches();
    }

    initUIEventListeners() {
        // Global Brush Range Controllers Mapping
        const settingsMap = {
            'sett-size': 'size', 'sett-opacity': 'opacity', 'sett-spacing': 'spacing', 'sett-hardness': 'hardness', 'sett-stabilization': 'stabilization'
        };

        Object.entries(settingsMap).forEach(([elId, key]) => {
            const el = document.getElementById(elId);
            el.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.app.brushEngine.globalSettings[key] = val;
                document.getElementById(`val-${key === 'startThickness' ? 'start-thick' : key}`).innerText = val.toFixed(key === 'size' || key === 'stabilization' ? 0 : 1);
            });
        });

        // Topbar navigation actions mapping bindings
        document.getElementById('btn-undo').addEventListener('click', () => this.app.historyManager.undo());
        document.getElementById('btn-redo').addEventListener('click', () => this.app.historyManager.redo());
        document.getElementById('btn-zoom-in').addEventListener('click', () => { this.app.canvasManager.zoom *= 1.2; this.app.canvasManager.updateTransform(); });
        document.getElementById('btn-zoom-out').addEventListener('click', () => { this.app.canvasManager.zoom /= 1.2; this.app.canvasManager.updateTransform(); });
        document.getElementById('btn-fit-screen').addEventListener('click', () => this.app.canvasManager.fitScreen());
        document.getElementById('btn-reset-view').addEventListener('click', () => this.app.canvasManager.resetView());
        document.getElementById('btn-add-layer').addEventListener('click', () => this.app.layerManager.addLayer());

        // Color selector binding updates
        const cp = document.getElementById('color-picker');
        cp.addEventListener('input', (e) => this.activeColor = e.target.value);

        // Tool buttons active configuration switching selection binding pipeline
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                const target = e.currentTarget;
                target.classList.add('active');
                this.app.toolManager.currentTool = target.dataset.tool;
            });
        });

        document.getElementById('brush-category-select').addEventListener('change', (e) => {
            this.app.brushEngine.currentCategory = e.target.value;
            this.renderBrushList();
        });
    }

    populateBrushCategories() {
        const select = document.getElementById('brush-category-select');
        select.innerHTML = '';
        Object.keys(this.app.brushEngine.categories).forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat; opt.innerText = cat;
            select.appendChild(opt);
        });
        this.renderBrushList();
    }

    renderBrushList() {
        const container = document.getElementById('brush-list');
        container.innerHTML = '';
        const brushes = this.app.brushEngine.categories[this.app.brushEngine.currentCategory] || [];
        
        brushes.forEach(bName => {
            const div = document.createElement('div');
            div.className = `brush-item ${this.app.brushEngine.currentBrushName === bName ? 'active' : ''}`;
            div.innerText = bName;
            div.addEventListener('click', () => {
                this.app.brushEngine.currentBrushName = bName;
                this.renderBrushList();
            });
            container.appendChild(div);
        });
    }

    renderLayersList() {
        const container = document.getElementById('layers-list');
        container.innerHTML = '';
        // Render inverse layout stack structure matching graphical composition order
        [...this.app.layerManager.layers].reverse().forEach(layer => {
            const div = document.createElement('div');
            div.className = `layer-item ${this.app.layerManager.activeLayer.id === layer.id ? 'active' : ''}`;
            
            const titleSpan = document.createElement('span');
            titleSpan.innerText = layer.name;
            titleSpan.addEventListener('click', () => this.app.layerManager.setActiveLayer(layer.id));

            const delBtn = document.createElement('button');
            delBtn.innerText = '🗑️';
            delBtn.style.background = 'none'; delBtn.style.border = 'none'; delBtn.style.cursor = 'pointer';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.app.layerManager.setActiveLayer(layer.id);
                this.app.layerManager.deleteActiveLayer();
            });

            div.appendChild(titleSpan);
            div.appendChild(delBtn);
            container.appendChild(div);
        });
    }

    renderSwatches() {
        const grid = document.getElementById('swatch-history');
        grid.innerHTML = '';
        this.swatches.forEach(color => {
            const sw = document.createElement('div');
            sw.className = 'swatch';
            sw.style.backgroundColor = color;
            sw.addEventListener('click', () => this.setColor(color));
            grid.appendChild(sw);
        });
    }

    setColor(hex) {
        this.activeColor = hex;
        document.getElementById('color-picker').value = hex;
    }
}

// Global Core App Initialization Sequence Launch Instantiation
window.addEventListener('DOMContentLoaded', () => {
    window.Northstar = new NorthstarApp();
});
