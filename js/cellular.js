const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const CHUNK_SIZE = 32;

const PRESETS = [
  { name: "Conway's Life", rule: "B3/S23" },
  { name: "HighLife", rule: "B36/S23" },
  { name: "Seeds", rule: "B2/S" },
  { name: "Day & Night", rule: "B3678/S34678" },
  { name: "Replicator", rule: "B1357/S1357" },
  { name: "Maze", rule: "B3/S12345" },
  { name: "Coral", rule: "B3/S01234" },
  { name: "Anneal", rule: "B4678/S35678" },
  { name: "2x2", rule: "B36/S125" },
  { name: "Diamoeba", rule: "B35678/S5678" },
  { name: "Mazectric", rule: "B3/S1234" },
  { name: "Life w/o Death", rule: "B3/S012345678" },
];

const PATTERNS = [
  {
    name: "Block", category: "Still Lifes",
    rows: ["##", "##"]
  },
  {
    name: "Beehive", category: "Still Lifes",
    rows: [".##.", "#..#", ".##."]
  },
  {
    name: "Blinker", category: "Oscillators",
    rows: ["###"]
  },
  {
    name: "Toad", category: "Oscillators",
    rows: [".###", "###."]
  },
  {
    name: "Pulsar", category: "Oscillators",
    rows: [
      "..###...###..",
      ".............",
      "#....#.#....#",
      "#....#.#....#",
      "#....#.#....#",
      "..###...###..",
      ".............",
      "..###...###..",
      "#....#.#....#",
      "#....#.#....#",
      "#....#.#....#",
      ".............",
      "..###...###.."
    ]
  },
  {
    name: "Glider", category: "Spaceships",
    rows: [".#.", "..#", "###"]
  },
  {
    name: "R-pentomino", category: "Methuselahs",
    rows: [".##", "##.", ".#."]
  },
  {
    name: "Acorn", category: "Methuselahs",
    rows: [".#.....", "...#...", "##.###."]
  }
];

function parsePatternRows(rows) {
  const cells = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#' || row[x] === 'X') cells.push([x, y]);
    }
  });
  return cells;
}

function patternBounds(cells) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of cells) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

let state = {
  cells: new Set(),
  chunks: new Map(),
  birth: new Set([3]),
  survival: new Set([2, 3]),
  generation: 0,
  running: false,
  speed: 10,
  cellSize: 16,
  offsetX: 0,
  offsetY: 0,
  cellColor: localStorage.getItem('cellColor') || '#6ab4ff',
  cellGlow: localStorage.getItem('cellGlow') || 'rgba(106,180,255,0.15)',
  interactionMode: 'paint',
  renderScheduled: false,
  animFrameId: null,
  lastStepTime: 0,
  undoStack: [],
  redoStack: [],
};

let modalBirth = new Set([3]);
let modalSurvival = new Set([2, 3]);

const _neighborCounts = new Map();
const _nextChunks = new Map();

let isPanning = false;
let panStart = null;
let panOffsetStart = null;
let mouseDown = false;
let paintMode = null;
let placementPattern = null;
let selectedPatternDef = null;
let mouseGridX = 0;
let mouseGridY = 0;
let mouseScreenX = 0;
let mouseScreenY = 0;

let gridCacheCanvas = null;
let gridCacheDirty = true;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  gridCacheDirty = true;
  scheduleRender();
}

function scheduleRender() {
  if (!state.renderScheduled) {
    state.renderScheduled = true;
    requestAnimationFrame(() => {
      state.renderScheduled = false;
      render();
    });
  }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function cellKey(x, y) {
  return x + ',' + y;
}

function parseKey(key) {
  const idx = key.indexOf(',');
  return [parseInt(key.slice(0, idx)), parseInt(key.slice(idx + 1))];
}

function toChunk(v) {
  return Math.floor(v / CHUNK_SIZE);
}

function chunkKey(cx, cy) {
  return cx + ',' + cy;
}

function addCell(x, y) {
  const key = cellKey(x, y);
  if (state.cells.has(key)) return;
  state.cells.add(key);
  const ck = chunkKey(toChunk(x), toChunk(y));
  let chunk = state.chunks.get(ck);
  if (!chunk) {
    chunk = new Set();
    state.chunks.set(ck, chunk);
  }
  chunk.add(key);
}

function deleteCell(x, y) {
  const key = cellKey(x, y);
  if (!state.cells.has(key)) return;
  state.cells.delete(key);
  const ck = chunkKey(toChunk(x), toChunk(y));
  const chunk = state.chunks.get(ck);
  if (chunk) {
    chunk.delete(key);
    if (chunk.size === 0) state.chunks.delete(ck);
  }
}

function clearCells() {
  state.cells.clear();
  state.chunks.clear();
}

function rebuildChunks() {
  state.chunks.clear();
  for (const key of state.cells) {
    const [x, y] = parseKey(key);
    const ck = chunkKey(toChunk(x), toChunk(y));
    let chunk = state.chunks.get(ck);
    if (!chunk) {
      chunk = new Set();
      state.chunks.set(ck, chunk);
    }
    chunk.add(key);
  }
}

function screenToCell(sx, sy) {
  return [
    Math.floor((sx - state.offsetX) / state.cellSize),
    Math.floor((sy - state.offsetY) / state.cellSize)
  ];
}

function getNeighbors(x, y) {
  const neighbors = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      neighbors.push([x + dx, y + dy]);
    }
  }
  return neighbors;
}

