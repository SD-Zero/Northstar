/**
 * Northstar Architecture Map Engine
 */

// Application Core Orchestrator
class NorthstarApp {
    constructor() {
        this.canvasWidth = 1920;
        this.canvasHeight = 1080;
        
        // Modules initialization
        this.colorManager = new ColorManager(this);
        this.layerManager = new LayerManager(this);
        this.canvasManager = new CanvasManager(this);
        this.historyManager = new HistoryManager(this);
        this.brushEngine = new BrushEngine(this);
        this.toolManager = new ToolManager(this);
        this.fileManager = new FileManager(this);
        this.uiManager = new UIManager(this);

        this.initStartScreen();
    }

    initStartScreen() {
        const pCanvas = document.getElementById('preview-canvas');
        if (pCanvas) {
            const pCtx = pCanvas.getContext('2d');
            let t = 0;
            const runPreview = () => {
                if (document.getElementById('start-screen').classList.contains('active')) {
                    pCanvas.width = pCanvas.offsetWidth;
                    pCanvas.height = pCanvas.offsetHeight;
                    pCtx.clearRect(0,0,pCanvas.width,pCanvas.height);
                    pCtx.strokeStyle = `hsl(${(t*2)%360}, 70%, 60%)`;
                    pCtx.lineWidth = 6;
                    pCtx.lineCap = 'round';
                    pCtx.beginPath();
                    for(let i=0; i<100; i++) {
                        let x = (pCanvas.width/2) + Math.cos(t + i*0.05) * (i * 1.5);
                        let y = (pCanvas.height/2) + Math.sin(t + i*0.05) * (i * 1.2);
                        if (i===0) pCtx.moveTo(x,y); else pCtx.lineTo(x,y);
                    }
                    pCtx.stroke();
                    t += 0.02;
                    requestAnimationFrame(runPreview);
                }
            };
            runPreview();
        }

        document.getElementById('create-btn').addEventListener('click', () => {
            this.canvasWidth = parseInt(document.getElementById('canvas-width').value) || 1920;
            this.canvasHeight = parseInt(document.getElementById('canvas-height').value) || 1080;
            
            document.getElementById('start-screen').classList.remove('active');
            document.getElementById('app-workspace').classList.add('active');
            
            this.startApplication();
        });
    }

    startApplication() {
        this.canvasManager.setupWorkspace(this.canvasWidth, this.canvasHeight);
        this.colorManager.init();
        this.layerManager.init();
        this.brushEngine.init();
        this.toolManager.init();
        this.uiManager.init();
        this.historyManager.pushState(); // Base layer state
    }
}

class CanvasManager {
    constructor(app) {
        this.app = app;
        this.container = document.getElementById('canvas-container');
        this.viewport = document.getElementById('viewport');
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.startX = 0;
        this.startY = 0;
    }

    setupWorkspace(w, h) {
        this.container.style.width = w + 'px';
        this.container.style.height = h + 'px';
        this.centerViewport();
        this.setupNavigation();
    }

    centerViewport() {
        const vw = this.viewport.offsetWidth;
        const vh = this.viewport.offsetHeight;
        this.zoom = Math.min((vw - 60) / this.app.canvasWidth, (vh - 60) / this.app.canvasHeight, 1);
        this.panX = (vw - this.app.canvasWidth * this.zoom) / 2;
        this.panY = (vh - this.app.canvasHeight * this.zoom) / 2;
        this.updateTransform();
    }

    updateTransform() {
        this.container.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
        document.getElementById('doc-info').innerText = `${this.app.canvasWidth} x ${this.app.canvasHeight} | ${Math.round(this.zoom * 100)}%`;
    }

