const SHIPS = [
  ["Carrier", 5],
  ["Battleship", 4],
  ["Cruiser", 3],
  ["Submarine", 3],
  ["Destroyer", 2],
];
const SIZE = 10;

let gameId = null;
let state = null;
let selectedShip = null;
let horizontal = true;
let busy = false;

const $ = (id) => document.getElementById(id);

async function api(path, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) {
    $("status").textContent = data.error || "Error";
    throw new Error(data.error || res.statusText);
  }
  return data;
}

async function newGame() {
  const difficulty = $("difficulty").value;
  const data = await api("/api/games", "POST", { difficulty });
  gameId = data.id;
  state = data.state;
  selectedShip = SHIPS[0][0];
  horizontal = true;
  render();
}

function render(opts = {}) {
  $("gameover").classList.add("hidden");
  if (state.phase === "placement") {
    $("placement").classList.remove("hidden");
    $("battle").classList.add("hidden");
    $("status").textContent = "Place your ships";
    renderTray();
    renderPlacementBoard();
  } else {
    $("placement").classList.add("hidden");
    $("battle").classList.remove("hidden");
    $("status").textContent =
      state.phase === "over"
        ? "Game over"
        : "Your turn — click the enemy grid to fire";
    renderPlayerBoard();
    renderEnemyBoard();
    renderFleet();
    renderLog();
    if (state.phase === "over" && !opts.deferGameOver) {
      showGameOver();
    }
  }
}

function showGameOver() {
  $("gameover").classList.remove("hidden");
  $("gameover-text").textContent =
    state.winner === "player"
      ? "Victory! You sank the enemy fleet."
      : "Defeat — your fleet was destroyed.";
}

function makeBoard(el) {
  el.innerHTML = "";
  const cells = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const d = document.createElement("div");
      d.className = "cell";
      d.dataset.row = r;
      d.dataset.col = c;
      el.appendChild(d);
      cells.push(d);
    }
  }
  const layer = document.createElement("div");
  layer.className = "ship-layer";
  el.appendChild(layer);
  return cells;
}

function cellAt(el, r, c) {
  return el.children[r * SIZE + c];
}

let fleetStyle = localStorage.getItem("battleship.fleet") || "military";

function shipCellsSet(ships) {
  const map = {};
  for (const s of ships) {
    for (const [r, c] of s.cells) map[`${r},${c}`] = s;
  }
  return map;
}

function shotsMap(shots) {
  const map = {};
  for (const [r, c, res] of shots) map[`${r},${c}`] = res;
  return map;
}

/* ---------- ship sprites ---------- */

function milShipSVG(name, size, W) {
  const p = [];
  p.push(
    `<path d="M14 6 Q3 6 3 17 Q3 28 14 28 L${W - 24} 28 L${W - 1} 17 L${W - 24} 6 Z" fill="#5b6770" stroke="#3b444b"/>`
  );
  p.push(`<path d="M5 26.5 L${W - 26} 26.5" stroke="#b23a3a" stroke-width="1.5"/>`);
  p.push(`<path d="M4 12 Q7 17 4 22" stroke="rgba(255,255,255,.5)" fill="none"/>`);
  for (let i = 0; i < 3; i++)
    p.push(`<circle cx="${16 + i * 14}" cy="24" r="1.4" fill="#aab3b9"/>`);
  const turret = (x, dir) =>
    `<circle cx="${x}" cy="17" r="4.2" fill="#3b444b"/><rect x="${dir > 0 ? x + 1 : x - 9}" y="15.8" width="8" height="2.4" fill="#3b444b"/>`;
  const deck = () =>
    p.push(
      `<path d="M16 9 L${W - 30} 9 L${W - 8} 17 L${W - 30} 25 L16 25 Q7 25 7 17 Q7 9 16 9 Z" fill="#8a949b"/>`
    );
  if (name === "Submarine") {
    p.push(
      `<path d="M16 9 Q4 9 4 17 Q4 25 16 25 L${W - 16} 25 Q${W - 4} 25 ${W - 4} 17 Q${W - 4} 9 ${W - 16} 9 Z" fill="#3b444b"/>`
    );
    p.push(`<rect x="${W / 2 - 5}" y="12" width="10" height="5" rx="1" fill="#5b6770"/>`);
    p.push(`<line x1="${W / 2 + 3}" y1="12" x2="${W / 2 + 3}" y2="6" stroke="#8a949b" stroke-width="1.5"/>`);
    return p.join("");
  }
  deck();
  if (name === "Carrier") {
    p.push(`<line x1="14" y1="22" x2="${W - 14}" y2="12" stroke="#aab3b9" stroke-width="1.6"/>`);
    p.push(`<rect x="${W * 0.6}" y="8" width="9" height="5" fill="#3b444b"/><rect x="${W * 0.6 + 2}" y="5" width="4" height="3" fill="#3b444b"/>`);
    for (let i = 0; i < 3; i++)
      p.push(`<path d="M${30 + i * 26} ${13 + (i % 2) * 8} l5 2 l-5 2 z" fill="#aab3b9"/>`);
  } else if (name === "Battleship") {
    p.push(turret(W - 38, 1), turret(W - 56, 1), turret(18, -1));
    p.push(`<rect x="${W * 0.45}" y="11" width="12" height="12" fill="#3b444b"/>`);
    p.push(`<line x1="${W * 0.45 + 6}" y1="11" x2="${W * 0.45 + 6}" y2="4" stroke="#3b444b" stroke-width="1.5"/>`);
  } else if (name === "Cruiser") {
    p.push(turret(W - 34, 1), turret(18, -1));
    p.push(`<rect x="${W * 0.48}" y="12" width="10" height="10" fill="#3b444b"/>`);
  } else if (name === "Destroyer") {
    p.push(turret(W - 28, 1));
    p.push(`<rect x="${W * 0.5}" y="12" width="7" height="10" fill="#3b444b"/>`);
    p.push(`<circle cx="${W * 0.35}" cy="17" r="3" fill="#3b444b"/>`);
  }
  return p.join("");
}