function countNeighbors(x, y) {
  let count = 0;
  for (const [nx, ny] of getNeighbors(x, y)) {
    if (state.cells.has(cellKey(nx, ny))) count++;
  }
  return count;
}

function saveUndoState() {
  state.undoStack.push(new Set(state.cells));
  if (state.undoStack.length > 50) state.undoStack.shift();
  state.redoStack = [];
  updateUndoButtons();
}

function updateUndoButtons() {
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  if (undoBtn) undoBtn.style.opacity = state.undoStack.length === 0 ? '0.4' : '1';
  if (redoBtn) redoBtn.style.opacity = state.redoStack.length === 0 ? '0.4' : '1';
}

function undo() {
  if (state.undoStack.length === 0) return;
  state.redoStack.push(new Set(state.cells));
  state.cells = state.undoStack.pop();
  rebuildChunks();
  updateUndoButtons();
  render();
}

function redo() {
  if (state.redoStack.length === 0) return;
  state.undoStack.push(new Set(state.cells));
  state.cells = state.redoStack.pop();
  rebuildChunks();
  updateUndoButtons();
  render();
}

function step() {
  const next = new Set();
  _neighborCounts.clear();
  _nextChunks.clear();
  const cells = state.cells;
  const survival = state.survival;
  const birth = state.birth;

  for (const key of cells) {
    const [x, y] = parseKey(key);
    let liveNeighbors = 0;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nk = cellKey(x + dx, y + dy);
        if (cells.has(nk)) {
          liveNeighbors++;
        } else {
          _neighborCounts.set(nk, (_neighborCounts.get(nk) || 0) + 1);
        }
      }
    }

    if (survival.has(liveNeighbors)) {
      next.add(key);
      const ck = chunkKey(toChunk(x), toChunk(y));
      let chunk = _nextChunks.get(ck);
      if (!chunk) { chunk = new Set(); _nextChunks.set(ck, chunk); }
      chunk.add(key);
    }
  }

  for (const [key, count] of _neighborCounts) {
    if (birth.has(count)) {
      next.add(key);
      const [x, y] = parseKey(key);
      const ck = chunkKey(toChunk(x), toChunk(y));
      let chunk = _nextChunks.get(ck);
      if (!chunk) { chunk = new Set(); _nextChunks.set(ck, chunk); }
      chunk.add(key);
    }
  }

  state.cells = next;
  state.chunks = _nextChunks;
  state.generation++;
}

function forEachVisibleCell(callback) {
  const cs = state.cellSize;
  const chunkStartX = toChunk(Math.floor(-state.offsetX / cs));
  const chunkStartY = toChunk(Math.floor(-state.offsetY / cs));
  const chunkEndX = toChunk(Math.ceil((canvas.width - state.offsetX) / cs));
  const chunkEndY = toChunk(Math.ceil((canvas.height - state.offsetY) / cs));
  const chunks = state.chunks;

  for (let cy = chunkStartY; cy <= chunkEndY; cy++) {
    for (let cx = chunkStartX; cx <= chunkEndX; cx++) {
      const chunk = chunks.get(chunkKey(cx, cy));
      if (!chunk) continue;
      for (const key of chunk) {
        const [x, y] = parseKey(key);
        const sx = x * cs + state.offsetX;
        const sy = y * cs + state.offsetY;
        if (sx + cs < 0 || sx > canvas.width || sy + cs < 0 || sy > canvas.height) continue;
        callback(sx, sy);
      }
    }
  }
}