    setupNavigation() {
        this.viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = 1.1;
            const oldZoom = this.zoom;
            if (e.deltaY < 0) this.zoom *= zoomFactor;
            else this.zoom /= zoomFactor;
            this.zoom = Math.max(0.05, Math.min(this.zoom, 40));

            const rect = this.viewport.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            this.panX = mouseX - (mouseX - this.panX) * (this.zoom / oldZoom);
            this.panY = mouseY - (mouseY - this.panY) * (this.zoom / oldZoom);
            this.updateTransform();
        }, { passive: false });

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') this.isPanningSpace = true;
        });
        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') this.isPanningSpace = false;
        });

        this.viewport.addEventListener('mousedown', (e) => {
            if (this.isPanningSpace || e.button === 1 || this.app.toolManager.currentTool === 'pan') {
                this.isPanning = true;
                this.startX = e.clientX - this.panX;
                this.startY = e.clientY - this.panY;
                e.stopPropagation();
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                this.panX = e.clientX - this.startX;
                this.panY = e.clientY - this.startY;
                this.updateTransform();
            }
        });

        window.addEventListener('mouseup', () => { this.isPanning = false; });
    }

    getCanvasCoordinates(e) {
        const rect = this.container.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / this.zoom,
            y: (e.clientY - rect.top) / this.zoom
        };
    }
}

class ColorManager {
    constructor(app) {
        this.app = app;
        this.r = 0; this.g = 0; this.b = 0; this.a = 1;
        this.h = 0; this.s = 1; this.v = 1;
        this.recent = [];
        this.custom = [];
    }

