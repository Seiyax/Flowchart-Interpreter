/* ==========================================================================
   VISUAL PSEUDOPLAY — COMBINED SCRIPT
   (FEAT: Auto-Sizing Shapes, Fixed Text Wrap, Modal Labels, Ctrl+Zoom)
   (MODS: Connector Edit, Copy/Paste, Ctrl+Z/Y/C/V, Offset Ports, Auto-Width, Max-Width, Char-Wrap, Single Port Out, Modal Lag Fix, Interpreter Fix)
   (PLUS: Hybrid Connectors, Modal Crash Fix, Routing Fix, Flow Animation, Simple Ports, Auto-revert Tool, Mobile Touch Fixes, Long-Press-to-Drag)
   (*** UPDATED: Full Logical/Relational Operator Support ***)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const $ = (s, r = document) => r.querySelector(s);
  const $all = (s, r = document) => [...r.querySelectorAll(s)];

  const canvas = $('#canvas');
  const canvasGroup = $('#canvas-group');
  const tempLayer = $('#temp-layer');
  const handlesLayer = $('#handles-layer');
  const guidesLayer = $('#guides-layer');
  const canvasContainer = $('#canvas-container');
  const terminal = $('#terminal');
  const terminalPanel = $('#terminalPanel');
  const modal = $('#shapeEditorModal');
  const modalInput = $('#shapeTextInput');
  const zoomDisplay = $('#zoomResetBtn');

  // Buttons
  const runBtn = $('#runBtn');
  const stopBtn = $('#stopBtn');
  const resetBtn = $('#resetBtn');
  const clearTerminalBtn = $('#clearTerminal');
  const themeToggle = $('#themeToggle');
  const sunIcon = $('#sunIcon');
  const moonIcon = $('#moonIcon');
  const lightModeBanner = $('#lightModeBanner');
  const darkModeBanner = $('#darkModeBanner');

  // --- Config ---
  const STORAGE_KEY_FLOWCHART = 'visual_pseudoplay_v5';
  const GRID = 20;
  const HISTORY_LIMIT = 100;
  const SNAP_THRESHOLD = 6;
  const MIN_SHAPE_SIZE = 60; // Minimum width/height for a shape
  const MAX_SHAPE_WIDTH = 400; // Maximum width a shape can auto-grow to

  // --- Interpreter State ---
  let variables = {};
  let isRunning = false;
  let currentShapeId = null;
  let controlStack = [];
  let maxIterations = 1000000;
  let iterationCount = 0;

  // --- Helper Functions ---
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const snapToGrid = v => Math.round(v / 20) * 20;
  const ceilToGrid = (v) => Math.ceil(v / GRID) * GRID; // Helper to round *up* to next grid
  
  function showToast(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  /* ==========================================================================
     1. Flowchart Class (The Visual Editor)
     ========================================================================== */
  
  class History {
    constructor() { this.stack = []; this.index = -1; }
    push(state) {
      if (this.index >= 0 && JSON.stringify(state) === JSON.stringify(this.stack[this.index])) return;
      this.stack = this.stack.slice(0, this.index + 1);
      this.stack.push(JSON.parse(JSON.stringify(state)));
      if (this.stack.length > HISTORY_LIMIT) this.stack.shift();
      this.index = this.stack.length - 1;
    }
    undo() { if (this.index > 0) this.index--; return this.current(); }
    redo() { if (this.index < this.stack.length - 1) this.index++; return this.current(); }
    current() { return this.index >= 0 ? this.stack[this.index] : null; }
  }

  class Flowchart {
    constructor() {
      this.shapes = [];
      this.connectors = [];
      this.selected = new Set();
      this.activeShape = null;
      this.view = { x: 0, y: 0, zoom: 1 };
      this.history = new History();
      this.load();
      this.activeConnector = null; // For flow animation
    }

    load() {
      const saved = localStorage.getItem(STORAGE_KEY_FLOWCHART);
      const state = saved ? JSON.parse(saved) : this.getDefaultFlowchart();
      this.loadState(state);
      this.history.stack = [];
      this.history.index = -1;
      this.history.push(this.export());
      this.render();
    }
    
    loadState(state) {
      this.shapes = state.shapes.map(s => ({ ...s }));
      this.connectors = state.connectors.map(c => ({ ...c }));
    }

    export() { return { shapes: this.shapes.map(s => ({ ...s })), connectors: this.connectors.map(c => ({ ...c })) }; }
    save() {
      const state = this.export();
      this.history.push(state);
      localStorage.setItem(STORAGE_KEY_FLOWCHART, JSON.stringify(state));
    }

    getDefaultFlowchart() {
      return {
        shapes: [
          { id: 's0', type: 'ellipse', x: 280, y: 40, w: 140, h: 60, text: 'START' },
          { id: 's1', type: 'hexagon', x: 270, y: 140, w: 160, h: 80, text: 'INIT count = 0' },
          { id: 's2', type: 'parallelogram', x: 270, y: 260, w: 160, h: 80, text: 'PRINT "hi pede ba magpalambing? sige na pls"' },
          { id: 's3', type: 'rect', x: 270, y: 380, w: 160, h: 60, text: 'SET count = count + 1' },
          { id: 's4', type: 'diamond', x: 480, y: 370, w: 160, h: 80, text: 'count < 5' },
          { id: 's5', type: 'ellipse', x: 280, y: 500, w: 140, h: 60, text: 'STOP' }
        ],
        connectors: [
          { id: 'c0', from: { id: 's0', port: 'bottom' }, to: { id: 's1', port: 'top' }, label: '' },
          { id: 'c1', from: { id: 's1', port: 'bottom' }, to: { id: 's2', port: 'top' }, label: '' },
          { id: 'c2', from: { id: 's2', port: 'bottom' }, to: { id: 's3', port: 'top' }, label: '' },
          { id: 'c3', from: { id: 's3', port: 'right' }, to: { id: 's4', port: 'left' }, label: '' },
          { id: 'c4', from: { id: 's4', port: 'top' }, to: { id: 's2', port: 'right' }, label: 'TRUE' },
          { id: 'c5', from: { id: 's4', port: 'bottom' }, to: { id: 's5', port: 'right' }, label: 'FALSE' }
        ]
      };
    }

    resetToDefault() {
      const defaultState = this.getDefaultFlowchart();
      this.loadState(defaultState);
      this.save();
      this.render();
      ui.renderHandles();
      showToast('Flowchart reset to default');
    }
    
    addShape(type, x, y) {
      const templates = {
        ellipse: { w: 140, h: 60, text: 'START' },
        hexagon: { w: 160, h: 80, text: 'DECLARE name' },
        parallelogram: { w: 160, h: 60, text: 'INPUT name' },
        rect: { w: 160, h: 60, text: 'SET a = 1' },
        diamond: { w: 160, h: 100, text: 'a > 0' }
      };
      const t = templates[type];
      const shape = {
        id: 's' + Date.now(),
        type, x: snapToGrid(x - t.w/2), y: snapToGrid(y - t.h/2),
        w: t.w, h: t.h, text: t.text
      };
      this.shapes.push(shape);
      this.select(shape.id);
      this.save();
      return shape;
    }

    addConnector(from, to, label = '') {
      const conn = { id: 'c' + Date.now(), from, to, label };
      this.connectors.push(conn);
      this.save();
      return conn;
    }

    deleteSelected() {
      const ids = [...this.selected];
      if (ids.length === 0) return;
      this.shapes = this.shapes.filter(s => !ids.includes(s.id));
      this.connectors = this.connectors.filter(c => !ids.includes(c.from.id) && !ids.includes(c.to.id) && !ids.includes(c.id));
      this.selected.clear();
      this.save();
      this.render();
      ui.renderHandles();
    }

    select(id, multi = false) {
      if (!multi) this.selected.clear();
      if (this.selected.has(id)) this.selected.delete(id);
      else this.selected.add(id);
      this.render();
      ui.renderHandles();
    }
    
    getShape(id) { return this.shapes.find(s => s.id === id); }
    getConnectorsFrom(shapeId) { return this.connectors.filter(c => c.from.id === shapeId); }

    getAnchor(shape, port) {
      const { x, y, w, h } = shape;
      switch (port) {
        case 'top': return { x: x + w / 2, y };
        case 'bottom': return { x: x + w / 2, y: y + h };
        case 'left': return { x, y: y + h / 2 };
        case 'right': return { x: x + w, y: y + h / 2 };
        default: return { x: x + w / 2, y: y + h / 2 };
      }
    }
    
    getAnchors(shape) {
        return {
            top: this.getAnchor(shape, 'top'),
            bottom: this.getAnchor(shape, 'bottom'),
            left: this.getAnchor(shape, 'left'),
            right: this.getAnchor(shape, 'right'),
        }
    }

    getPath(shape) {
      const { w, h } = shape;
      const p = (v) => (v * w).toFixed(1);
      const q = (v) => (v * h).toFixed(1);
      switch (shape.type) {
        case 'ellipse': return `M${p(0.5)},0 A${p(0.5)},${q(0.5)} 0 1,1 ${p(0.5)},${h} A${p(0.5)},${q(0.5)} 0 1,1 ${p(0.5)},0 Z`;
        case 'diamond': return `M${p(0.5)},0 L${w},${q(0.5)} L${p(0.5)},${h} L0,${q(0.5)} Z`;
        case 'parallelogram': return `M${p(0.2)},0 H${w} L${w-p(0.2)},${h} H0 Z`;
        case 'hexagon': return `M${p(0.25)},0 L${p(0.75)},0 L${w},${q(0.5)} L${p(0.75)},${h} L${p(0.25)},${h} L0,${q(0.5)} Z`;
        default: return `M0,0 H${w} V${h} H0 Z`;
      }
    }

    render() {
      canvasGroup.innerHTML = '';
      this.shapes.forEach(shape => this.renderShape(shape));
      this.connectors.forEach(conn => this.renderConnector(conn));
      canvasGroup.setAttribute('transform', `translate(${this.view.x},${this.view.y}) scale(${this.view.zoom})`);
      zoomDisplay.textContent = `${Math.round(this.view.zoom * 100)}%`;
    }
    

    renderConnector(conn) {
      const fromShape = this.getShape(conn.from.id);
      const toShape = this.getShape(conn.to.id);
      if (!fromShape || !toShape) return;
      
      const p1 = this.getAnchor(fromShape, conn.from.port);
      const p2 = this.getAnchor(toShape, conn.to.port);
      
      // --- START: REVISED ROUTING LOGIC ---
      let d = `M ${p1.x},${p1.y} `;
      let labelX, labelY;
      const offset = 20;

      const fromVertical = (conn.from.port === 'top' || conn.from.port === 'bottom');
      const toVertical = (conn.to.port === 'top' || conn.to.port === 'bottom');

      if (fromVertical && toVertical) {
          // "S" Bend (Vertical-to-Vertical)
          let p1_mid = (conn.from.port === 'bottom')
              ? { x: p1.x, y: Math.max(p1.y + offset, (p1.y + p2.y) / 2) }
              : { x: p1.x, y: Math.min(p1.y - offset, (p1.y + p2.y) / 2) };
          let p2_mid = { x: p2.x, y: p1_mid.y };
          d += `L ${p1.x},${p1_mid.y} L ${p2.x},${p2_mid.y} L ${p2.x},${p2.y}`;
          labelX = (p1.x + p2.x) / 2; labelY = p1_mid.y - 8;
      
      } else if (!fromVertical && !toVertical) {
          // "S" Bend (Horizontal-to-Horizontal)
          let p1_mid = (conn.from.port === 'right')
              ? { x: Math.max(p1.x + offset, (p1.x + p2.x) / 2), y: p1.y }
              : { x: Math.min(p1.x - offset, (p1.x + p2.x) / 2), y: p1.y };
          let p2_mid = { x: p1_mid.x, y: p2.y };
          d += `L ${p1_mid.x},${p1.y} L ${p2_mid.x},${p2.y} L ${p2.x},${p2.y}`;
          labelX = p1_mid.x; labelY = (p1.y + p2.y) / 2 - 8;
      
      } else if (fromVertical && !toVertical) {
          // "L" Bend (Vertical-to-Horizontal)
          d += `L ${p1.x},${p2.y} L ${p2.x},${p2.y}`;
          labelX = (p1.x + p2.x) / 2; labelY = p2.y - 8;

      } else { // !fromVertical && toVertical
          // "L" Bend (Horizontal-to-Vertical) - THIS IS YOUR CASE
          d += `L ${p2.x},${p1.y} L ${p2.x},${p2.y}`;
          labelX = p2.x; labelY = (p1.y + p2.y) / 2 - 8;
      }
      // --- END: REVISED ROUTING LOGIC ---
      
      if (conn.from.id === conn.to.id) {
          if (conn.from.port === 'right') { labelX = p1.x + offset + 15; labelY = p1.y; }
          else if (conn.from.port === 'left') { labelX = p1.x - offset - 15; labelY = p1.y; }
          else if (conn.from.port === 'bottom') { labelX = p1.x; labelY = p1.y + offset + 15; }
          else { labelX = p1.x; labelY = p1.y - offset - 15; }
      }

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.classList.add('connector-group');
      g.dataset.connId = conn.id; // <-- ADD THIS FOR TOUCH SELECTION
      if (this.selected.has(conn.id)) g.classList.add('selected');
      
      const hitBoxPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hitBoxPath.setAttribute('d', d);
      hitBoxPath.setAttribute('stroke', 'transparent');
      hitBoxPath.setAttribute('stroke-width', '20');
      hitBoxPath.setAttribute('fill', 'none');
      g.appendChild(hitBoxPath);
      
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.classList.add('connector-line');
      
      // --- NEW: Add 'flowing' class if this is the active connector ---
      if (this.activeConnector === conn.id) {
        path.classList.add('flowing');
      }
      // --- END NEW ---
      
      g.appendChild(path);

      if (conn.label) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.textContent = conn.label;
        text.setAttribute('x', labelX); 
        text.setAttribute('y', labelY);
        text.setAttribute('text-anchor', 'middle'); 
        text.setAttribute('font-size', '12');
        text.setAttribute('fill', 'var(--text-secondary)'); 
        text.setAttribute('paint-order', 'stroke');
        text.setAttribute('stroke', 'var(--bg-primary)'); 
        text.setAttribute('stroke-width', '3px');
        text.setAttribute('pointer-events', 'none');
        g.appendChild(text);
      }
      
      g.addEventListener('mousedown', e => { e.stopPropagation(); ui.select(conn.id, e.shiftKey); });
      
      g.addEventListener('dblclick', e => {
        e.stopPropagation();
        if (isRunning) return;
        ui.editConnectorLabel(conn);
      });
      
      canvasGroup.appendChild(g);
    }

    renderShape(shape) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.classList.add('flowchart-shape');
      g.dataset.shapeId = shape.id; // <-- ADD THIS FOR TOUCH SELECTION
      if (this.selected.has(shape.id)) g.classList.add('selected');
      if (this.activeShape === shape.id) g.classList.add('active');
      g.setAttribute('transform', `translate(${shape.x},${shape.y})`);
      
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.classList.add('shape-body');
      g.appendChild(path);
      
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.classList.add('shape-text');
      
      canvasGroup.appendChild(g); 
      g.appendChild(text);

      // --- NEW: Text Wrapping & Auto-Sizing Logic ---
      const vOffset = 18; // Line height
      const padding = 20; // 10px padding on each side (total 40)

      // Helper function to measure text
      const measureText = (s) => {
          const tempTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          tempTspan.textContent = s || ' '; // Use space for empty string to get height
          text.appendChild(tempTspan);
          const width = tempTspan.getComputedTextLength();
          text.removeChild(tempTspan);
          return width;
      };
      
      // --- Auto-Width Logic (Part 1) ---
      const userLines = shape.text.split('\n');
      let longestWordWidth = 0;

      userLines.forEach(line => {
          line.split(' ').forEach(word => {
             const textWidth = measureText(word);
             if (textWidth > longestWordWidth) {
                 longestWordWidth = textWidth;
             }
          });
      });

      // Calculate the required width based on this longest word
      let requiredWidth;
      switch(shape.type) {
          case 'diamond':
              requiredWidth = (longestWordWidth + padding) * 2; 
              break;
          case 'hexagon':
              requiredWidth = (longestWordWidth + padding) / 0.75;
              break;
          default:
              requiredWidth = longestWordWidth + (padding * 2);
      }
      
      // Clamp width to our min and max
      requiredWidth = Math.min(requiredWidth, MAX_SHAPE_WIDTH); // Apply Max Width
      requiredWidth = Math.max(requiredWidth, MIN_SHAPE_SIZE);  // Apply Min Width

      if (requiredWidth > shape.w) {
          shape.w = ceilToGrid(requiredWidth); // Mutate shape's width
      }
      // --- End Auto-Width Logic (Part 1) ---


      // --- NOW we can calculate maxWidth for wrapping ---
      let maxWidth;
      switch(shape.type) {
          case 'diamond': maxWidth = shape.w * 0.5 - padding; break;
          case 'hexagon': maxWidth = shape.w * 0.75 - padding; break;
          default: maxWidth = shape.w - padding;
      }

      // --- This is the robust word-wrapping logic ---
      const wrappedLines = []; 
      
      userLines.forEach(line => {
          if (line.trim() === '') {
              wrappedLines.push('');
              return;
          }

          const words = line.split(' ');
          let currentLine = '';

          for (const word of words) {
              const wordWidth = measureText(word);
              const testLine = (currentLine + ' ' + word).trim();
              const testLineWidth = measureText(testLine);

              if (testLineWidth > maxWidth) {
                  // Word doesn't fit on the current line.
                  if (currentLine.length > 0) {
                      wrappedLines.push(currentLine); // Push the line *before* this word
                  }
                  
                  // Now, deal with the new word.
                  // Is the word *itself* too long to ever fit?
                  if (wordWidth > maxWidth) {
                      // --- This is the character-wrapping logic ---
                      let tempWord = '';
                      for (let i = 0; i < word.length; i++) {
                          const char = word[i];
                          const testCharLine = tempWord + char;
                          if (measureText(testCharLine) > maxWidth) {
                              wrappedLines.push(tempWord); // Push the partial word
                              tempWord = char; // Start new line with this char
                          } else {
                              tempWord = testCharLine; // Add char
                          }
                      }
                      currentLine = tempWord; // The leftover part of the word
                      // --- End character-wrapping ---
                  } else {
                      // The word is not too long, it just didn't fit. Start new line.
                      currentLine = word;
                  }
              } else {
                  // Word fits, add it to the current line
                  currentLine = testLine;
              }
          }
          wrappedLines.push(currentLine); // Push the last remaining line
      });
      // --- End new wrapping logic ---


      // --- Auto-Height Logic ---
      const requiredHeight = (wrappedLines.length * vOffset) + (padding * 1.5); 
      const minHeight = MIN_SHAPE_SIZE;
      
      if (requiredHeight > shape.h || shape.h < minHeight) {
          shape.h = ceilToGrid(Math.max(requiredHeight, minHeight)); 
      }
      
      // --- NOW set the path, with the new width AND height ---
      path.setAttribute('d', this.getPath(shape));
      
      // --- Final Text Rendering ---
      text.textContent = ''; // Clear temp content
      const startY = - (wrappedLines.length - 1) * vOffset / 2;
      
      text.setAttribute('x', shape.w / 2); 
      text.setAttribute('y', shape.h / 2); 
      
      wrappedLines.forEach((lineText, i) => {
          const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          tspan.setAttribute('x', shape.w / 2);
          tspan.setAttribute('dy', i === 0 ? `${startY}px` : `${vOffset}px`);
          tspan.textContent = lineText;
          text.appendChild(tspan);
      });
      // --- END: Text Wrapping & Auto-Sizing Logic ---

      g.addEventListener('mousedown', e => { e.stopPropagation(); ui.onShapeMouseDown(e, shape.id); });
      g.addEventListener('dblclick', (e) => { e.stopPropagation(); ui.editShape(e, shape.id); });
    }
    
    getStartShape() {
        return this.shapes.find(s => s.type === 'ellipse' && s.text.toUpperCase() === 'START');
    }
    
    getNextShape(shape, decision) {
        const connectors = this.getConnectorsFrom(shape.id);
        if (shape.type === 'diamond') {
            const label = decision ? 'Yes' : 'No';
            let conn = connectors.find(c => c.label.toUpperCase() === label.toUpperCase());
            if (!conn) conn = connectors.find(c => c.label.toUpperCase() === String(decision).toUpperCase());
            if (!conn) conn = connectors.find(c => c.label.toUpperCase() === (decision ? 'TRUE' : 'FALSE'));
            if (!conn && !decision) conn = connectors.find(c => !c.label || c.label.toUpperCase() === 'FALSE' || c.label.toUpperCase() === 'LABEL');
            
            return conn ? this.getShape(conn.to.id) : null;
        }
        // --- UPDATED: Allow only one connector out from non-diamond shapes ---
        if (connectors.length > 1) {
            throw new Error(`Execution error: Shape "${shape.text}" (type: ${shape.type}) has multiple output connectors. Only 'diamond' shapes can have more than one output.`);
        }
        return connectors[0] ? this.getShape(connectors[0].to.id) : null;
    }
  }

  /* ==========================================================================
     2. Flowchart UI (The Controller)
     ========================================================================== */

  const ui = {
    tool: 'select',
    internalClipboard: null, 
    dragging: false, dragShapeId: null, dragOffset: null,
    panning: false, panStart: null,
    connectorStart: null, shapeType: null,
    isPortDragging: false,
    isPinching: false,
    lastPinchDist: null,
    longPressTimer: null,
    touchStartTarget: null,
    resizing: false,
    resizeHandle: null,
    resizeStart: null,
    resizeStartShape: null,
    flow: null,
    lastTouch: null, // For drag loop
    dragRaf: null,   // For drag loop

    init() {
      this.flow = new Flowchart();
      this.bindCanvasEvents();
      this.bindToolbarEvents();
      this.bindModalEvents();
      this.bindGlobalEvents();
      this.updateToolbar();
    },

    bindCanvasEvents() {
      const onWheel = (e) => {
        e.preventDefault();
        
        if (e.ctrlKey) {
            const rect = canvasContainer.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const svgX = (mouseX - this.flow.view.x) / this.flow.view.zoom;
            const svgY = (mouseY - this.flow.view.y) / this.flow.view.zoom;
            
            const scaleFactor = Math.pow(1.001, -e.deltaY);
            const newZoom = clamp(this.flow.view.zoom * scaleFactor, 0.2, 3);
            
            this.flow.view.x = mouseX - svgX * newZoom;
            this.flow.view.y = mouseY - svgY * newZoom;
            this.flow.view.zoom = newZoom;

        } else {
            this.flow.view.x -= e.deltaX;
            this.flow.view.y -= e.deltaY;
        }
        
        this.flow.render();
        this.renderHandles();
      };
      
      canvasContainer.addEventListener('wheel', onWheel.bind(this), { passive: false });
      canvasContainer.addEventListener('mousedown', this.onMouseDown.bind(this));
      window.addEventListener('mousemove', this.onMouseMove.bind(this));
      window.addEventListener('mouseup', this.onMouseUp.bind(this));

      // --- NEW: Touch Event Listeners ---
      canvasContainer.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
      window.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
      window.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });
      // --- END NEW ---
    },
    
    bindToolbarEvents() {
      // --- NEW: Centralized tool setter with cleanup ---
      const setTool = (newTool) => {
        // If switching *away* from connector mode, cancel any pending line
        if (this.tool === 'connector' && newTool !== 'connector' && this.connectorStart) {
          this.connectorStart = null;
          tempLayer.innerHTML = '';
        }
        
        this.tool = newTool;
        this.updateToolbar();
        this.renderHandles(); // Re-render handles on tool change
      };
      
      $all('[data-tool]').forEach(btn => btn.addEventListener('click', () => {
        setTool(btn.dataset.tool);
      }));
      
      $all('[data-shape]').forEach(btn => btn.addEventListener('click', () => {
        this.shapeType = btn.dataset.shape; 
        setTool('shape');
      }));
      // --- END NEW ---
      
      $('#undoBtn').addEventListener('click', () => { 
        const state = this.flow.history.undo(); 
        if(state) {
          this.flow.loadState(state);
          this.flow.render();
          this.renderHandles();
          localStorage.setItem(STORAGE_KEY_FLOWCHART, JSON.stringify(state));
        }
      });
      $('#redoBtn').addEventListener('click', () => {
        const state = this.flow.history.redo();
        if(state) {
          this.flow.loadState(state);
          this.flow.render();
          this.renderHandles();
          localStorage.setItem(STORAGE_KEY_FLOWCHART, JSON.stringify(state));
        }
      });
      
      $('#deleteBtn').addEventListener('click', () => this.flow.deleteSelected());
      $('#zoomInBtn').addEventListener('click', () => this.zoom(1.2));
      $('#zoomOutBtn').addEventListener('click', () => this.zoom(0.8));
      $('#zoomResetBtn').addEventListener('click', () => { this.flow.view.zoom = 1; this.flow.view.x = 0; this.flow.view.y = 0; this.flow.render(); this.renderHandles(); });
      $('#fitScreenBtn').addEventListener('click', () => this.fitToScreen());
      
      $('.quick-btn')?.addEventListener('click', (e) => {
          this.tool = 'shape'; this.shapeType = e.currentTarget.dataset.shape; 
          showToast('Click on canvas to add Process shape');
          this.updateToolbar();
      });
    },
    
    // --- MODIFICATION: Updated save/cancel logic for performance ---
    bindModalEvents() {
        // --- NEW FIX: Prevent modal clicks from bubbling to canvas ---
        modal.addEventListener('mousedown', e => e.stopPropagation());
        modal.addEventListener('mouseup', e => e.stopPropagation());
        // --- END FIX ---

        let currentEditId = null;
        let currentEditType = 'shape';
        let onSaveCallback = null;

        const save = () => {
            // --- FIX: Hide modal *first* to prevent render lag ---
            modal.classList.add('hidden');
            const newText = modalInput.value; // Get value *before* clearing
            const oldEditType = currentEditType;
            const oldEditId = currentEditId;
            const oldCallback = onSaveCallback;
            
            currentEditId = null;
            onSaveCallback = null;
            // --- END FIX ---

            if (oldEditType === 'shape') {
                const shape = this.flow.getShape(oldEditId);
                if (shape) {
                    shape.text = newText;
                    this.flow.save();
                    this.flow.render();
                }
            } else if (oldEditType === 'connector') {
                if (oldCallback) {
                    oldCallback(newText.trim()); // Resolve the promise
                }
            }
        };
        
        const cancel = () => {
            // --- FIX: Hide modal *first* ---
            modal.classList.add('hidden');
            const oldCallback = onSaveCallback;
            // --- END FIX ---
            
            currentEditId = null;
            if (oldCallback) {
                oldCallback(null);
            }
            onSaveCallback = null;
        };

        $('#saveEditBtn').addEventListener('click', save);
        $('#cancelEditBtn').addEventListener('click', cancel);
        modalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { 
                e.preventDefault(); 
                save(); 
            }
            if (e.key === 'Escape') cancel();
        });

        this.editShape = (e, id) => {
            if (isRunning) return;
            const shape = this.flow.getShape(id);
            if (!shape) return;
            currentEditId = id;
            currentEditType = 'shape';
            onSaveCallback = null;
            $('#modalTitle').textContent = `Edit ${shape.type} Shape`;
            modalInput.value = shape.text;
            modalInput.setAttribute('placeholder', 'Enter pseudocode...');
            modal.classList.remove('hidden');
            modalInput.focus();
        };
        
        this.promptConnectorLabel = (currentLabel = 'Yes') => {
            return new Promise((resolve) => {
                currentEditId = null;
                currentEditType = 'connector';
                onSaveCallback = resolve;
                $('#modalTitle').textContent = `Edit Connector Label`;
                modalInput.value = currentLabel;
                modalInput.setAttribute('placeholder', 'Enter label (e.g., Yes, No)');
                modal.classList.remove('hidden');
                modalInput.focus();
                modalInput.select();
            });
        };
    },
    // --- END MODIFICATION ---

    editConnectorLabel: async function(conn) {
        const currentLabel = conn.label || '';
        const newLabel = await this.promptConnectorLabel(currentLabel); 
        
        if (newLabel !== null) { 
            conn.label = newLabel;
            this.flow.save();
            this.flow.render();
        }
    },
    
    copySelected() {
      if (this.flow.selected.size === 0) {
        this.internalClipboard = null;
        return;
      }
      
      const selectedIds = new Set(this.flow.selected);
      const shapesToCopy = this.flow.shapes.filter(s => selectedIds.has(s.id));
      
      const connectorsToCopy = this.flow.connectors.filter(c => 
        selectedIds.has(c.from.id) && selectedIds.has(c.to.id)
      );
      
      if (shapesToCopy.length === 0) {
        this.internalClipboard = null;
        return;
      }

      this.internalClipboard = {
        shapes: JSON.parse(JSON.stringify(shapesToCopy)),
        connectors: JSON.parse(JSON.stringify(connectorsToCopy))
      };
      
      showToast(`${shapesToCopy.length} shape(s) copied`);
    },

    paste() {
      if (!this.internalClipboard || this.internalClipboard.shapes.length === 0) return;

      const { shapes, connectors } = this.internalClipboard;
      
      const newIdMap = new Map(); 
      const offset = GRID * 2; 

      this.flow.selected.clear(); 
      
      shapes.forEach(shape => {
        const newShape = JSON.parse(JSON.stringify(shape)); 
        const oldId = newShape.id;
        const newId = 's' + Date.now() + Math.random().toString(16).slice(2, 8);
        
        newIdMap.set(oldId, newId);
        
        newShape.id = newId;
        newShape.x = snapToGrid(newShape.x + offset);
        newShape.y = snapToGrid(newShape.y + offset);
        
        this.flow.shapes.push(newShape);
        this.flow.selected.add(newId); 
      });
      
      connectors.forEach(conn => {
        const newConn = JSON.parse(JSON.stringify(conn)); 
        
        newConn.id = 'c' + Date.now() + Math.random().toString(16).slice(2, 8);
        newConn.from.id = newIdMap.get(newConn.from.id);
        newConn.to.id = newIdMap.get(newConn.to.id);
        
        if (newConn.from.id && newConn.to.id) {
          this.flow.connectors.push(newConn);
        }
      });
      
      this.flow.save();
      this.flow.render();
      this.renderHandles(); 
    },

    bindGlobalEvents() {
      runBtn.addEventListener('click', () => interpreter.startRun());
      stopBtn.addEventListener('click', () => interpreter.stopRun());
      resetBtn.addEventListener('click', () => this.flow.resetToDefault());
      clearTerminalBtn.addEventListener('click', () => interpreter.clearTerminal());
      themeToggle.addEventListener('click', () => this.toggleTheme());
      
      document.addEventListener('keydown', e => {
        if (modal.classList.contains('hidden') && document.activeElement.tagName !== 'INPUT') {
          // Non-Ctrl shortcuts
          if (!e.ctrlKey) {
            switch(e.key.toLowerCase()) {
              case 'delete':
              case 'backspace':
                this.flow.deleteSelected();
                break;
              case 'v':
                this.tool = 'select';
                this.updateToolbar();
                break;
              case 'c':
                this.tool = 'connector';
                this.updateToolbar();
                break;
            }
          }
          
          // Ctrl shortcuts
          if (e.ctrlKey) {
            switch(e.key.toLowerCase()) {
              case 'enter':
                e.preventDefault();
                runBtn.click();
                break;
              case 'c':
                e.preventDefault();
                this.copySelected();
                break;
              case 'v':
                e.preventDefault();
                this.paste();
                break;
              case 'z':
                e.preventDefault();
                $('#undoBtn').click(); 
                break;
              case 'y':
                e.preventDefault();
                $('#redoBtn').click(); 
                break;
            }
          }
        }
      });
      
      const savedTheme = localStorage.getItem('theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.setTheme(savedTheme ? savedTheme === 'dark' : prefersDark);
    },

    updateToolbar() {
      $all('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === this.tool));
      $all('[data-shape]').forEach(b => b.classList.toggle('active', this.tool === 'shape' && b.dataset.shape === this.shapeType));
      canvasContainer.classList.toggle('tool-connector', this.tool === 'connector');
      if (window.lucide) window.lucide.createIcons();
    },
    
    select(id, multi = false) {
      this.flow.select(id, multi);
    },

    zoom(factor) {
      const rect = canvasContainer.getBoundingClientRect();
      const x = (rect.width / 2 - this.flow.view.x) / this.flow.view.zoom;
      const y = (rect.height / 2 - this.flow.view.y) / this.flow.view.zoom;
      const newZoom = clamp(this.flow.view.zoom * factor, 0.2, 3);
      this.flow.view.x = rect.width / 2 - x * newZoom;
      this.flow.view.y = rect.height / 2 - y * newZoom;
      this.flow.view.zoom = newZoom;
      this.flow.render();
      this.renderHandles();
    },
    
    fitToScreen() {
      if (this.flow.shapes.length === 0) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      this.flow.shapes.forEach(s => {
        minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
        maxX = Math.max(maxX, s.x + s.w); maxY = Math.max(maxY, s.y + s.h);
      });
      const rect = canvasContainer.getBoundingClientRect();
      const padding = 50;
      const boundsW = maxX - minX; const boundsH = maxY - minY;
      const scaleX = (rect.width - padding * 2) / boundsW;
      const scaleY = (rect.height - padding * 2) / boundsH;
      this.flow.view.zoom = clamp(Math.min(scaleX, scaleY), 0.2, 2);
      const newBoundsW = boundsW * this.flow.view.zoom;
      const newBoundsH = boundsH * this.flow.view.zoom;
      this.flow.view.x = (rect.width - newBoundsW) / 2 - (minX * this.flow.view.zoom);
      this.flow.view.y = (rect.height - newBoundsH) / 2 - (minY * this.flow.view.zoom);
      this.flow.render();
      this.renderHandles();
    },

    getPoint(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - this.flow.view.x) / this.flow.view.zoom,
        y: (e.clientY - rect.top - this.flow.view.y) / this.flow.view.zoom
      };
    },

    // --- NEW: Smart Handle Rendering ---
    renderHandles() {
        handlesLayer.innerHTML = '';
        handlesLayer.setAttribute('transform', `translate(${this.flow.view.x},${this.flow.view.y}) scale(${this.flow.view.zoom})`);
        
        const showAllPorts = (this.tool === 'connector' || this.connectorStart);

        if (showAllPorts) {
            // --- Case 1: Connector tool is active OR we are drawing a line ---
            // Show ports on ALL shapes
            this.flow.shapes.forEach(shape => {
                this.renderPortsForShape(shape);
            });
        } else if (this.flow.selected.size === 1) {
            // --- Case 2: Select mode, one shape selected ---
            // Show ports AND resize handles on selected shape
            const id = [...this.flow.selected][0];
            const shape = this.flow.getShape(id);
            if (!shape || shape.type === 'connector') return; // Don't render for connectors
            
            this.renderPortsForShape(shape);
            this.renderResizeHandlesForShape(shape);
        }
    },

    // --- NEW HELPER FUNCTION FOR PORTS ---
    renderPortsForShape(shape) {
        const { x, y, w, h } = shape;
        const portSize = 5 / this.flow.view.zoom;
        const strokeWidth = 2 / this.flow.view.zoom;
        const portOffset = 8 / this.flow.view.zoom; 

        const anchors = this.flow.getAnchors(shape);
        for (const port in anchors) {
            const pos = anchors[port];
            let cx = pos.x;
            let cy = pos.y;

            switch(port) {
                case 'top':    cy -= portOffset; break;
                case 'bottom': cy += portOffset; break;
                case 'left':   cx -= portOffset; break;
                case 'right':  cx += portOffset; break;
            }

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('class', 'connector-port');
            circle.setAttribute('cx', cx); 
            circle.setAttribute('cy', cy); 
            circle.setAttribute('r', portSize);
            circle.setAttribute('stroke-width', strokeWidth); 
            circle.dataset.shapeId = shape.id;
            circle.dataset.port = port;
            
            // --- UPDATED: Handle DRAG-to-connect ---
            circle.addEventListener('mousedown', (e) => {
                if (this.tool === 'connector') {
                    // If we're in connector mode, let the 'click' handler manage it
                    return; 
                }
                
                // This is a drag-to-connect action
                e.preventDefault();
                e.stopPropagation();
                
                this.isPortDragging = true; // SET FLAG
                this.connectorStart = { id: shape.id, port };
                this.drawTempConnector(e); 
            });

            // --- UPDATED: Handle CLICK-to-connect ---
            circle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (this.isPortDragging) { // CHECK FLAG
                    // This was a drag, not a click. Ignore it.
                    return; 
                }
                
                const clickedPort = { id: e.currentTarget.dataset.shapeId, port: e.currentTarget.dataset.port };

                if (!this.connectorStart) {
                    // This is the FIRST click (starting the connection)
                    this.tool = 'connector'; // Enter connector mode
                    this.updateToolbar();
                    this.connectorStart = clickedPort;
                    this.drawTempConnector(e);
                    this.renderHandles(); // Re-render to show all ports
                } else {
                    // This is the SECOND click (completing the connection)
                    this.completeConnection(clickedPort);
                }
            });
            handlesLayer.appendChild(circle);
        }
    },

    // --- NEW HELPER FUNCTION FOR RESIZE HANDLES ---
    renderResizeHandlesForShape(shape) {
        const { x, y, w, h } = shape;
        const handleSize = 8 / this.flow.view.zoom;
        const strokeWidth = 2 / this.flow.view.zoom;

        const handlePositions = {
            'n': { x: x + w / 2, y: y },
            's': { x: x + w / 2, y: y + h },
            'w': { x: x, y: y + h / 2 },
            'e': { x: x + w, y: y + h / 2 },
            'nw': { x: x, y: y },
            'ne': { x: x + w, y: y },
            'sw': { x: x, y: y + h },
            'se': { x: x + w, y: y + h }
        };

        for (const dir in handlePositions) {
            const pos = handlePositions[dir];
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('class', 'resize-handle');
            rect.setAttribute('x', pos.x - handleSize / 2);
            rect.setAttribute('y', pos.y - handleSize / 2);
            rect.setAttribute('width', handleSize);
            rect.setAttribute('height', handleSize);
            rect.setAttribute('stroke-width', strokeWidth);
            rect.dataset.dir = dir;
            
            rect.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this.resizing = true;
                this.resizeHandle = dir;
                this.resizeStart = this.getPoint(e);
                this.resizeStartShape = { ...shape };
            });
            handlesLayer.appendChild(rect);
        }
    },
    // --- END NEW HELPERS ---
    
    renderGuides(draggingShape) {
        guidesLayer.innerHTML = '';
        guidesLayer.setAttribute('transform', `translate(${this.flow.view.x},${this.flow.view.y}) scale(${this.flow.view.zoom})`);
        
        const dragBounds = {
            midX: draggingShape.x + draggingShape.w / 2,
            midY: draggingShape.y + draggingShape.h / 2,
            top: draggingShape.y,
            bottom: draggingShape.y + draggingShape.h,
            left: draggingShape.x,
            right: draggingShape.x + draggingShape.w
        };
        
        let snappedX = false, snappedY = false;

        for (const shape of this.flow.shapes) {
            if (shape.id === draggingShape.id) continue;
            
            const staticBounds = {
                midX: shape.x + shape.w / 2,
                midY: shape.y + shape.h / 2,
                top: shape.y,
                bottom: shape.y + shape.h,
                left: shape.x,
                right: shape.x + shape.w
            };

            if (!snappedX) {
                if (Math.abs(dragBounds.midX - staticBounds.midX) < SNAP_THRESHOLD) {
                    this.drawGuide(staticBounds.midX, Math.min(dragBounds.top, staticBounds.top), staticBounds.midX, Math.max(dragBounds.bottom, staticBounds.bottom));
                    draggingShape.x = staticBounds.midX - draggingShape.w / 2;
                    snappedX = true;
                } else if (Math.abs(dragBounds.left - staticBounds.left) < SNAP_THRESHOLD) {
                    this.drawGuide(staticBounds.left, Math.min(dragBounds.top, staticBounds.top), staticBounds.left, Math.max(dragBounds.bottom, staticBounds.bottom));
                    draggingShape.x = staticBounds.left;
                    snappedX = true;
                } else if (Math.abs(dragBounds.right - staticBounds.right) < SNAP_THRESHOLD) {
                    this.drawGuide(staticBounds.right, Math.min(dragBounds.top, staticBounds.top), staticBounds.right, Math.max(dragBounds.bottom, staticBounds.bottom));
                    draggingShape.x = staticBounds.right - draggingShape.w;
                    snappedX = true;
                }
            }
            
            if (!snappedY) {
                 if (Math.abs(dragBounds.midY - staticBounds.midY) < SNAP_THRESHOLD) {
                    this.drawGuide(Math.min(dragBounds.left, staticBounds.left), staticBounds.midY, Math.max(dragBounds.right, staticBounds.right), staticBounds.midY);
                    draggingShape.y = staticBounds.midY - draggingShape.h / 2;
                    snappedY = true;
                } else if (Math.abs(dragBounds.top - staticBounds.top) < SNAP_THRESHOLD) {
                    this.drawGuide(Math.min(dragBounds.left, staticBounds.left), staticBounds.top, Math.max(dragBounds.right, staticBounds.right), staticBounds.top);
                    draggingShape.y = staticBounds.top;
                    snappedY = true;
                } else if (Math.abs(dragBounds.bottom - staticBounds.bottom) < SNAP_THRESHOLD) {
                    this.drawGuide(Math.min(dragBounds.left, staticBounds.left), staticBounds.bottom, Math.max(dragBounds.right, staticBounds.right), staticBounds.bottom);
                    draggingShape.y = staticBounds.bottom - draggingShape.h;
                    snappedY = true;
                }
            }
        }
        if (!snappedX) draggingShape.x = snapToGrid(draggingShape.x);
        if (!snappedY) draggingShape.y = snapToGrid(draggingShape.y);
    },
    
    drawGuide(x1, y1, x2, y2) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'alignment-guide');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        line.setAttribute('stroke-width', 2 / this.flow.view.zoom);
        guidesLayer.appendChild(line);
    },
    
    clearGuides() {
        guidesLayer.innerHTML = '';
    },
    
    onShapeMouseDown(e, id) {
      if (isRunning) return;
      if (this.tool === 'select') {
        this.dragging = true;
        this.dragShapeId = id;
        const pt = this.getPoint(e);
        const shape = this.flow.getShape(id);
        this.dragOffset = { x: pt.x - shape.x, y: pt.y - shape.y };
        if (!this.flow.selected.has(id)) this.flow.select(id, e.shiftKey);
      }
    },

    onMouseDown(e) {
      if (isRunning) return;
      if (e.target.closest('.resize-handle')) {
          return;
      }

      // --- NEW: Cancel connection on canvas click & auto-revert ---
      if (this.tool === 'connector' && this.connectorStart) {
        // Check if we're clicking *not* on a port
        if (!e.target.closest('.connector-port')) {
            e.stopPropagation();
            this.connectorStart = null;
            tempLayer.innerHTML = '';
            
            // --- NEW: Toggle back to select tool ---
            this.tool = 'select';
            this.updateToolbar();
            this.renderHandles();
            // --- END NEW ---
            
            return; // Don't start panning
        }
      }
      // --- END NEW ---
      
      const pt = this.getPoint(e);
      if (this.tool === 'shape' && this.shapeType) {
        this.flow.addShape(this.shapeType, pt.x, pt.y);
        this.tool = 'select';
        this.updateToolbar();
        return;
      }
      if (this.tool === 'select' && !this.dragging) {
        this.panning = true;
        this.panStart = { x: e.clientX - this.flow.view.x, y: e.clientY - this.flow.view.y };
        canvasContainer.style.cursor = 'grabbing';
        
        if (this.flow.selected.size > 0) {
            this.flow.selected.clear();
            this.flow.render();
            this.renderHandles();
        }
      }
    },

    onMouseMove(e) {
      if (this.resizing) {
          const shape = this.flow.getShape([...this.flow.selected][0]);
          if (!shape) return;
          
          const pt = this.getPoint(e);
          const dx = pt.x - this.resizeStart.x;
          const dy = pt.y - this.resizeStart.y;
          
          let { x, y, w, h } = this.resizeStartShape;

          if (this.resizeHandle.includes('e')) w = Math.max(MIN_SHAPE_SIZE, w + dx);
          if (this.resizeHandle.includes('s')) h = Math.max(MIN_SHAPE_SIZE, h + dy);
          if (this.resizeHandle.includes('w')) {
              w = Math.max(MIN_SHAPE_SIZE, w - dx);
              x = this.resizeStartShape.x + dx;
          }
          if (this.resizeHandle.includes('n')) {
              h = Math.max(MIN_SHAPE_SIZE, h - dy);
              y = this.resizeStartShape.y + dy;
          }
          
          if (w < MIN_SHAPE_SIZE) {
              if (this.resizeHandle.includes('w')) x = this.resizeStartShape.x + this.resizeStartShape.w - MIN_SHAPE_SIZE;
              w = MIN_SHAPE_SIZE;
          }
          if (h < MIN_SHAPE_SIZE) {
              if (this.resizeHandle.includes('n')) y = this.resizeStartShape.y + this.resizeStartShape.h - MIN_SHAPE_SIZE;
              h = MIN_SHAPE_SIZE;
          }
          
          shape.x = x;
          shape.y = y;
          shape.w = w;
          shape.h = h;
          
          this.flow.render();
          this.renderHandles();
          return;
      }
      
      if (this.dragging && this.dragShapeId) {
        const pt = this.getPoint(e);
        const shape = this.flow.getShape(this.dragShapeId);
        shape.x = pt.x - this.dragOffset.x;
        shape.y = pt.y - this.dragOffset.y;
        this.renderGuides(shape);
        this.flow.render();
        this.renderHandles();
        return;
      }
      
      if (this.panning) {
        this.flow.view.x = e.clientX - this.panStart.x;
        this.flow.view.y = e.clientY - this.panStart.y;
        this.flow.render();
        this.renderHandles();
      }
      
      if (this.connectorStart) this.drawTempConnector(e);
    },

    async onMouseUp(e) {
      // --- NEW: Reset port dragging flag ---
      if (this.isPortDragging) {
          this.isPortDragging = false;
      }
      // --- END NEW ---

      if (this.resizing) {
          this.resizing = false;
          // Rerender one last time to fix text after resize
          this.flow.render();
          this.renderHandles();
          this.flow.save();
      }
      
      if (this.dragging) {
        this.dragging = false; this.dragShapeId = null;
        this.clearGuides();
        this.flow.save();
      }
      if (this.panning) {
        this.panning = false;
        canvasContainer.style.cursor = 'grab';
      }
      
      // --- Handle DRAG-to-connect "drop" logic ---
      if (this.connectorStart && this.tool !== 'connector') {
        const pt = this.getPoint(e);
        let target = null;
        
        const portEl = e.target.closest('.connector-port');
        
        if (portEl && portEl.dataset.shapeId) {
            target = { id: portEl.dataset.shapeId, port: portEl.dataset.port };
        }
        
        if (!target) {
            const targetShape = this.flow.shapes.find(s => pt.x >= s.x && pt.x <= s.x + s.w && pt.y >= s.y && pt.y <= s.y + s.h);
            if (targetShape) {
                const anchors = this.flow.getAnchors(targetShape);
                let closestPort = 'top';
                let minDist = Infinity;
                for(const port in anchors) {
                    const dist = Math.hypot(pt.x - anchors[port].x, pt.y - anchors[port].y);
                    if (dist < minDist) {
                        minDist = dist;
                        closestPort = port;
                    }
                }
                target = { id: targetShape.id, port: closestPort };
            }
        }
        
        // Use the function we already built
        await this.completeConnection(target);
        
        // completeConnection now handles cleanup
      }
    },

    // --- UPDATED: Connection function with auto-revert ---
    completeConnection: async function(target) {
        if (!this.connectorStart) return; // Safety check
        
        if (target && target.id !== this.connectorStart.id) {
            
            const isPortAlreadyUsed = this.flow.connectors.some(conn => 
                conn.from.id === this.connectorStart.id && 
                conn.from.port === this.connectorStart.port
            );

            if (isPortAlreadyUsed) {
                showToast("This connector port is already in use.");
            } else {
                const fromShape = this.flow.getShape(this.connectorStart.id);
                let label = '';
                let addConnector = true;
                
                if (fromShape && fromShape.type === 'diamond') {
                    const modalResult = await this.promptConnectorLabel();
                    if(modalResult === null) { // User clicked "Cancel"
                        addConnector = false;
                    } else {
                        label = modalResult;
                    }
                }
                
                if (addConnector) {
                    this.flow.addConnector(this.connectorStart, target, label);
                    this.flow.render();
                }
            }
        }
        
        // Clear temp line and reset
        tempLayer.innerHTML = '';
        this.connectorStart = null;
        
        // --- NEW: Toggle back to select tool ---
        this.tool = 'select';
        this.updateToolbar();
        this.renderHandles();
        // --- END NEW ---
    },
    // --- END UPDATED FUNCTION ---

    drawTempConnector(e) {
      const pt = this.getPoint(e);
      const fromShape = this.flow.getShape(this.connectorStart.id);
      const p1 = this.flow.getAnchor(fromShape, this.connectorStart.port);
      
      tempLayer.setAttribute('transform', `translate(${this.flow.view.x},${this.flow.view.y}) scale(${this.flow.view.zoom})`);
      
      let d = `M ${p1.x},${p1.y} `;
      if (this.connectorStart.port === 'top' || this.connectorStart.port === 'bottom') {
          const midY = (p1.y + pt.y) / 2;
          d += `L ${p1.x},${midY} L ${pt.x},${midY} L ${pt.x},${pt.y}`;
      } else {
          const midX = (p1.x + pt.x) / 2;
          d += `L ${midX},${p1.y} L ${midX},${pt.y} L ${pt.x},${pt.y}`;
      }
      
      tempLayer.innerHTML = `<path d="${d}" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6" fill="none" marker-end="url(#arrowhead-active)"/>`;
    },
    
    setTheme(dark) {
      document.documentElement.classList.toggle('dark', dark);
      localStorage.setItem('theme', dark ? 'dark' : 'light');
      sunIcon?.classList.toggle('hidden', !dark);
      moonIcon?.classList.toggle('hidden', dark);
      lightModeBanner?.classList.toggle('hidden', dark);
      darkModeBanner?.classList.toggle('hidden', !dark);
    },
    
    toggleTheme() {
      this.setTheme(!document.documentElement.classList.contains('dark'));
    },

    // --- REVISED: Touch Handler Functions (Fix for Long-Press-to-Drag) ---
    
    onTouchStart(e) {
      if (isRunning) return;

      // 2-FINGER PINCH
      if (e.touches.length === 2) {
        e.preventDefault();
        this.isPinching = true;
        this.dragging = this.panning = this.resizing = this.isPortDragging = false;
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;

        this.lastPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (this.connectorStart) {
          this.connectorStart = null;
          tempLayer.innerHTML = '';
          this.tool = 'select';
          this.updateToolbar();
        }
        return;
      }

      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const el = e.target;

      // 1. RESIZE HANDLE (PRIORITY)
      const handle = el.closest('.resize-handle');
      if (handle && this.flow.selected.size === 1) {
        e.preventDefault();
        this.panning = false;
        this.resizing = true;
        this.resizeHandle = handle.dataset.dir;
        this.resizeStart = this.getPoint(touch);
        const shape = this.flow.getShape([...this.flow.selected][0]);
        if (shape) this.resizeStartShape = { ...shape };
        return;
      }

      // 2. CONNECTOR PORT
      const port = el.closest('.connector-port');
      if (port) {
        e.preventDefault();
        this.panning = false;
        if (this.tool !== 'connector') {
          this.isPortDragging = true;
          this.connectorStart = { id: port.dataset.shapeId, port: port.dataset.port };
          this.drawTempConnector(touch);
        }
        return;
      }

      // 3. SHAPE → LONG-PRESS = DRAG
      const shapeG = el.closest('.flowchart-shape');
      if (shapeG) {
        e.preventDefault();
        this.panning = false;

        const shapeId = shapeG.dataset.shapeId;
        const pt = this.getPoint(touch);
        const shape = this.flow.getShape(shapeId);
        if (!shape) return;

        this.dragOffset = { x: pt.x - shape.x, y: pt.y - shape.y };
        this.dragShapeId = shapeId;
        this.lastTouch = { x: touch.clientX, y: touch.clientY };

        this.longPressTimer = setTimeout(() => {
          if (navigator.vibrate) navigator.vibrate(40);

          this.dragging = true;
          this.flow.select(shapeId, false);
          handlesLayer.innerHTML = '';

          const g = document.querySelector(`[data-shape-id="${shapeId}"]`);
          if (g) {
            g.style.transition = 'transform .1s ease-out, box-shadow .1s';
            g.style.transform = 'translateY(-6px) scale(1.04)';
            g.style.boxShadow = '0 12px 24px rgba(0,0,0,0.25)';
          }

          this.startDragLoop();
          this.longPressTimer = null;
        }, 380);

        return;
      }

      // 4. CONNECTOR LINE → TAP SELECT
      const conn = el.closest('.connector-group');
      if (conn && conn.dataset.connId) {
        e.preventDefault();
        this.panning = false;
        this.flow.select(conn.dataset.connId, false);
        this.renderHandles();
        return;
      }

      // 5. PAN
      if (this.tool === 'shape') return; // Let it fall through to onMouseDown
      e.preventDefault();
      this.panning = true;
      this.panStart = { x: touch.clientX - this.flow.view.x, y: touch.clientY - this.flow.view.y };
      if (this.flow.selected.size) {
        this.flow.selected.clear();
        this.flow.render();
        handlesLayer.innerHTML = '';
      }
    },

    startDragLoop() {
      this.stopDragLoop();
      const loop = () => {
        if (!this.dragging || !this.dragShapeId || !this.lastTouch) return;
        const pt = this.getPointFromClient(this.lastTouch.x, this.lastTouch.y);
        const shape = this.flow.getShape(this.dragShapeId);
        if (shape) {
          shape.x = pt.x - this.dragOffset.x;
          shape.y = pt.y - this.dragOffset.y;
          this.renderGuides(shape);
          this.flow.render();
        }
        this.dragRaf = requestAnimationFrame(loop);
      };
      this.dragRaf = requestAnimationFrame(loop);
    },

    stopDragLoop() {
      if (this.dragRaf) cancelAnimationFrame(this.dragRaf);
      this.dragRaf = null;
    },

    getPointFromClient(clientX, clientY) {
      const rect = canvasContainer.getBoundingClientRect();
      const x = (clientX - rect.left - this.flow.view.x) / this.flow.view.zoom;
      const y = (clientY - rect.top - this.flow.view.y) / this.flow.view.zoom;
      return { x, y };
    },

    onTouchMove(e) {
      if (isRunning) return;

      // PINCH
      if (e.touches.length === 2 && this.isPinching) {
        e.preventDefault();
        const newDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const scale = newDist / this.lastPinchDist;
        this.lastPinchDist = newDist;

        const rect = canvasContainer.getBoundingClientRect();
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const mx = midX - rect.left;
        const my = midY - rect.top;
        const sx = (mx - this.flow.view.x) / this.flow.view.zoom;
        const sy = (my - this.flow.view.y) / this.flow.view.zoom;
        const newZoom = clamp(this.flow.view.zoom * scale, 0.2, 3);

        this.flow.view.x = mx - sx * newZoom;
        this.flow.view.y = my - sy * newZoom;
        this.flow.view.zoom = newZoom;

        this.flow.render();
        this.renderHandles(); // Re-render handles on zoom
        return;
      }

      if (e.touches.length !== 1) return;
      const touch = e.touches[0];

      this.lastTouch = { x: touch.clientX, y: touch.clientY };

      // RESIZE
      if (this.resizing && this.resizeStartShape) {
        e.preventDefault();
        const pt = this.getPoint(touch);
        const shape = this.flow.getShape([...this.flow.selected][0]);
        if (!shape) return;

        const dx = pt.x - this.resizeStart.x;
        const dy = pt.y - this.resizeStart.y;
        const dir = this.resizeHandle;
        
        let { x, y, w, h } = this.resizeStartShape;

        if (dir.includes('e')) w = Math.max(MIN_SHAPE_SIZE, w + dx);
        if (dir.includes('s')) h = Math.max(MIN_SHAPE_SIZE, h + dy);
        if (dir.includes('w')) {
            w = Math.max(MIN_SHAPE_SIZE, w - dx);
            x = this.resizeStartShape.x + dx;
        }
        if (dir.includes('n')) {
            h = Math.max(MIN_SHAPE_SIZE, h - dy);
            y = this.resizeStartShape.y + dy;
        }
        
        // Prevent inverting
        if (w < MIN_SHAPE_SIZE) {
            if (dir.includes('w')) x = this.resizeStartShape.x + this.resizeStartShape.w - MIN_SHAPE_SIZE;
            w = MIN_SHAPE_SIZE;
        }
        if (h < MIN_SHAPE_SIZE) {
            if (dir.includes('n')) y = this.resizeStartShape.y + this.resizeStartShape.h - MIN_SHAPE_SIZE;
            h = MIN_SHAPE_SIZE;
        }

        shape.x = x; shape.y = y; shape.w = w; shape.h = h;

        this.flow.render();
        this.renderHandles();
        return;
      }

      // DRAG (loop handles it)
      if (this.dragging) {
        e.preventDefault();
        return;
      }
      
      // DRAG-TO-CONNECT
      if (this.isPortDragging && this.connectorStart) {
          e.preventDefault();
          this.drawTempConnector(touch);
          return;
      }

      // PAN
      if (this.panning) {
        e.preventDefault();
        this.flow.view.x = touch.clientX - this.panStart.x;
        this.flow.view.y = touch.clientY - this.panStart.y;
        this.flow.render();
      }
    },

    async onTouchEnd(e) {
      if (isRunning) return;

      if (this.isPinching && e.touches.length < 2) {
        this.isPinching = false;
        this.lastPinchDist = null;
      }
      
      // Clear long press if it was just a tap
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
        // This was a TAP on a shape
        const shapeG = e.target.closest('.flowchart-shape');
        if (shapeG) {
          this.flow.select(shapeG.dataset.shapeId, false);
          this.renderHandles();
        }
      }

      // PORT TAP (Click-to-connect)
      const port = e.target.closest('.connector-port');
      if (port && !this.isPortDragging && !this.dragging && !this.resizing && !this.panning) {
        e.preventDefault();
        const clicked = { id: port.dataset.shapeId, port: port.dataset.port };
        if (!this.connectorStart) {
          this.tool = 'connector';
          this.updateToolbar();
          this.connectorStart = clicked;
          this.drawTempConnector(e.changedTouches[0]);
          this.renderHandles();
        } else {
          await this.completeConnection(clicked);
        }
        return;
      }
      
      // PORT DROP (Drag-to-connect)
      if (this.isPortDragging && this.connectorStart) {
          const pt = this.getPoint(e.changedTouches[0]);
          let target = null;
          // We can't use e.target on touchend, so we must find the port/shape at the drop coords
          
          // Check for port first
          const droppedOnPort = document.elementFromPoint(e.changedTouches[0].clientX, e.changedTouches[0].clientY)?.closest('.connector-port');
          if (droppedOnPort) {
              target = { id: droppedOnPort.dataset.shapeId, port: droppedOnPort.dataset.port };
          }
          
          // Check for shape body
          if (!target) {
              const droppedOnShape = this.flow.shapes.find(s => pt.x >= s.x && pt.x <= s.x + s.w && pt.y >= s.y && pt.y <= s.y + s.h);
              if (droppedOnShape) {
                  const anchors = this.flow.getAnchors(droppedOnShape);
                    let closestPort = 'top';
                    let minDist = Infinity;
                    for(const p in anchors) {
                        const dist = Math.hypot(pt.x - anchors[p].x, pt.y - anchors[p].y);
                        if (dist < minDist) {
                            minDist = dist;
                            closestPort = p;
                        }
                    }
                    target = { id: droppedOnShape.id, port: closestPort };
              }
          }
          
          await this.completeConnection(target);
          this.isPortDragging = false; // Already cleaned up by completeConnection
          return;
      }

      // DROP SHAPE
      if (this.dragging && this.dragShapeId) {
        this.stopDragLoop();
        const shape = this.flow.getShape(this.dragShapeId);
        if (shape) {
          shape.x = snapToGrid(shape.x);
          shape.y = snapToGrid(shape.y);
          this.flow.save();
        }
        this.clearGuides();

        const g = document.querySelector(`[data-shape-id="${this.dragShapeId}"]`);
        if (g) {
          g.style.transition = '';
          g.style.transform = '';
          g.style.boxShadow = '';
        }
        
        this.flow.render(); // Full render to fix any artifacts
        this.renderHandles();
      }

      // FINALIZE RESIZE
      if (this.resizing) {
        const shape = this.flow.getShape([...this.flow.selected][0]);
        if (shape) {
          shape.w = Math.max(MIN_SHAPE_SIZE, snapToGrid(shape.w));
          shape.h = Math.max(MIN_SHAPE_SIZE, snapToGrid(shape.h));
          this.flow.save();
        }
        this.flow.render(); // Full render to fix text
        this.renderHandles();
      }

      // RESET
      this.dragging = this.dragShapeId = this.dragOffset = null;
      this.panning = this.resizing = this.isPortDragging = false;
      this.lastTouch = null;
      canvasContainer.style.cursor = 'grab';
    }
    // --- END REVISED Touch Handlers ---
    
  };

  /* ==========================================================================
     3. Advanced Interpreter (The Engine)
     ========================================================================== */
  
  const interpreter = {
    
    appendLine(text, type = 'info') {
      const div = document.createElement('div');
      div.className = 'line';
      if (type === 'error') {
        div.style.color = 'var(--danger)'; // Use CSS var
        div.textContent = `Error: ${text}`;
      } else if (type === 'system') {
        div.style.color = 'var(--accent)'; // Use CSS var
        div.textContent = `=== ${text} ===`;
      } else {
        div.style.color = 'var(--term-text)'; // Use CSS var
        div.textContent = text;
      }
      terminal.appendChild(div);
      terminal.scrollTop = terminal.scrollHeight;
    },
    
    appendInvisiblePrompt(callback) {
      const div = document.createElement('div');
      div.className = 'prompt';
      div.innerHTML = `<input type="text" class="input-field" autofocus>`;
      terminal.appendChild(div);
      const input = div.querySelector('input');
      input.focus();
      const onKey = (e) => {
        if (e.key === 'Enter') {
          const val = input.value;
          div.innerHTML = val;
          div.style.color = 'var(--success)'; // Use CSS var
          input.removeEventListener('keydown', onKey);
          callback(val);
        }
      };
      input.addEventListener('keydown', onKey);
      terminal.scrollTop = terminal.scrollHeight;
    },
    
    clearTerminal() {
      terminal.innerHTML = '';
      // Hide terminal on mobile when user clears it, *unless* we are running
      if (window.innerWidth <= 1024 && !isRunning) { 
        terminalPanel.classList.add('hidden-mobile');
      }
    },
    
    // --- *** THIS IS THE UPDATED FUNCTION *** ---
    evalExpr(expr) {
      if (expr === undefined || expr === null) return undefined;
      let tempExpr = String(expr).trim();
      
      // Match string/char literals first
      const stringMatch = tempExpr.match(/^"((?:\\.|[^"\\])*)"$/);
      if (stringMatch) return stringMatch[1].replace(/\\(.)/g, '$1');
      const stringMatch2 = tempExpr.match(/^'((?:\\.|[^'\\])*)'$/);
      if (stringMatch2) return stringMatch2[1].replace(/\\(.)/g, '$1');

      // It's not a simple string, so we process it
      let placeholders = [];
      
      // Store all string/char literals to protect them from replacement
      tempExpr = tempExpr.replace(/("(\\.|[^"\\])*"|'(\\.|[^'\\])*')/g, (match) => {
        placeholders.push(match);
        return `__PLACEHOLDER_${placeholders.length - 1}__`;
      });

      // Replace variables with their values
      tempExpr = tempExpr.replace(/\b([A-Za-z_]\w*)\b/g, (m) => {
        if (variables.hasOwnProperty(m)) {
          const val = variables[m];
          // --- FIX: Use 'null' for uninitialized (null) variables ---
          if (val === null) return 'null'; 
          if (typeof val === 'string') return JSON.stringify(val); // Add quotes
          return String(val);
        }
        // Handle TRUE/FALSE/null keywords
        if (/^(TRUE|FALSE|null)$/i.test(m)) return m.toLowerCase();
        return m; // Keep unrecognized words (could be JS built-ins like Math)
      });

      // --- *** NEW OPERATOR REPLACEMENTS *** ---
      // Replace all pseudocode operators with their JS equivalents
      tempExpr = tempExpr
        .replace(/\bAND\b/gi, '&&')      // Pseudocode AND
        .replace(/\bOR\b/gi, '||')       // Pseudocode OR
        .replace(/\bNOT\b/gi, '!')       // Pseudocode NOT
        .replace(/(?<![<>=!])!(?!=)/g, '!') // C-style NOT (that isn't part of !=)
        .replace(/\bDIV\b/gi, 'Math.floor') // Integer division
        .replace(/\bMOD\b/gi, '%')       // Modulus
        .replace(/<>/g, '!==')            // Pseudocode not equal
        .replace(/!=/g, '!==')            // C-style not equal
        .replace(/==/g, '===');           // C-style equal (promote to strict)
        // .replace(/(?<![=!<>])=(?!=)/g, '==='); // <-- THIS LINE IS REMOVED
      // --- *** END NEW REPLACEMENTS *** ---

      // Restore the string/char literals
      tempExpr = tempExpr.replace(/__PLACEHOLDER_(\d+)__/g, (match, index) => {
        return placeholders[index];
      });

      // Evaluate the final JS expression
      try {
        return Function(`"use strict"; return (${tempExpr});`)();
      } catch (e) {
        throw new Error(`Invalid expression "${expr}". Failed to evaluate: ${e.message}`);
      }
    },
    // --- *** END OF UPDATED FUNCTION *** ---
    
    async startRun() {
      if (isRunning) return;
      isRunning = true; // <-- MOVED TO TOP
          
      terminalPanel.classList.remove('hidden-mobile'); // Show the terminal
      
      const startShape = ui.flow.getStartShape();
      if (!startShape) {
        this.appendLine("Cannot find START shape.", "error");
        this.stopRun(); // Need to call stopRun to reset state
        return;
      }
      
      variables = {};
      controlStack = [];
      iterationCount = 0;
      let lastShapeId = null;
      this.clearTerminal(); // Now safe to call
      this.appendLine("Execution started...", "system");
      currentShapeId = startShape.id;
      ui.flow.activeConnector = null; // Reset connector at start
      
      while (isRunning && currentShapeId) {
        
        // --- NEW: Find the connector we just traversed ---
        if (lastShapeId) {
          const connector = ui.flow.connectors.find(c => 
            c.from.id === lastShapeId && c.to.id === currentShapeId
          );
          ui.flow.activeConnector = connector ? connector.id : null;
        }
        // --- END NEW ---

        ui.flow.activeShape = currentShapeId;
        ui.flow.render(); // This will now render the active shape AND the flowing connector
        iterationCount++;
        if (iterationCount > maxIterations) {
          this.appendLine("Potential infinite loop detected!", "error");
          this.stopRun();
          return;
        }
        const shape = ui.flow.getShape(currentShapeId);
        if (!shape) {
          this.appendLine("Execution path lost.", "error");
          this.stopRun();
          return;
        }
        lastShapeId = currentShapeId; 
        try {
          currentShapeId = await this.executeShape(shape);
        } catch (e) {
          this.appendLine(e.message, "error");
          this.stopRun();
          return;
        }
        await new Promise(r => setTimeout(r, 200)); 
      }
      
      if (isRunning) {
        const lastShape = ui.flow.getShape(lastShapeId);
        if (lastShape && (lastShape.text.toUpperCase() === 'STOP' || lastShape.text.toUpperCase() === 'END')) {
          this.appendLine("Execution finished.", "system");
        } else {
          const errorMsg = lastShape ? `"${lastShape.text}"` : 'the start';
          this.appendLine(`Execution halted. No valid connector or STOP shape found after ${errorMsg}.`, "error");
        }
      }
      this.stopRun();
    },
    
    stopRun() {
      isRunning = false;
      currentShapeId = null;
      ui.flow.activeShape = null;
      ui.flow.activeConnector = null; 
      ui.flow.render();

      if (terminal.querySelector('.input-field')) {
        this.appendLine("Execution stopped by user.", "system");
      }
      
      // Hide terminal on mobile when run finishes/stops
      if (window.innerWidth <= 1024) {
        terminalPanel.classList.add('hidden-mobile');
      }
    },
    
    async executeShape(shape) {
      const lines = shape.text.split('\n').map(s => s.trim()).filter(Boolean);
      let decision = null;
      
      for (const line of lines) {
        if (!isRunning) return null;
        const upperLine = line.toUpperCase();
        
        if (upperLine === 'START') {
        } 
        else if (upperLine === 'STOP' || upperLine === 'END') {
          return null;
        }
        else if (upperLine.startsWith('DECLARE') || upperLine.startsWith('INIT')) {
          const rest = line.replace(/^(?:DECLARE|INIT)\s+/i, '');
          const parts = rest.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
          for (const part of parts) {
            const assignMatch = part.match(/([a-zA-Z_]\w*)\s*=\s*(.+)/);
            if (assignMatch) {
              const varName = assignMatch[1].trim();
              if (variables.hasOwnProperty(varName)) throw new Error(`Variable "${varName}" is already declared.`);
              variables[varName] = this.evalExpr(assignMatch[2].trim());
            } else {
              const varName = part.trim();
              if (variables.hasOwnProperty(varName)) throw new Error(`Variable "${varName}" is already declared.`);
              if (!/^[a-zA-Z_]\w*$/.test(varName)) throw new Error(`Invalid variable name: "${varName}".`);
              variables[varName] = null;
            }
          }
        }
        // --- THIS IS THE FIXED LINE ---
        else if (upperLine.startsWith('SET') || upperLine.startsWith('LET') || /(?<![=<>!])=(?!=)/.test(line)) {
          // --- FIX: Corrected Regex from [a-a-zA-Z_] to [a-zA-Z_] ---
          const assignMatch = line.match(/^(?:SET|LET)?\s*([a-zA-Z_]\w*)\s*=\s*(.+)/i);
          if (!assignMatch) {
            // If it's not an assignment, it might be a condition in a non-diamond shape (error)
            if (shape.type !== 'diamond') {
                // --- UPDATED ERROR MESSAGE ---
                throw new Error(`Invalid statement. Conditions (like ==, <, >) are only allowed in diamond shapes: "${line}"`);
            }
            // If it IS a diamond, just evaluate it as a condition
            decision = this.evalExpr(line);
          } else {
            // It IS an assignment
            const varName = assignMatch[1].trim();
            const expr = assignMatch[2].trim();
            if (!variables.hasOwnProperty(varName)) throw new Error(`Variable "${varName}" not DECLARED before use.`);
            variables[varName] = this.evalExpr(expr);
          }
        }
        else if (upperLine.startsWith('PRINT') || upperLine.startsWith('OUTPUT') || upperLine.startsWith('DISPLAY')) {
          const rest = line.replace(/^(?:PRINT|OUTPUT|DISPLAY)\s+/i, '');
          
          // --- UPDATED: Use the more robust comma-splitting regex ---
          const parts = rest.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)(?=(?:(?:[^']*'){2})*[^']*$)/) || [];
          
          let outputString = "";
          for (const part of parts) {
              const trimmedPart = part.trim();
              if (trimmedPart) {
                  
                  // --- *** THIS IS THE CHANGE *** ---
                  let value = this.evalExpr(trimmedPart);
                  
                  // Check if the value is a number and has decimal places
                  if (typeof value === 'number' && !Number.isInteger(value)) {
                      // Format to 2 decimal places
                      value = value.toFixed(2);
                  }
                  
                  outputString += value; 
                  // --- *** END OF CHANGE *** ---
              }
          }
          this.appendLine(outputString, 'info');
        }
        else if (upperLine.startsWith('INPUT') || upperLine.startsWith('READ') || upperLine.startsWith('GET')) {
          const varName = line.replace(/^(?:INPUT|READ|GET)\s+/i, '').trim();
          if (!variables.hasOwnProperty(varName)) throw new Error(`Variable "${varName}" not DECLARED before use.`);
          const val = await new Promise(resolve => {
            this.appendInvisiblePrompt(resolve);
          });
          if (!isRunning) return null;
          const numeric = (val !== '' && !isNaN(val) && val.trim() !== '');
          variables[varName] = numeric ? parseFloat(val) : val;
        }
        // --- UPDATED: 'is' keyword support ---
        else if (shape.type === 'diamond') {
            // --- NEW: Handle "is" keyword ---
            let exprToEvaluate = line.trim(); // Get the line and trim whitespace
            if (exprToEvaluate.toUpperCase().startsWith('IS ')) {
                // If it starts with "is", cut that part off
                exprToEvaluate = exprToEvaluate.substring(3).trim(); 
            }
            // --- END NEW ---
            
            decision = this.evalExpr(exprToEvaluate); // Evaluate the processed expression
        }
        else {
          throw new Error(`Unknown syntax in ${shape.type} shape: "${line}"`);
        }
      }
      
      return ui.flow.getNextShape(shape, decision)?.id;
    }

  // --- Initialize Everything ---
  ui.init();
  interpreter.appendLine("Flowchart Interpreter Ready.", "system");
  
  // Expose for debugging
  window.FlowApp = {
    ui,
    flow: ui.flow,
    interpreter
  };
});