function render() {
  if (canvas.width === 0 || canvas.height === 0) return;

  if (!gridCacheCanvas || gridCacheCanvas.width !== canvas.width || gridCacheCanvas.height !== canvas.height) {
    gridCacheCanvas = document.createElement('canvas');
    gridCacheCanvas.width = canvas.width;
    gridCacheCanvas.height = canvas.height;
    gridCacheDirty = true;
  }

  if (gridCacheDirty) {
    const cacheCtx = gridCacheCanvas.getContext('2d');
    cacheCtx.fillStyle = '#0a0a0f';
    cacheCtx.fillRect(0, 0, canvas.width, canvas.height);

    const cs = state.cellSize;
    const startX = Math.floor(-state.offsetX / cs);
    const startY = Math.floor(-state.offsetY / cs);
    const endX = Math.ceil((canvas.width - state.offsetX) / cs);
    const endY = Math.ceil((canvas.height - state.offsetY) / cs);

    if (cs >= 4) {
      cacheCtx.strokeStyle = 'rgba(255,255,255,0.03)';
      cacheCtx.lineWidth = 0.5;
      cacheCtx.beginPath();
      for (let x = startX; x <= endX; x++) {
        const sx = x * cs + state.offsetX;
        cacheCtx.moveTo(sx, 0);
        cacheCtx.lineTo(sx, canvas.height);
      }
      for (let y = startY; y <= endY; y++) {
        const sy = y * cs + state.offsetY;
        cacheCtx.moveTo(0, sy);
        cacheCtx.lineTo(canvas.width, sy);
      }
      cacheCtx.stroke();
    }

    if (cs >= 8) {
      cacheCtx.strokeStyle = 'rgba(255,255,255,0.08)';
      cacheCtx.lineWidth = 1;
      cacheCtx.beginPath();
      const ox = state.offsetX;
      const oy = state.offsetY;
      if (ox >= 0 && ox <= canvas.width) {
        cacheCtx.moveTo(ox, 0);
        cacheCtx.lineTo(ox, canvas.height);
      }
      if (oy >= 0 && oy <= canvas.height) {
        cacheCtx.moveTo(0, oy);
        cacheCtx.lineTo(canvas.width, oy);
      }
      cacheCtx.stroke();
    }

    gridCacheDirty = false;
  }

  ctx.drawImage(gridCacheCanvas, 0, 0);

  const cs = state.cellSize;
  const showGlow = cs >= 6;
  const cellColor = state.cellColor;
  const cellGlow = state.cellGlow;

  forEachVisibleCell((sx, sy) => {
    if (showGlow) {
      ctx.fillStyle = cellGlow;
      ctx.fillRect(sx - 1, sy - 1, cs + 2, cs + 2);
    }
    ctx.fillStyle = cellColor;
    ctx.fillRect(sx + 0.5, sy + 0.5, cs - 1, cs - 1);
  });

  if (placementPattern) {
    const cells = placementPattern.cells;
    const bounds = placementPattern.bounds;
    const ox = mouseGridX - Math.floor(bounds.w / 2);
    const oy = mouseGridY - Math.floor(bounds.h / 2);

    ctx.globalAlpha = 0.35;
    ctx.fillStyle = cellColor;
    for (const [px, py] of cells) {
      const sx = (px + ox) * cs + state.offsetX;
      const sy = (py + oy) * cs + state.offsetY;
      ctx.fillRect(sx + 0.5, sy + 0.5, cs - 1, cs - 1);
    }
    ctx.globalAlpha = 1.0;

    const bx = (ox) * cs + state.offsetX;
    const by = (oy) * cs + state.offsetY;
    ctx.strokeStyle = 'rgba(138,200,255,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(bx, by, bounds.w * cs, bounds.h * cs);
    ctx.setLineDash([]);
  }

  updateInfo();
}

function updateInfo() {
  document.getElementById('info-gen').textContent = state.generation;
  document.getElementById('info-pop').textContent = state.cells.size;
  document.getElementById('info-rule').textContent = ruleString();
  document.getElementById('info-zoom').textContent = Math.round(state.cellSize / 16 * 100) + '%';

  const pi = document.getElementById('placement-info');
  if (placementPattern) {
    pi.classList.add('visible');
    const isTouchDevice = 'ontouchstart' in window;
    const instruction = isTouchDevice
      ? `Placing: ${placementPattern.name} — Tap to stamp, tap button to deselect`
      : `Placing: ${placementPattern.name} — Click to stamp, ESC or click button to deselect`;
    pi.textContent = instruction;
  } else {
    pi.classList.remove('visible');
  }
}

function ruleString() {
  const b = [...state.birth].sort().join('');
  const s = [...state.survival].sort().join('');
  return `B${b}/S${s}`;
}

function parseRule(str) {
  const match = str.match(/B([0-8]*)\/S([0-8]*)/i);
  if (!match) return null;
  return {
    birth: new Set([...match[1]].map(Number)),
    survival: new Set([...match[2]].map(Number))
  };
}

function updatePlayButton() {
  const btn = document.getElementById('btn-play');
  if (state.running) {
    btn.innerHTML = '&#9646;&#9646; Pause';
    btn.classList.add('active');
  } else {
    btn.innerHTML = '&#9654; Play';
    btn.classList.remove('active');
  }
}

function loop(timestamp) {
  if (!state.running) {
    state.animFrameId = null;
    return;
  }
  state.animFrameId = requestAnimationFrame(loop);
  const interval = 1000 / state.speed;
  if (timestamp - state.lastStepTime >= interval) {
    step();
    render();
    state.lastStepTime = timestamp;
  }
}

function startLoop() {
  if (state.animFrameId !== null) return;
  state.lastStepTime = performance.now();
  state.animFrameId = requestAnimationFrame(loop);
}

function stopLoop() {
  if (state.animFrameId !== null) {
    cancelAnimationFrame(state.animFrameId);
    state.animFrameId = null;
  }
}

function enterPlacementMode(patternDef) {
  if (selectedPatternDef && selectedPatternDef.name === patternDef.name) {
    exitPlacementMode();
    return;
  }

  const cells = parsePatternRows(patternDef.rows);
  if (cells.length === 0) return;
  const bounds = patternBounds(cells);
  const normalized = cells.map(([x, y]) => [x - bounds.minX, y - bounds.minY]);
  selectedPatternDef = patternDef;
  placementPattern = {
    name: patternDef.name,
    cells: normalized,
    bounds: { w: bounds.w, h: bounds.h }
  };
  canvas.classList.add('placing');
  canvas.style.cursor = 'copy';
  closePatternsDropdown();
  updatePatternsButton();
  haptic(20);
  render();
}