function pirateShipSVG(name, size, W) {
  const p = [];
  const narrow = name === "Submarine";
  const t = narrow ? 10 : 6, b = narrow ? 24 : 29;
  p.push(
    `<path d="M18 ${t} Q5 ${t} 4 ${t + 6} Q2 17 6 ${b - 4} Q9 ${b} 18 ${b} L${W - 16} ${b} Q${W - 1} ${b - 5} ${W - 3} 17 Q${W - 5} ${t + 2} ${W - 20} ${t} Z" fill="#7a4a24" stroke="#5c361a"/>`
  );
  p.push(`<line x1="${W - 6}" y1="13" x2="${W + 10}" y2="7" stroke="#3a2412" stroke-width="2"/>`);
  if (!narrow) {
    p.push(`<rect x="7" y="9" width="11" height="10" rx="2" fill="#5c361a"/>`);
    p.push(`<line x1="10" y1="${b - 3}" x2="${W - 18}" y2="${b - 3}" stroke="#5c361a" stroke-width="1"/>`);
    p.push(`<rect x="14" y="12" width="${W - 36}" height="8" rx="4" fill="#c9a26b"/>`);
    for (let i = 0; i < 3; i++)
      p.push(`<rect x="${24 + i * Math.max(12, (W - 60) / 3)}" y="22" width="3" height="3" fill="#2a1708"/>`);
  }
  const masts = narrow ? 1 : Math.ceil(size / 2);
  for (let i = 0; i < masts; i++) {
    const mx = Math.round(W * (masts === 1 ? 0.5 : 0.22 + (0.56 * i) / (masts - 1)));
    p.push(`<line x1="${mx}" y1="4" x2="${mx}" y2="26" stroke="#3a2412" stroke-width="2"/>`);
    if (!narrow) {
      p.push(`<path d="M${mx - 7} 8 Q${mx} 10 ${mx + 7} 8 L${mx + 6} 16 Q${mx} 18 ${mx - 6} 16 Z" fill="#f3ead8" stroke="#c9a26b"/>`);
      p.push(`<circle cx="${mx}" cy="6" r="2.2" fill="#3a2412"/>`);
    }
    if (i === masts - 1) {
      p.push(`<path d="M${mx} 3 L${mx + 10} 6 L${mx} 9 Z" fill="#111"/>`);
      p.push(`<circle cx="${mx + 4}" cy="5.7" r="1.6" fill="#f3ead8"/><circle cx="${mx + 3.4}" cy="5.3" r="0.4" fill="#111"/><circle cx="${mx + 4.7}" cy="5.3" r="0.4" fill="#111"/>`);
    }
  }
  return p.join("");
}

function shipSVG(style, name, size, W) {
  return style === "pirate" ? pirateShipSVG(name, size, W) : milShipSVG(name, size, W);
}