    init() {
        this.block = document.getElementById('color-block');
        this.strip = document.getElementById('color-strip');
        this.bCtx = this.block.getContext('2d');
        this.sCtx = this.strip.getContext('2d');

        this.renderStrip();
        this.renderBlock();
        this.setupPickerEvents();
        this.updateColorFromHSV();

        document.getElementById('add-swatch-btn').addEventListener('click', () => {
            this.addCustomSwatch(this.getRGBAString());
        });

        const inputs = ['rgb-r', 'rgb-g', 'rgb-b'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.updateFromRGBInputs());
        });
        document.getElementById('color-alpha').addEventListener('input', (e) => {
            this.a = parseFloat(e.target.value);
            this.updateUI();
        });
    }

    renderStrip() {
        this.sCtx.clearRect(0,0,20,150);
        const grad = this.sCtx.createLinearGradient(0,0,0,150);
        for(let i=0; i<=360; i+=30) grad.addColorStop(i/360, `hsl(${i}, 100%, 50%)`);
        this.sCtx.fillStyle = grad;
        this.sCtx.fillRect(0,0,20,150);
    }

    renderBlock() {
        this.bCtx.clearRect(0,0,150,150);
        this.bCtx.fillStyle = `hsl(${this.h}, 100%, 50%)`;
        this.bCtx.fillRect(0,0,150,150);

        const whiteGrad = this.bCtx.createLinearGradient(0,0,150,0);
        whiteGrad.addColorStop(0, 'rgba(255,255,255,1)');
        whiteGrad.addColorStop(1, 'rgba(255,255,255,0)');
        this.bCtx.fillStyle = whiteGrad;
        this.bCtx.fillRect(0,0,150,150);

        const blackGrad = this.bCtx.createLinearGradient(0,0,0,150);
        blackGrad.addColorStop(0, 'rgba(0,0,0,0)');
        blackGrad.addColorStop(1, 'rgba(0,0,0,1)');
        this.bCtx.fillStyle = blackGrad;
        this.bCtx.fillRect(0,0,150,150);
    }

    setupPickerEvents() {
        let draggingBlock = false;
        let draggingStrip = false;

        this.strip.addEventListener('mousedown', (e) => { draggingStrip = true; handleStrip(e, this); });
        this.block.addEventListener('mousedown', (e) => { draggingBlock = true; handleBlock(e, this); });

        window.addEventListener('mousemove', (e) => {
            if (draggingStrip) handleStrip(e, this);
            if (draggingBlock) handleBlock(e, this);
        });
        window.addEventListener('mouseup', () => { draggingBlock = false; draggingStrip = false; });

        function handleStrip(e, self) {
            const rect = self.strip.getBoundingClientRect();
            const y = Math.max(0, Math.min(149, e.clientY - rect.top));
            self.h = (y / 150) * 360;
            self.renderBlock();
            self.updateColorFromHSV();
        }

        function handleBlock(e, self) {
            const rect = self.block.getBoundingClientRect();
            self.s = Math.max(0, Math.min(149, e.clientX - rect.left)) / 150;
            self.v = 1 - (Math.max(0, Math.min(149, e.clientY - rect.top)) / 150);
            self.updateColorFromHSV();
        }
    }

    updateColorFromHSV() {
        const c = this.v * this.s;
        const x = c * (1 - Math.abs(((this.h / 60) % 2) - 1));
        const m = this.v - c;
        let r=0, g=0, b=0;

        if (this.h<60) {r=c;g=x;}
        else if (this.h<120) {r=x;g=c;}
        else if (this.h<180) {g=c;b=x;}
        else if (this.h<240) {g=x;b=c;}
        else if (this.h<300) {r=x;b=c;}
        else {r=c;b=x;}

        this.r = Math.round((r+m)*255);
        this.g = Math.round((g+m)*255);
        this.b = Math.round((b+m)*255);
        this.updateUI();
    }

    updateFromRGBInputs() {
        this.r = parseInt(document.getElementById('rgb-r').value)||0;
        this.g = parseInt(document.getElementById('rgb-g').value)||0;
        this.b = parseInt(document.getElementById('rgb-b').value)||0;
        // Approximation back-calculation to keep picker unified
        let r = this.r/255, g = this.g/255, b = this.b/255;
        let max = Math.max(r,g,b), min = Math.min(r,g,b);
        this.v = max;
        let d = max - min;
        this.s = max === 0 ? 0 : d / max;
        if(max === min) this.h = 0;
        else {
            if(max===r) this.h = (g-b)/d + (g<b?6:0);
            else if(max===g) this.h = (b-r)/d + 2;
            else if(max===b) this.h = (r-g)/d + 4;
            this.h *= 60;
        }
        this.renderBlock();
        this.updateUI();
    }

    updateUI() {
        const rgba = this.getRGBAString();
        document.getElementById('color-preview').style.backgroundColor = rgba;
        document.getElementById('rgb-r').value = this.r;
        document.getElementById('rgb-g').value = this.g;
        document.getElementById('rgb-b').value = this.b;
    }

    getRGBAString() {
        return `rgba(${this.r},${this.g},${this.b},${this.a})`;
    }

    pushRecent(colorStr) {
        if (this.recent.includes(colorStr)) return;
        this.recent.unshift(colorStr);
        if (this.recent.length > 8) this.recent.pop();
        this.renderSwatches('recent-swatches', this.recent);
    }

    addCustomSwatch(colorStr) {
        this.custom.push(colorStr);
        this.renderSwatches('custom-swatches', this.custom);
    }

    renderSwatches(elementId, list) {
        const container = document.getElementById(elementId);
        container.innerHTML = '';
        list.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'swatch';
            swatch.style.backgroundColor = color;
            swatch.addEventListener('click', () => {
                const match = color.match(/\d+(\.\d+)?/g);
                if (match) {
                    this.r = parseInt(match[0]);
                    this.g = parseInt(match[1]);
                    this.b = parseInt(match[2]);
                    this.a = match[3] ? parseFloat(match[3]) : 1;
                    document.getElementById('color-alpha').value = this.a;
                    this.updateFromRGBInputs();
                }
            });
            container.appendChild(swatch);
        });
    }
}

class LayerManager {
    constructor(app) {
        this.app = app;
        this.layers = [];
        this.activeLayer = null;
        this.idCounter = 0;
    }

    init() {
        this.addLayer("Background Layer");
    }