function exitPlacementMode() {
  placementPattern = null;
  selectedPatternDef = null;
  canvas.classList.remove('placing');
  if (state.interactionMode === 'pan') {
    canvas.style.cursor = 'grab';
  } else {
    canvas.style.cursor = 'crosshair';
  }
  updatePatternsButton();
  render();
}

function placePatternAtMouse() {
  if (!placementPattern) return;
  const cells = placementPattern.cells;
  const bounds = placementPattern.bounds;
  const ox = mouseGridX - Math.floor(bounds.w / 2);
  const oy = mouseGridY - Math.floor(bounds.h / 2);
  for (const [px, py] of cells) {
    addCell(px + ox, py + oy);
  }
  render();
}

function updatePatternsButton() {
  const btn = document.getElementById('btn-patterns');
  if (selectedPatternDef) {
    btn.innerHTML = `&#9638; ${selectedPatternDef.name} <span class="pattern-deselect">✕</span>`;
    btn.classList.add('active');
  } else {
    btn.innerHTML = '&#9638; Patterns';
    btn.classList.remove('active');
  }
}

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 1) {
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    panOffsetStart = { x: state.offsetX, y: state.offsetY };
    canvas.style.cursor = 'grabbing';
    return;
  }

  if (e.button === 0) {
    if (placementPattern) {
      saveUndoState();
      placePatternAtMouse();
      return;
    }

    if (state.interactionMode === 'pan') {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      panOffsetStart = { x: state.offsetX, y: state.offsetY };
      canvas.style.cursor = 'grabbing';
      return;
    }

    mouseDown = true;
    const [cx, cy] = screenToCell(e.clientX, e.clientY);
    saveUndoState();
    if (state.cells.has(cellKey(cx, cy))) {
      paintMode = 'erase';
      deleteCell(cx, cy);
    } else {
      paintMode = 'paint';
      addCell(cx, cy);
    }
    scheduleRender();
  }

  if (e.button === 2 && placementPattern) {
    exitPlacementMode();
  }
});

canvas.addEventListener('mousemove', (e) => {
  mouseScreenX = e.clientX;
  mouseScreenY = e.clientY;
  const [gx, gy] = screenToCell(e.clientX, e.clientY);
  mouseGridX = gx;
  mouseGridY = gy;

  if (isPanning) {
    state.offsetX = panOffsetStart.x + (e.clientX - panStart.x);
    state.offsetY = panOffsetStart.y + (e.clientY - panStart.y);
    gridCacheDirty = true;
    scheduleRender();
    return;
  }

  if (placementPattern) {
    scheduleRender();
    return;
  }

  if (state.interactionMode === 'pan') return;

  if (mouseDown) {
    if (paintMode === 'paint') addCell(gx, gy);
    else deleteCell(gx, gy);
    scheduleRender();
  }
});

canvas.addEventListener('mouseup', () => {
  isPanning = false;
  mouseDown = false;
  paintMode = null;
  if (placementPattern) {
    canvas.style.cursor = 'copy';
  } else if (state.interactionMode === 'pan') {
    canvas.style.cursor = 'grab';
  } else {
    canvas.style.cursor = 'crosshair';
  }
});

canvas.addEventListener('mouseleave', () => {
  isPanning = false;
  mouseDown = false;
  paintMode = null;
  if (placementPattern) {
    canvas.style.cursor = 'copy';
  } else if (state.interactionMode === 'pan') {
    canvas.style.cursor = 'grab';
  } else {
    canvas.style.cursor = 'crosshair';
  }
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (placementPattern) exitPlacementMode();
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  const mx = e.clientX;
  const my = e.clientY;
  const newCellSize = Math.max(2, Math.min(80, state.cellSize * zoomFactor));
  const ratio = newCellSize / state.cellSize;
  state.offsetX = mx - (mx - state.offsetX) * ratio;
  state.offsetY = my - (my - state.offsetY) * ratio;
  state.cellSize = newCellSize;
  gridCacheDirty = true;
  scheduleRender();
}, { passive: false });

function haptic(duration = 10) {
  if (navigator.vibrate) {
    navigator.vibrate(duration);
  }
}