function renderShips(boardEl, ships) {
  const layer = boardEl.querySelector(".ship-layer");
  if (!layer) return;
  layer.innerHTML = "";
  for (const s of ships || []) {
    const rows = s.cells.map((c) => c[0]);
    const cols = s.cells.map((c) => c[1]);
    const r = Math.min(...rows);
    const c = Math.min(...cols);
    const horizontal = rows.every((x) => x === r);
    const W = s.size * 36 - 2;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", `ship-sprite ${fleetStyle}${s.sunk ? " sunk" : ""}`);
    svg.setAttribute("width", W);
    svg.setAttribute("height", 34);
    svg.setAttribute("viewBox", `0 0 ${W} 34`);
    svg.style.left = c * 36 + "px";
    svg.style.top = r * 36 + "px";
    if (!horizontal)
      svg.style.transform = s.sunk ? "rotate(90deg) rotate(4deg)" : "rotate(90deg)";
    else if (s.sunk) svg.style.transform = "rotate(4deg)";
    svg.style.transformOrigin = "17px 17px";
    svg.innerHTML = shipSVG(fleetStyle, s.name, s.size, W);
    layer.appendChild(svg);
  }
}

function addFire(cell, sunk) {
  const f = document.createElement("div");
  f.className = "fire" + (sunk ? " sunk" : "");
  f.innerHTML =
    "<i></i><i></i><i></i><span class='smoke'></span>" +
    (sunk ? "<span class='smoke s2'></span>" : "");
  cell.appendChild(f);
}

function renderTray() {
  const tray = $("tray");
  tray.innerHTML = "";
  const placed = new Set(state.player.ships.map((s) => s.name));
  for (const [name, size] of SHIPS) {
    const div = document.createElement("div");
    div.className = "tray-ship";
    if (name === selectedShip) div.classList.add("selected");
    if (placed.has(name)) div.classList.add("placed");
    const label = document.createElement("span");
    label.textContent = `${name} (${size})`;
    const mini = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const vW = size * 36 - 2;
    mini.setAttribute("class", `ship-sprite ${fleetStyle}`);
    mini.setAttribute("viewBox", `0 0 ${vW} 34`);
    mini.setAttribute("width", size * 18);
    mini.setAttribute("height", 17);
    mini.style.position = "static";
    mini.innerHTML = shipSVG(fleetStyle, name, size, vW);
    div.appendChild(mini);
    div.appendChild(label);
    div.onclick = () => {
      if (!placed.has(name)) {
        selectedShip = name;
        renderTray();
      }
    };
    tray.appendChild(div);
  }
  $("start").disabled = placed.size < SHIPS.length;
  $("rotate").textContent = `Rotate (R) — ${horizontal ? "Horizontal" : "Vertical"}`;
}

function ghostCells() {
  if (!selectedShip) return null;
  return hoverPos ? { size: shipSize(selectedShip), ...hoverPos } : null;
}

function shipSize(name) {
  for (const [n, s] of SHIPS) if (n === name) return s;
  return 0;
}

let hoverPos = null;

function renderPlacementBoard() {
  const el = $("place-board");
  makeBoard(el);
  const ships = shipCellsSet(state.player.ships);
  for (const key in ships) {
    const [r, c] = key.split(",").map(Number);
    cellAt(el, r, c).classList.add("ship");
  }
  renderShips(el, state.player.ships);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const d = cellAt(el, r, c);
      d.addEventListener("mouseenter", () => {
        hoverPos = { row: r, col: c };
        drawGhost();
      });
      d.addEventListener("mouseleave", () => {
        hoverPos = null;
        drawGhost();
      });
      d.addEventListener("click", () => placeShip(r, c));
    }
  }
}

function drawGhost() {
  const el = $("place-board");
  el.querySelectorAll(".ghost-valid,.ghost-invalid").forEach((d) =>
    d.classList.remove("ghost-valid", "ghost-invalid")
  );
  if (!hoverPos || !selectedShip) return;
  if (state.player.ships.some((s) => s.name === selectedShip)) return;
  const size = shipSize(selectedShip);
  const ships = shipCellsSet(state.player.ships);
  const cells = [];
  for (let i = 0; i < size; i++) {
    const r = horizontal ? hoverPos.row : hoverPos.row + i;
    const c = horizontal ? hoverPos.col + i : hoverPos.col;
    cells.push([r, c]);
  }
  const valid = cells.every(
    ([r, c]) => r >= 0 && r < SIZE && c >= 0 && c < SIZE && !ships[`${r},${c}`]
  );
  for (const [r, c] of cells) {
    if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
      cellAt(el, r, c).classList.add(valid ? "ghost-valid" : "ghost-invalid");
    }
  }
}