    addLayer(name = null) {
        this.idCounter++;
        const id = 'layer-' + this.idCounter;
        name = name || `Layer ${this.idCounter}`;

        const canvas = document.createElement('canvas');
        canvas.width = this.app.canvasWidth;
        canvas.height = this.app.canvasHeight;
        canvas.id = id;
        
        // Background rule default injection
        const ctx = canvas.getContext('2d');
        if (this.layers.length === 0) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0,0,canvas.width,canvas.height);
        }

        document.getElementById('canvas-container').appendChild(canvas);

        const layerObj = {
            id: id,
            name: name,
            canvas: canvas,
            ctx: ctx,
            visible: true,
            opacity: 1,
            blendMode: 'normal'
        };

        this.layers.unshift(layerObj); // New layer on top
        this.setActiveLayer(layerObj);
        this.refreshLayerOrderDOM();
        this.renderLayersUI();
    }

    setActiveLayer(layer) {
        this.activeLayer = layer;
        this.refreshLayerOrderDOM();
    }

    deleteLayer(id) {
        if(this.layers.length <= 1) return;
        const index = this.layers.findIndex(l => l.id === id);
        if (index !== -1) {
            this.layers[index].canvas.remove();
            this.layers.splice(index, 1);
            if (this.activeLayer.id === id) this.activeLayer = this.layers[0];
            this.refreshLayerOrderDOM();
            this.renderLayersUI();
            this.app.historyManager.pushState();
        }
    }

    duplicateLayer(id) {
        const source = this.layers.find(l => l.id === id);
        if (!source) return;
        this.addLayer(`${source.name} Copy`);
        this.activeLayer.ctx.drawImage(source.canvas, 0, 0);
        this.updateThumbnail(this.activeLayer);
        this.app.historyManager.pushState();
    }

    refreshLayerOrderDOM() {
        // Re-inject layer elements via CSS mapping layers execution stack
        for(let i = 0; i < this.layers.length; i++) {
            // Lower arrays item indices correspond visually to standard layout rendering
            this.layers[i].canvas.style.zIndex = this.layers.length - i;
            this.layers[i].canvas.style.opacity = this.layers[i].opacity;
            this.layers[i].canvas.style.mixBlendMode = this.layers[i].blendMode;
            this.layers[i].canvas.style.display = this.layers[i].visible ? 'block' : 'none';
        }
    }

    updateThumbnail(layer) {
        const thumbImg = document.getElementById(`thumb-${layer.id}`);
        if(thumbImg) {
            thumbImg.src = layer.canvas.toDataURL('image/png', 0.1);
        }
    }

    renderLayersUI() {
        const container = document.getElementById('layers-list-container');
        container.innerHTML = '';

        this.layers.forEach(layer => {
            const item = document.createElement('div');
            item.className = `layer-item ${this.activeLayer.id === layer.id ? 'active' : ''}`;
            item.addEventListener('click', () => {
                this.setActiveLayer(layer);
                this.renderLayersUI();
            });

            item.innerHTML = `
                <div class="layer-row-top">
                    <button class="layer-visibility-btn ${layer.visible ? 'visible' : ''}" id="vis-${layer.id}">
                        <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                    </button>
                    <img id="thumb-${layer.id}" class="layer-thumb" src="${layer.canvas.toDataURL('image/png',0.05)}">
                    <input type="text" class="layer-name-input" value="${layer.name}">
                    <div class="layer-meta-actions">
                        <button class="layer-dup-btn">Dup</button>
                        <button class="layer-del-btn">Del</button>
                    </div>
                </div>
                <div class="layer-controls-row">
                    <select class="layer-blend-select">
                        <option value="normal" ${layer.blendMode==='normal'?'selected':''}>Normal</option>
                        <option value="multiply" ${layer.blendMode==='multiply'?'selected':''}>Multiply</option>
                        <option value="screen" ${layer.blendMode==='screen'?'selected':''}>Screen</option>
                        <option value="overlay" ${layer.blendMode==='overlay'?'selected':''}>Overlay</option>
                        <option value="lighten" ${layer.blendMode==='lighten'?'selected':''}>Lighten</option>
                        <option value="darken" ${layer.blendMode==='darken'?'selected':''}>Darken</option>
                    </select>
                    <input type="range" class="layer-opac-range" min="0" max="1" step="0.05" value="${layer.opacity}">
                </div>
            `;

            // Layer item events attachments
            item.querySelector('.layer-name-input').addEventListener('change', (e) => { layer.name = e.target.value; });
            item.querySelector('.layer-blend-select').addEventListener('change', (e) => { 
                layer.blendMode = e.target.value; 
                this.refreshLayerOrderDOM();
            });
            item.querySelector('.layer-opac-range').addEventListener('input', (e) => {
                layer.opacity = parseFloat(e.target.value);
                this.refreshLayerOrderDOM();
            });
            item.querySelector(`#vis-${layer.id}`).addEventListener('click', (e) => {
                e.stopPropagation();
                layer.visible = !layer.visible;
                this.refreshLayerOrderDOM();
                this.renderLayersUI();
            });
            item.querySelector('.layer-dup-btn').addEventListener('click', (e) => { e.stopPropagation(); this.duplicateLayer(layer.id); });
            item.querySelector('.layer-del-btn').addEventListener('click', (e) => { e.stopPropagation(); this.deleteLayer(layer.id); });

            container.appendChild(item);
        });
    }
}