let touchStartDistance = 0;
let touchStartCellSize = 0;
let touchStartMidpoint = { x: 0, y: 0 };
let touchStartOffset = { x: 0, y: 0 };
let isTouchPanning = false;
let isTouchPainting = false;
let touchPaintMode = null;
let longPressTimer = null;

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();

  if (e.touches.length === 2) {
    isTouchPanning = true;
    isTouchPainting = false;
    clearTimeout(longPressTimer);

    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    touchStartDistance = Math.sqrt(dx * dx + dy * dy);
    touchStartCellSize = state.cellSize;
    touchStartMidpoint = {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    };
    touchStartOffset = { x: state.offsetX, y: state.offsetY };
    haptic(5);
  } else if (e.touches.length === 1) {
    const touch = e.touches[0];
    mouseScreenX = touch.clientX;
    mouseScreenY = touch.clientY;
    const [gx, gy] = screenToCell(touch.clientX, touch.clientY);
    mouseGridX = gx;
    mouseGridY = gy;

    if (placementPattern) {
      saveUndoState();
      placePatternAtMouse();
      haptic(20);
      return;
    }

    if (state.interactionMode === 'paint') {
      longPressTimer = setTimeout(() => {
        isTouchPanning = true;
        touchStartMidpoint = { x: touch.clientX, y: touch.clientY };
        touchStartOffset = { x: state.offsetX, y: state.offsetY };
        haptic(10);
      }, 500);

      isTouchPainting = true;
      saveUndoState();
      if (state.cells.has(cellKey(gx, gy))) {
        touchPaintMode = 'erase';
        deleteCell(gx, gy);
      } else {
        touchPaintMode = 'paint';
        addCell(gx, gy);
      }
      haptic(5);
      scheduleRender();
    } else {
      isTouchPanning = true;
      touchStartMidpoint = { x: touch.clientX, y: touch.clientY };
      touchStartOffset = { x: state.offsetX, y: state.offsetY };
    }
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  clearTimeout(longPressTimer);

  if (e.touches.length === 2 && isTouchPanning) {
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    const currentDistance = Math.sqrt(dx * dx + dy * dy);
    const currentMidpoint = {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    };

    const scale = currentDistance / touchStartDistance;
    const newCellSize = Math.max(2, Math.min(80, touchStartCellSize * scale));
    const ratio = newCellSize / touchStartCellSize;

    const panDx = currentMidpoint.x - touchStartMidpoint.x;
    const panDy = currentMidpoint.y - touchStartMidpoint.y;

    state.offsetX = touchStartMidpoint.x - (touchStartMidpoint.x - touchStartOffset.x) * ratio + panDx;
    state.offsetY = touchStartMidpoint.y - (touchStartMidpoint.y - touchStartOffset.y) * ratio + panDy;
    state.cellSize = newCellSize;
    gridCacheDirty = true;
    scheduleRender();
  } else if (e.touches.length === 1) {
    const touch = e.touches[0];
    mouseScreenX = touch.clientX;
    mouseScreenY = touch.clientY;
    const [gx, gy] = screenToCell(touch.clientX, touch.clientY);
    mouseGridX = gx;
    mouseGridY = gy;

    if (isTouchPanning) {
      const panDx = touch.clientX - touchStartMidpoint.x;
      const panDy = touch.clientY - touchStartMidpoint.y;
      state.offsetX = touchStartOffset.x + panDx;
      state.offsetY = touchStartOffset.y + panDy;
      gridCacheDirty = true;
      scheduleRender();
    } else if (isTouchPainting && state.interactionMode === 'paint') {
      if (touchPaintMode === 'paint') addCell(gx, gy);
      else deleteCell(gx, gy);
      scheduleRender();
    }

    if (placementPattern) {
      scheduleRender();
    }
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  clearTimeout(longPressTimer);

  if (e.touches.length === 0) {
    isTouchPanning = false;
    isTouchPainting = false;
    touchPaintMode = null;
  } else if (e.touches.length === 1) {
    const touch = e.touches[0];
    isTouchPanning = true;
    touchStartMidpoint = { x: touch.clientX, y: touch.clientY };
    touchStartOffset = { x: state.offsetX, y: state.offsetY };
  }
}, { passive: false });

document.getElementById('btn-play').addEventListener('click', togglePlay);
document.getElementById('btn-step').addEventListener('click', () => { saveUndoState(); step(); render(); });
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);
document.getElementById('btn-clear').addEventListener('click', () => {
  saveUndoState();
  clearCells();
  state.generation = 0;
  render();
});
document.getElementById('btn-random').addEventListener('click', () => {
  saveUndoState();
  clearCells();
  state.generation = 0;
  const [sx, sy] = screenToCell(0, 0);
  const [ex, ey] = screenToCell(canvas.width, canvas.height);
  for (let x = sx; x <= ex; x++) {
    for (let y = sy; y <= ey; y++) {
      if (Math.random() < 0.3) addCell(x, y);
    }
  }
  render();
});
document.getElementById('btn-rules').addEventListener('click', openModal);
document.getElementById('btn-patterns').addEventListener('click', (e) => {
  if (selectedPatternDef) {
    exitPlacementMode();
  } else {
    togglePatternsDropdown();
  }
});
document.getElementById('btn-mode').addEventListener('click', toggleInteractionMode);
document.getElementById('btn-reset-view').addEventListener('click', () => {
  state.cellSize = 16;
  state.offsetX = canvas.width / 2;
  state.offsetY = canvas.height / 2;
  gridCacheDirty = true;
  render();
});

document.getElementById('speed-slider').addEventListener('input', (e) => {
  state.speed = parseInt(e.target.value);
});

function togglePlay() {
  state.running = !state.running;
  if (state.running) {
    startLoop();
  } else {
    stopLoop();
  }
  updatePlayButton();
  haptic(10);
}

