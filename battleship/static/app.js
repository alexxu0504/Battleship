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

function render() {
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
    if (state.phase === "over") {
      $("gameover").classList.remove("hidden");
      $("gameover-text").textContent =
        state.winner === "player" ? "Victory! You sank the enemy fleet." : "Defeat — your fleet was destroyed.";
    }
  }
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
  return cells;
}

function cellAt(el, r, c) {
  return el.children[r * SIZE + c];
}

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
    const dots = document.createElement("div");
    dots.className = "dots";
    for (let i = 0; i < size; i++) {
      const dot = document.createElement("div");
      dot.className = "dot";
      dots.appendChild(dot);
    }
    div.appendChild(dots);
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
      d.classList.add(s && s.sunk ? "sunk" : "hit");
    } else {
      d.classList.add("miss");
    }
  }
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
      d.classList.add(s && s.sunk ? "sunk" : "hit");
    } else {
      d.classList.add("miss");
    }
  }
  for (const key in aiShips) {
    const [r, c] = key.split(",").map(Number);
    const s = aiShips[key];
    if (s.sunk && shots[key] !== "hit") cellAt(el, r, c).classList.add("sunk");
    if (s.sunk) cellAt(el, r, c).classList.add("sunk");
  }
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

async function fire(row, col) {
  if (state.phase !== "playing") return;
  if (shotsMap(state.ai.shots)[`${row},${col}`]) return;
  try {
    const data = await api(`/api/games/${gameId}/fire`, "POST", { row, col });
    state = data.state;
    render();
  } catch (e) {}
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

$("new-game").onclick = newGame;
$("play-again").onclick = newGame;
$("randomize").onclick = async () => {
  const data = await api(`/api/games/${gameId}/randomize`, "POST");
  state = data.state;
  selectedShip = null;
  render();
};
$("start").onclick = async () => {
  const data = await api(`/api/games/${gameId}/start`, "POST");
  state = data.state;
  render();
};
$("rotate").onclick = () => {
  horizontal = !horizontal;
  renderTray();
  drawGhost();
};

document.addEventListener("keydown", (e) => {
  if (e.key === "r" || e.key === "R") {
    horizontal = !horizontal;
    renderTray();
    drawGhost();
  }
});

newGame();