class BrushEngine {
    constructor(app) {
        this.app = app;
        this.categories = ["Favorites", "Simple", "Sketch", "Airbrush", "Paint", "Special"];
        this.presets = {
            "Simple": ["Round Standard", "Hard Detailer", "Taper Ink"],
            "Sketch": ["HB Pencil", "Charcoal Textured"],
            "Airbrush": ["Soft Glow", "Dense Spray"],
            "Paint": ["Oil Flat", "Watercolor Blend"],
            "Special": ["Particle Sparkle", "Splat Stamp"]
        };
        this.currentSettings = {};
    }

    init() {
        this.loadCategoriesDOM();
        this.bindInputs();
    }

    loadCategoriesDOM() {
        const catSelect = document.getElementById('brush-category-select');
        const preSelect = document.getElementById('brush-preset-select');
        
        catSelect.innerHTML = '';
        Object.keys(this.presets).forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat; opt.innerText = cat;
            catSelect.appendChild(opt);
        });

        catSelect.addEventListener('change', () => {
            preSelect.innerHTML = '';
            this.presets[catSelect.value].forEach(pre => {
                const opt = document.createElement('option');
                opt.value = pre; opt.innerText = pre;
                preSelect.appendChild(opt);
            });
        });
        catSelect.dispatchEvent(new Event('change'));
    }

    bindInputs() {
        const ids = [
            'br-size', 'br-opacity', 'br-spacing', 'br-hardness', 'br-start-thick',
            'br-end-thick', 'br-start-opac', 'br-end-opac', 'br-fade', 'br-tex-scale',
            'br-tex-rot', 'br-tex-opac', 'br-angle-dyn', 'br-sp-size', 'br-sp-opac',
            'br-sp-blur', 'br-stabilize', 'br-pr-size', 'br-pr-opac', 'br-pr-flow',
            'br-pr-scat', 'br-pr-tex'
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            this.currentSettings[id] = el.type === 'checkbox' ? el.checked : parseFloat(el.value);
            el.addEventListener('input', () => {
                this.currentSettings[id] = el.type === 'checkbox' ? el.checked : parseFloat(el.value);
            });
        });
    }

    drawStroke(ctx, p1, p2, isFirst, isLast, speed = 1) {
        const settings = this.currentSettings;
        ctx.save();
        
        // Speed/Dynamics calculation mappings
        let calculatedSize = settings['br-size'] * (1 + (speed * settings['br-sp-size']));
        calculatedSize = Math.max(1, calculatedSize);
        let calculatedOpacity = settings['br-opacity'] * (1 + (speed * settings['br-sp-opac']));
        calculatedOpacity = Math.max(0, Math.min(1, calculatedOpacity));

        ctx.strokeStyle = this.app.colorManager.getRGBAString();
        ctx.fillStyle = this.app.colorManager.getRGBAString();
        ctx.lineWidth = calculatedSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (settings['br-sp-blur'] > 0) {
            ctx.filter = `blur(${Math.min(20, speed * settings['br-sp-blur'])}px)`;
        }

        if (this.app.toolManager.currentTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
        } else {
            ctx.globalCompositeOperation = 'source-over';
        }

        // Connect path system
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        ctx.restore();
    }
}