async function placeShip(row, col) {
  if (!selectedShip) return;
  if (state.player.ships.some((s) => s.name === selectedShip)) return;
  try {
    const data = await api(`/api/games/${gameId}/place`, "POST", {
      name: selectedShip,
      row,
      col,
      horizontal,
    });
    GameAudio.init();
    GameAudio.click();
    state = data.state;
    const unplaced = SHIPS.map(([n]) => n).find(
      (n) => !state.player.ships.some((s) => s.name === n)
    );
    selectedShip = unplaced || null;
    render();
  } catch (e) {}
}

function renderPlayerBoard() {
  const el = $("player-board");
  makeBoard(el);
  const ships = shipCellsSet(state.player.ships);
  const shots = shotsMap(state.player.shots);
  for (const key in ships) {
    const [r, c] = key.split(",").map(Number);
    cellAt(el, r, c).classList.add("ship");
  }
  for (const key in shots) {
    const [r, c] = key.split(",").map(Number);
    const d = cellAt(el, r, c);
    if (shots[key] === "hit") {
      const s = ships[key];
      const sunk = s && s.sunk;
      d.classList.add(sunk ? "sunk" : "hit");
      addFire(d, sunk);
    } else {
      d.classList.add("miss");
    }
  }
  renderShips(el, state.player.ships);
}

function renderEnemyBoard() {
  const el = $("enemy-board");
  makeBoard(el);
  const shots = shotsMap(state.ai.shots);
  const aiShips = state.ai.ships ? shipCellsSet(state.ai.ships) : {};
  const sunkSet = new Set(state.ai.sunk_ships);
  for (const key in shots) {
    const [r, c] = key.split(",").map(Number);
    const d = cellAt(el, r, c);
    if (shots[key] === "hit") {
      const s = aiShips[key];
      const sunk = s && s.sunk;
      d.classList.add(sunk ? "sunk" : "hit");
      addFire(d, sunk);
    } else {
      d.classList.add("miss");
    }
  }
  for (const key in aiShips) {
    const [r, c] = key.split(",").map(Number);
    const s = aiShips[key];
    if (s.sunk) cellAt(el, r, c).classList.add("sunk");
  }
  renderShips(el, state.ai.ships);
  if (state.phase === "playing") {
    el.classList.add("clickable");
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        cellAt(el, r, c).addEventListener("click", () => fire(r, c));
      }
    }
  } else {
    el.classList.remove("clickable");
  }
}

function dropBomb(cell) {
  return new Promise((resolve) => {
    const bomb = document.createElement("div");
    bomb.className = "bomb";
    cell.appendChild(bomb);
    const done = () => resolve(bomb);
    bomb.addEventListener("animationend", done, { once: true });
    setTimeout(done, 600);
  });
}

function impact(boardEl, r, c, result) {
  const cell = cellAt(boardEl, r, c);
  const cls = result === "hit" ? "impact-hit" : "impact-miss";
  cell.classList.add(cls);
  cell.addEventListener("animationend", () => cell.classList.remove(cls), {
    once: true,
  });
}

function sparks(cell, n, colors) {
  for (let i = 0; i < n; i++) {
    const s = document.createElement("i");
    s.className = "spark";
    s.style.setProperty("--dx", (Math.random() * 90 - 45).toFixed(0) + "px");
    s.style.setProperty("--dy", (Math.random() * 90 - 45).toFixed(0) + "px");
    s.style.setProperty(
      "--color",
      colors[Math.floor(Math.random() * colors.length)]
    );
    cell.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }
}

function boom(boardEl, r, c, sunk) {
  const cell = cellAt(boardEl, r, c);
  const b = document.createElement("div");
  b.className = "boom" + (sunk ? " sunk" : "");
  b.innerHTML = '<div class="fireball"></div><div class="shockwave"></div>';
  cell.appendChild(b);
  sparks(cell, sunk ? 16 : 10, ["#ff8c1a", "#ffd54a"]);
  const t = document.createElement("div");
  t.className = "boom-text" + (sunk ? " sunk-text" : "");
  t.textContent = sunk ? "SUNK!" : "BOOM!";
  b.appendChild(t);
  document.body.classList.remove("shake");
  void document.body.offsetWidth;
  document.body.classList.add("shake");
  setTimeout(() => document.body.classList.remove("shake"), 350);
  setTimeout(() => b.remove(), 800);
}