function toggleInteractionMode() {
  state.interactionMode = state.interactionMode === 'paint' ? 'pan' : 'paint';
  const btn = document.getElementById('btn-mode');
  if (state.interactionMode === 'pan') {
    btn.innerHTML = '&#9995; Pan';
    btn.classList.add('active');
    canvas.style.cursor = 'grab';
  } else {
    btn.innerHTML = '&#9998; Paint';
    btn.classList.remove('active');
    canvas.style.cursor = placementPattern ? 'copy' : 'crosshair';
  }
  haptic(15);
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (placementPattern) { exitPlacementMode(); return; }
    if (document.getElementById('modal-overlay').classList.contains('open')) { closeModal(); return; }
    const patternsDd = document.getElementById('patterns-dropdown');
    if (patternsDd.classList.contains('open')) { closePatternsDropdown(); return; }
    const colorDd = document.getElementById('color-dropdown');
    if (colorDd.classList.contains('open')) { closeColorDropdown(); return; }
    if (document.getElementById('shortcuts-overlay').classList.contains('open')) { closeShortcuts(); return; }
  }

  if (document.getElementById('modal-overlay').classList.contains('open')) return;
  if (document.getElementById('shortcuts-overlay').classList.contains('open')) return;
  if (e.target.tagName === 'INPUT') return;

  switch (e.code) {
    case 'Space': e.preventDefault(); togglePlay(); break;
    case 'Tab': e.preventDefault(); toggleInteractionMode(); break;
    case 'KeyN': saveUndoState(); step(); render(); break;
    case 'KeyC': saveUndoState(); clearCells(); state.generation = 0; render(); break;
    case 'KeyR': document.getElementById('btn-random').click(); break;
    case 'KeyZ': if (e.ctrlKey || e.metaKey) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); } break;
    case 'Slash': if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleShortcuts(); } break;
  }
});

function buildPatternsDropdown() {
  const container = document.getElementById('patterns-dropdown');
  container.innerHTML = '';

  const categories = {};
  PATTERNS.forEach(p => {
    if (!categories[p.category]) categories[p.category] = [];
    categories[p.category].push(p);
  });

  for (const [cat, patterns] of Object.entries(categories)) {
    const section = document.createElement('div');
    section.className = 'patterns-category';
    section.innerHTML = `<h3>${cat}</h3>`;
    patterns.forEach(p => {
      const btn = document.createElement('button');
      btn.textContent = p.name;
      btn.dataset.patternName = p.name;
      btn.addEventListener('click', () => enterPlacementMode(p));
      section.appendChild(btn);
    });
    container.appendChild(section);
  }
  updatePatternsDropdownHighlight();
}

function updatePatternsDropdownHighlight() {
  const buttons = document.querySelectorAll('#patterns-dropdown button');
  buttons.forEach(btn => {
    if (selectedPatternDef && btn.dataset.patternName === selectedPatternDef.name) {
      btn.style.background = 'rgba(100, 180, 255, 0.2)';
      btn.style.borderColor = 'rgba(100, 180, 255, 0.4)';
    } else {
      btn.style.background = '';
      btn.style.borderColor = '';
    }
  });
}

function togglePatternsDropdown() {
  const dd = document.getElementById('patterns-dropdown');
  const btn = document.getElementById('btn-patterns');
  if (dd.classList.contains('open')) {
    closePatternsDropdown();
  } else {
    updatePatternsDropdownHighlight();
    const rect = btn.getBoundingClientRect();
    dd.style.top = (rect.bottom + 8) + 'px';
    dd.style.left = rect.left + 'px';
    dd.classList.add('open');
  }
}

function closePatternsDropdown() {
  const dd = document.getElementById('patterns-dropdown');
  dd.classList.remove('open');
  document.getElementById('btn-patterns').classList.remove('active');
}

document.addEventListener('click', (e) => {
  const dd = document.getElementById('patterns-dropdown');
  const btn = document.getElementById('btn-patterns');
  if (dd.classList.contains('open') && !dd.contains(e.target) && !btn.contains(e.target)) {
    closePatternsDropdown();
  }
});