class ToolManager {
    constructor(app) {
        this.app = app;
        this.currentTool = 'brush';
        this.isDrawing = false;
        this.lastPoint = null;
        this.points = [];
    }

    init() {
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                const targetBtn = e.currentTarget;
                targetBtn.classList.add('active');
                this.currentTool = targetBtn.dataset.tool;
            });
        });

        const v = this.app.canvasManager.viewport;
        v.addEventListener('mousedown', (e) => this.onMouseDown(e));
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    }

    onMouseDown(e) {
        if(this.app.canvasManager.isPanningSpace || e.button === 1 || this.currentTool === 'pan') return;
        this.isDrawing = true;
        const pt = this.app.canvasManager.getCanvasCoordinates(e);
        this.lastPoint = pt;
        this.points = [pt];

        this.app.colorManager.pushRecent(this.app.colorManager.getRGBAString());
    }

    onMouseMove(e) {
        if (!this.isDrawing) return;
        const pt = this.app.canvasManager.getCanvasCoordinates(e);
        const layer = this.app.layerManager.activeLayer;
        
        if (!layer || !this.lastPoint) return;

        // Simple distance speed extraction algorithm
        const dist = Math.hypot(pt.x - this.lastPoint.x, pt.y - this.lastPoint.y);
        const speed = Math.min(10, dist / 2);

        if(this.currentTool === 'brush' || this.currentTool === 'eraser') {
            this.app.brushEngine.drawStroke(layer.ctx, this.lastPoint, pt, false, false, speed);
        } else if (this.currentTool === 'smudge' || this.currentTool === 'blur') {
            this.applyFXStroke(layer.ctx, this.lastPoint, pt, this.currentTool);
        }

        this.lastPoint = pt;
    }

    onMouseUp() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.app.layerManager.updateThumbnail(this.app.layerManager.activeLayer);
            this.app.historyManager.pushState();
        }
    }

    applyFXStroke(ctx, p1, p2, mode) {
        // Pixel-based contextual modifiers fallback engine
        ctx.save();
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, this.app.brushEngine.currentSettings['br-size']/2, 0, Math.PI*2);
        ctx.clip();
        if(mode === 'blur') {
            ctx.filter = 'blur(4px)';
            ctx.drawImage(ctx.canvas, 0, 0);
        } else if (mode === 'smudge') {
            ctx.drawImage(ctx.canvas, p1.x - p2.x, p1.y - p2.y);
        }
        ctx.restore();
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
        if(!this.app.layerManager.layers.length) return;
        // Map entire serialization state configuration
        const state = this.app.layerManager.layers.map(l => {
            const canvasCopy = document.createElement('canvas');
            canvasCopy.width = l.canvas.width;
            canvasCopy.height = l.canvas.height;
            canvasCopy.getContext('2d').drawImage(l.canvas, 0, 0);
            return {
                id: l.id,
                name: l.name,
                visible: l.visible,
                opacity: l.opacity,
                blendMode: l.blendMode,
                data: canvasCopy
            };
        });

        this.undoStack.push(state);
        if(this.undoStack.length > this.maxStates) this.undoStack.shift();
        this.redoStack = []; // Reset Redo track line
    }

    undo() {
        if (this.undoStack.length <= 1) return; // Keep standard base layer
        const current = this.undoStack.pop();
        this.redoStack.push(current);
        this.restoreState(this.undoStack[this.undoStack.length - 1]);
    }

    redo() {
        if (!this.redoStack.length) return;
        const next = this.redoStack.pop();
        this.undoStack.push(next);
        this.restoreState(next);
    }

    restoreState(state) {
        if (!state) return;
        // Purge present running layers structure layout
        this.app.layerManager.layers.forEach(l => l.canvas.remove());
        this.app.layerManager.layers = [];

        state.forEach(savedLayer => {
            const canvas = document.createElement('canvas');
            canvas.width = this.app.canvasWidth;
            canvas.height = this.app.canvasHeight;
            canvas.id = savedLayer.id;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(savedLayer.data, 0, 0);

            document.getElementById('canvas-container').appendChild(canvas);

            this.app.layerManager.layers.push({
                id: savedLayer.id,
                name: savedLayer.name,
                canvas: canvas,
                ctx: ctx,
                visible: savedLayer.visible,
                opacity: savedLayer.opacity,
                blendMode: savedLayer.blendMode
            });
        });

        this.app.layerManager.activeLayer = this.app.layerManager.layers[0];
        this.app.layerManager.refreshLayerOrderDOM();
        this.app.layerManager.renderLayersUI();
    }
}