function splashBurst(boardEl, r, c) {
  impact(boardEl, r, c, "miss");
  sparks(cellAt(boardEl, r, c), 5, ["#9adcf5", "#e8f7ff"]);
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function fire(row, col) {
  if (busy || state.phase !== "playing") return;
  if (shotsMap(state.ai.shots)[`${row},${col}`]) return;
  busy = true;
  try {
    const enemyCell = cellAt($("enemy-board"), row, col);
    GameAudio.init();
    GameAudio.bombWhistle(0.5);
    const [data] = await Promise.all([
      api(`/api/games/${gameId}/fire`, "POST", { row, col }),
      dropBomb(enemyCell),
    ]);
    enemyCell.querySelectorAll(".bomb").forEach((b) => b.remove());
    state = data.state;
    render({ deferGameOver: true });

    const ps = data.turn.player_shot;
    if (ps.result === "hit") {
      boom($("enemy-board"), ps.row, ps.col, !!ps.sunk);
      if (ps.sunk) GameAudio.sunk();
      else GameAudio.explosion();
    } else {
      splashBurst($("enemy-board"), ps.row, ps.col);
      GameAudio.splash();
    }

    const as = data.turn.ai_shot;
    if (as) {
      await sleep(350);
      const pCell = cellAt($("player-board"), as.row, as.col);
      const hidden = ["hit", "miss", "sunk"].filter((cl) =>
        pCell.classList.contains(cl)
      );
      pCell.classList.remove("hit", "miss", "sunk");
      const fireEl = pCell.querySelector(".fire");
      if (fireEl) fireEl.remove();
      GameAudio.bombWhistle(0.5);
      const bomb = await dropBomb(pCell);
      bomb.remove();
      pCell.classList.add(...hidden);
      if (as.result === "hit") {
        addFire(pCell, !!as.sunk);
        boom($("player-board"), as.row, as.col, !!as.sunk);
        if (as.sunk) GameAudio.sunk();
        else GameAudio.explosion();
      } else {
        splashBurst($("player-board"), as.row, as.col);
        GameAudio.splash();
      }
    }
  } catch (e) {
  } finally {
    busy = false;
    if (state.phase === "over") {
      if (state.winner === "player") GameAudio.victory();
      else GameAudio.defeat();
      showGameOver();
    }
  }
}

function renderFleet() {
  const ul = $("enemy-fleet");
  ul.innerHTML = "";
  const sunkSet = new Set(state.ai.sunk_ships);
  for (const [name] of SHIPS) {
    const li = document.createElement("li");
    li.textContent = name + (sunkSet.has(name) ? " — sunk" : "");
    if (sunkSet.has(name)) li.classList.add("sunk");
    ul.appendChild(li);
  }
}

function renderLog() {
  const log = $("log");
  log.innerHTML = state.log.map((l) => `<div>${l}</div>`).join("");
  log.scrollTop = log.scrollHeight;
}

const volSlider = $("music-vol");
volSlider.value = GameAudio.getMusicVolume() * 100;
volSlider.addEventListener("input", () => {
  GameAudio.init();
  GameAudio.setMusicVolume(volSlider.value / 100);
});

const fleetSel = $("fleet-style");
fleetSel.value = fleetStyle;
fleetSel.onchange = () => {
  fleetStyle = fleetSel.value;
  localStorage.setItem("battleship.fleet", fleetStyle);
  render();
};

function updateMuteIcon() {
  $("mute").textContent = GameAudio.isMuted() ? "🔇" : "🔊";
}

$("mute").onclick = () => {
  GameAudio.init();
  GameAudio.toggleMute();
  updateMuteIcon();
};

$("new-game").onclick = () => {
  GameAudio.init();
  newGame();
};
$("play-again").onclick = () => {
  GameAudio.init();
  newGame();
};
$("randomize").onclick = async () => {
  GameAudio.init();
  GameAudio.click();
  const data = await api(`/api/games/${gameId}/randomize`, "POST");
  state = data.state;
  selectedShip = null;
  render();
};
$("start").onclick = async () => {
  GameAudio.init();
  GameAudio.click();
  const data = await api(`/api/games/${gameId}/start`, "POST");
  state = data.state;
  render();
};
$("rotate").onclick = () => {
  GameAudio.init();
  GameAudio.click();
  horizontal = !horizontal;
  renderTray();
  drawGhost();
};

document.addEventListener("pointerdown", () => GameAudio.init(), {
  once: true,
});
updateMuteIcon();

document.addEventListener("keydown", (e) => {
  if (e.key === "r" || e.key === "R") {
    horizontal = !horizontal;
    renderTray();
    drawGhost();
  }
});

newGame();