function openModal() {
  modalBirth = new Set(state.birth);
  modalSurvival = new Set(state.survival);

  const overlay = document.getElementById('modal-overlay');
  overlay.classList.add('open');

  document.getElementById('rule-string').value = ruleString();
  buildVisualGrids();
  buildModalPresets();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function buildVisualGrids() {
  const birthContainer = document.getElementById('birth-visuals');
  const survivalContainer = document.getElementById('survival-visuals');
  birthContainer.innerHTML = '';
  survivalContainer.innerHTML = '';

  const neighborPositions = [
    [0, 0], [1, 0], [2, 0],
    [0, 1],         [2, 1],
    [0, 2], [1, 2], [2, 2]
  ];

  for (let n = 0; n <= 8; n++) {
    const isBirth = modalBirth.has(n);
    const isSurvival = modalSurvival.has(n);

    const birthItem = buildVisualItem(n, 'birth', isBirth, neighborPositions);
    birthContainer.appendChild(birthItem);

    const survivalItem = buildVisualItem(n, 'survival', isSurvival, neighborPositions);
    survivalContainer.appendChild(survivalItem);
  }
}

function buildVisualItem(n, type, isActive, neighborPositions) {
  const item = document.createElement('div');
  item.className = 'visual-item ' + (isActive ? 'active' : 'inactive');
  if (type === 'survival' && isActive) {
    item.classList.add('survival-active');
  }

  const grid = document.createElement('div');
  grid.className = 'visual-grid';

  const selectedNeighbors = neighborPositions.slice(0, n);

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cell = document.createElement('div');
      cell.className = 'visual-cell';

      const isCenter = row === 1 && col === 1;
      const isNeighbor = selectedNeighbors.some(([r, c]) => r === row && c === col);

      if (isCenter) {
        if (type === 'birth') {
          cell.classList.add(isActive ? 'center-birth' : 'center-dead');
        } else {
          cell.classList.add(isActive ? 'center-survive' : 'center-die');
        }
      } else if (isNeighbor) {
        cell.classList.add('neighbor');
      }
      grid.appendChild(cell);
    }
  }

  const label = document.createElement('div');
  label.className = 'visual-label';
  if (isActive) {
    label.classList.add(type === 'birth' ? 'active-label' : 'survive-label');
    if (type === 'birth') {
      label.textContent = `${n} neighbor${n !== 1 ? 's' : ''} → Birth`;
    } else {
      label.textContent = `${n} neighbor${n !== 1 ? 's' : ''} → Survive`;
    }
  } else {
    label.textContent = `${n} neighbor${n !== 1 ? 's' : ''} → Nothing`;
  }

  item.appendChild(grid);
  item.appendChild(label);

  item.addEventListener('click', () => {
    if (type === 'birth') {
      if (modalBirth.has(n)) {
        modalBirth.delete(n);
      } else {
        modalBirth.add(n);
      }
    } else {
      if (modalSurvival.has(n)) {
        modalSurvival.delete(n);
      } else {
        modalSurvival.add(n);
      }
    }
    const bStr = [...modalBirth].sort().join('');
    const sStr = [...modalSurvival].sort().join('');
    document.getElementById('rule-string').value = `B${bStr}/S${sStr}`;
    buildVisualGrids();
  });

  return item;
}

function buildModalPresets() {
  const container = document.getElementById('presets');
  container.innerHTML = '';
  PRESETS.forEach(p => {
    const btn = document.createElement('button');
    btn.innerHTML = `${p.name}<span class="preset-rule">${p.rule}</span>`;
    btn.addEventListener('click', () => {
      const parsed = parseRule(p.rule);
      if (parsed) {
        modalBirth = parsed.birth;
        modalSurvival = parsed.survival;
        document.getElementById('rule-string').value = p.rule;
        buildVisualGrids();
      }
    });
    container.appendChild(btn);
  });
}

function generateColorName(hue, saturation, lightness) {
  const hueNames = [
    'Ember', 'Dawn', 'Petal', 'Meadow', 'Fern', 'Mist',
    'Stream', 'Dusk', 'Bloom', 'Stone', 'Moss', 'Sky'
  ];
  const adjNames = [
    'Silent', 'Gentle', 'Pale', 'Deep', 'Wild', 'Soft',
    'Quiet', 'Still', 'Warm', 'Cool', 'Faded', 'Bright'
  ];

  const hueIndex = Math.floor(((hue + 15) % 360) / 30);
  const adjIndex = Math.floor((saturation / 65) * 3 + (lightness - 40) / 20 * 3);

  const hueName = hueNames[hueIndex % hueNames.length];
  const adjName = adjNames[Math.min(11, Math.max(0, adjIndex))];

  return `${adjName} ${hueName}`;
}

function saveRecentColor(hex) {
  let recent = JSON.parse(localStorage.getItem('recentColors') || '[]');
  recent = recent.filter(c => c !== hex);
  recent.unshift(hex);
  recent = recent.slice(0, 10);
  localStorage.setItem('recentColors', JSON.stringify(recent));
}

function getRecentColors() {
  return JSON.parse(localStorage.getItem('recentColors') || '[]');
}

function renderRecentColorPresets(container) {
  let presets = container.querySelector('.color-presets');
  if (!presets) {
    presets = document.createElement('div');
    presets.className = 'color-presets';
    container.appendChild(presets);
  }
  presets.innerHTML = '';
  getRecentColors().forEach(hex => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.background = hex;
    swatch.title = generateColorName(...Object.values(hexToHsl(hex)));
    swatch.addEventListener('click', () => {
      state.cellColor = hex;
      state.cellGlow = hex + '26';
      localStorage.setItem('cellColor', hex);
      localStorage.setItem('cellGlow', hex + '26');
      render();
      updateColorButton(hex);
    });
    presets.appendChild(swatch);
  });
}