class FileManager {
    constructor(app) {
        this.app = app;
    }

    exportImage(format, quality) {
        // Output compound final layered rasterization flattened data image
        const flattenCanvas = document.createElement('canvas');
        flattenCanvas.width = this.app.canvasWidth;
        flattenCanvas.height = this.app.canvasHeight;
        const fCtx = flattenCanvas.getContext('2d');

        // Render ordered linear layer layout array backwards for exact overlay mapping
        for(let i = this.app.layerManager.layers.length - 1; i >=0; i--) {
            const layer = this.app.layerManager.layers[i];
            if(!layer.visible) continue;
            fCtx.save();
            fCtx.globalAlpha = layer.opacity;
            fCtx.globalCompositeOperation = layer.blendMode === 'normal' ? 'source-over' : layer.blendMode;
            fCtx.drawImage(layer.canvas, 0, 0);
            fCtx.restore();
        }

        const dataUrl = flattenCanvas.toDataURL(format, quality);
        const link = document.createElement('a');
        link.download = `northstar-art.${format === 'image/jpeg' ? 'jpg' : 'png'}`;
        link.href = dataUrl;
        link.click();
    }
}

class UIManager {
    constructor(app) {
        this.app = app;
    }

    init() {
        // Tab routing panels selector layout handler setup
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                e.target.classList.add('active');
                document.getElementById(`tab-${e.target.dataset.tab}`).classList.add('active');
            });
        });

        // Add Layer action registration binding trigger
        document.getElementById('add-layer-btn').addEventListener('click', () => {
            this.app.layerManager.addLayer();
            this.app.historyManager.pushState();
        });

        // Setup History control hooks mapping
        document.getElementById('btn-undo').addEventListener('click', () => this.app.historyManager.undo());
        document.getElementById('btn-redo').addEventListener('click', () => this.app.historyManager.redo());

        // Navigation view action layout binds setup
        document.getElementById('btn-fit').addEventListener('click', () => this.app.canvasManager.centerViewport());
        document.getElementById('btn-zoom-in').addEventListener('click', () => {
            this.app.canvasManager.zoom *= 1.2;
            this.app.canvasManager.updateTransform();
        });
        document.getElementById('btn-zoom-out').addEventListener('click', () => {
            this.app.canvasManager.zoom /= 1.2;
            this.app.canvasManager.updateTransform();
        });

        // Modal Action management
        const expModal = document.getElementById('export-modal');
        document.getElementById('btn-export').addEventListener('click', () => expModal.classList.add('active'));
        document.getElementById('btn-modal-cancel').addEventListener('click', () => expModal.classList.remove('active'));
        
        document.getElementById('export-format').addEventListener('change', (e) => {
            document.getElementById('jpg-quality-box').style.display = e.target.value === 'image/jpeg' ? 'flex' : 'none';
        });

        document.getElementById('btn-modal-confirm').addEventListener('click', () => {
            const format = document.getElementById('export-format').value;
            const quality = parseFloat(document.getElementById('export-quality').value);
            this.app.fileManager.exportImage(format, quality);
            expModal.classList.remove('active');
        });

        document.getElementById('btn-new').addEventListener('click', () => {
            if(confirm("Discard current artwork and return to start screen?")) {
                location.reload();
            }
        });
    }
}

// Initial Core Instantiation
window.addEventListener('DOMContentLoaded', () => {
    window.NorthstarInstance = new NorthstarApp();
});
