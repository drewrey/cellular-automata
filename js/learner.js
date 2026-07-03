function parseKey(key) {
  const i = key.indexOf(',');
  return [parseInt(key.slice(0, i)), parseInt(key.slice(i + 1))];
}

function cellKey(x, y) { return x + ',' + y; }

function generateSoup(w, h, density) {
  const cells = new Set();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (Math.random() < density) cells.add(cellKey(x, y));
    }
  }
  return cells;
}

function fastStep(cells, birth, survival) {
  const next = new Set();
  const counts = new Map();

  for (const key of cells) {
    const [x, y] = parseKey(key);
    let live = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nk = cellKey(x + dx, y + dy);
        if (cells.has(nk)) {
          live++;
        } else {
          counts.set(nk, (counts.get(nk) || 0) + 1);
        }
      }
    }
    if (survival.has(live)) next.add(key);
  }

  for (const [key, count] of counts) {
    if (birth.has(count)) next.add(key);
  }

  return next;
}

function extractComponents(cells) {
  const visited = new Set();
  const components = [];

  for (const key of cells) {
    if (visited.has(key)) continue;
    const comp = new Set();
    const queue = [key];
    visited.add(key);
    while (queue.length) {
      const cur = queue.shift();
      comp.add(cur);
      const [x, y] = parseKey(cur);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nk = cellKey(x + dx, y + dy);
          if (cells.has(nk) && !visited.has(nk)) {
            visited.add(nk);
            queue.push(nk);
          }
        }
      }
    }
    components.push(comp);
  }

  return components;
}

function componentToCells(comp) {
  const result = [];
  for (const key of comp) result.push(parseKey(key));
  return result;
}

function canonicalHash(arr) {
  const orientations = [];

  for (let flip = 0; flip < 2; flip++) {
    for (let rot = 0; rot < 4; rot++) {
      let pts = arr.map(([x, y]) => {
        let nx = flip ? -x : x, ny = y;
        for (let r = 0; r < rot; r++) { const t = nx; nx = -ny; ny = t; }
        return [nx, ny];
      });
      const minX = Math.min(...pts.map(p => p[0]));
      const minY = Math.min(...pts.map(p => p[1]));
      pts = pts.map(([x, y]) => [x - minX, y - minY]);
      pts.sort((a, b) => a[1] === b[1] ? a[0] - b[0] : a[1] - b[1]);
      orientations.push(pts);
    }
  }

  orientations.sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i][0] !== b[i][0]) return a[i][0] - b[i][0];
      if (a[i][1] !== b[i][1]) return a[i][1] - b[i][1];
    }
    return a.length - b.length;
  });

  return orientations[0].map(p => p[0] + ',' + p[1]).join(';');
}

let running = false;
let birthSet = null;
let survivalSet = null;
const SOUP_W = 50;
const SOUP_H = 50;
const MAX_GENS = 2000;
const STABLE_CUTOFF = 20;

self.onmessage = function (e) {
  const msg = e.data;
  if (msg.type === 'start') {
    birthSet = new Set(msg.birth);
    survivalSet = new Set(msg.survival);
    if (!running) { running = true; runLoop(); }
  } else if (msg.type === 'stop') {
    running = false;
  }
};

function runLoop() {
  if (!running) return;

  const seed = generateSoup(SOUP_W, SOUP_H, 0.5);
  let current = seed;
  let stable = 0;
  let prevPop = current.size;

  for (let gen = 0; gen < MAX_GENS; gen++) {
    current = fastStep(current, birthSet, survivalSet);
    const pop = current.size;
    if (pop === 0) break;
    if (pop === prevPop) { stable++; if (stable >= STABLE_CUTOFF) break; }
    else { stable = 0; }
    prevPop = pop;
  }

  if (current.size > 0) {
    const components = extractComponents(current);
    for (const comp of components) {
      if (comp.size > 0 && comp.size <= 150) {
        const ca = componentToCells(comp);
        const hash = canonicalHash(ca);
        self.postMessage({ type: 'discovery', hash, cells: ca, pop: comp.size });
      }
    }
  }

  setTimeout(runLoop, 0);
}