function buildColorDropdown() {
  const container = document.getElementById('color-dropdown');
  container.innerHTML = '';

  const wheelContainer = document.createElement('div');
  wheelContainer.className = 'color-wheel-container';

  const colorWheelCanvas = document.createElement('canvas');
  colorWheelCanvas.className = 'color-wheel';
  colorWheelCanvas.width = 200;
  colorWheelCanvas.height = 200;
  const wheelCtx = colorWheelCanvas.getContext('2d');

  const indicator = document.createElement('div');
  indicator.className = 'color-wheel-indicator';

  wheelContainer.appendChild(colorWheelCanvas);
  wheelContainer.appendChild(indicator);

  function drawWheel() {
    const centerX = 100;
    const centerY = 100;
    const radius = 95;

    for (let angle = 0; angle < 360; angle++) {
      const startAngle = (angle - 1) * Math.PI / 180;
      const endAngle = (angle + 1) * Math.PI / 180;

      wheelCtx.beginPath();
      wheelCtx.moveTo(centerX, centerY);
      wheelCtx.arc(centerX, centerY, radius, startAngle, endAngle);
      wheelCtx.closePath();

      const gradient = wheelCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
      gradient.addColorStop(0, `hsl(${angle}, 0%, 70%)`);
      gradient.addColorStop(1, `hsl(${angle}, 65%, 50%)`);
      wheelCtx.fillStyle = gradient;
      wheelCtx.fill();
    }
  }

  function getColorFromPosition(x, y) {
    const centerX = 100;
    const centerY = 100;
    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const hue = (angle + 360) % 360;
    const saturation = Math.min(65, (distance / 95) * 65);
    const lightness = 40 + (distance / 95) * 20;
    return { hue, saturation, lightness };
  }

  function updateIndicator(x, y) {
    indicator.style.left = x + 'px';
    indicator.style.top = y + 'px';
  }

  function hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  drawWheel();

  const hsl = hexToHsl(state.cellColor);
  const angle = hsl.h * Math.PI / 180;
  const distance = ((hsl.l - 40) / 20) * 95;
  const initialX = 100 + Math.cos(angle) * distance;
  const initialY = 100 + Math.sin(angle) * distance;
  updateIndicator(initialX, initialY);

  let isDragging = false;
  let pendingDragHex = null;

  function previewDragColor(hex) {
    pendingDragHex = hex;
    state.cellColor = hex;
    state.cellGlow = hex + '26';
    render();
    updateColorButton(hex);
  }

  function persistDragColor() {
    if (!pendingDragHex) return;
    localStorage.setItem('cellColor', pendingDragHex);
    localStorage.setItem('cellGlow', pendingDragHex + '26');
    saveRecentColor(pendingDragHex);
    renderRecentColorPresets(container);
    pendingDragHex = null;
  }

  colorWheelCanvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = colorWheelCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    updateIndicator(x, y);

    const color = getColorFromPosition(x, y);
    const hex = hslToHex(color.hue, color.saturation, color.lightness);
    previewDragColor(hex);
  });

  colorWheelCanvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const rect = colorWheelCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    updateIndicator(x, y);

    const color = getColorFromPosition(x, y);
    const hex = hslToHex(color.hue, color.saturation, color.lightness);
    previewDragColor(hex);
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) persistDragColor();
    isDragging = false;
  });

  container.appendChild(wheelContainer);
  renderRecentColorPresets(container);
}

function toggleColorDropdown() {
  const dd = document.getElementById('color-dropdown');
  const btn = document.getElementById('btn-color');
  if (dd.classList.contains('open')) {
    closeColorDropdown();
  } else {
    closePatternsDropdown();
    buildColorDropdown();
    const rect = btn.getBoundingClientRect();
    dd.style.top = (rect.bottom + 8) + 'px';
    dd.style.left = rect.left + 'px';
    dd.classList.add('open');
    btn.classList.add('active');
  }
}

function closeColorDropdown() {
  const dd = document.getElementById('color-dropdown');
  dd.classList.remove('open');
  document.getElementById('btn-color').classList.remove('active');
}

function updateColorButton(hex) {
  const btn = document.getElementById('btn-color');
  const color = hexToHsl(hex);
  const name = generateColorName(color.h, color.s, color.l);
  btn.innerHTML = `&#9679; <span class="color-label">${name}</span>`;
  btn.querySelector('.color-label').style.color = hex;
}

function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;

  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

document.getElementById('btn-color').addEventListener('click', toggleColorDropdown);

document.addEventListener('click', (e) => {
  const dd = document.getElementById('color-dropdown');
  const btn = document.getElementById('btn-color');
  if (dd.classList.contains('open') && !dd.contains(e.target) && !btn.contains(e.target)) {
    closeColorDropdown();
  }
});

document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);

document.getElementById('btn-modal-apply').addEventListener('click', () => {
  const input = document.getElementById('rule-string').value.trim();
  const parsed = parseRule(input);
  if (parsed) {
    state.birth = parsed.birth;
    state.survival = parsed.survival;
  }
  closeModal();
  render();
});

document.getElementById('rule-string').addEventListener('input', () => {
  const val = document.getElementById('rule-string').value.trim();
  const parsed = parseRule(val);
  if (parsed) {
    modalBirth = parsed.birth;
    modalSurvival = parsed.survival;
    buildVisualGrids();
  }
});

document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

function toggleShortcuts() {
  const overlay = document.getElementById('shortcuts-overlay');
  overlay.classList.toggle('open');
}

function closeShortcuts() {
  document.getElementById('shortcuts-overlay').classList.remove('open');
}

document.getElementById('shortcuts-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeShortcuts();
});
document.getElementById('btn-shortcuts').addEventListener('click', toggleShortcuts);
document.getElementById('btn-close-shortcuts').addEventListener('click', closeShortcuts);

buildPatternsDropdown();

if (getRecentColors().length === 0) {
  const defaultColors = ['#6ab4ff', '#6aff8a', '#ffc46a', '#ff6acc', '#c46aff'];
  defaultColors.forEach(c => saveRecentColor(c));
}

updateColorButton(state.cellColor);

state.offsetX = canvas.width / 2;
state.offsetY = canvas.height / 2;
render();
