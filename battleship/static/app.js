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
  document.body.classList.remove("defeated");
  $("gameover").classList.remove("win", "lose");
  FX.stop();
  const difficulty = $("difficulty").value;
  const data = await api("/api/games", "POST", { difficulty });
  gameId = data.id;
  state = data.state;
  selectedShip = SHIPS[0][0];
  horizontal = true;
  const demo = new URLSearchParams(location.search).get("demo");
  if (demo === "win" || demo === "lose") {
    state = (await api(`/api/games/${gameId}/randomize`, "POST")).state;
    state = (await api(`/api/games/${gameId}/start`, "POST")).state;
    state = { ...state, phase: "over", winner: demo === "win" ? "player" : "ai" };
    render({ deferGameOver: true });
    showGameOver();
    return;
  }
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
    renderFleetList($("player-fleet"), state.player.ships, state.player.shots, {
      known: true,
    });
    renderFleetList($("enemy-fleet"), state.ai.ships, state.ai.shots, {
      known: false,
    });
    renderLog();
    if (state.phase === "over" && !opts.deferGameOver) {
      showGameOver();
    }
  }
}

/* ---------- end-of-game FX ---------- */

const FX = (() => {
  const canvas = document.getElementById("fx-canvas");
  const g = canvas.getContext("2d");
  let raf = null;
  let timer = null;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    if (timer) clearTimeout(timer);
    raf = timer = null;
    g.clearRect(0, 0, canvas.width, canvas.height);
  }

  function start(mode) {
    stop();
    resize();
    const W = canvas.width, H = canvas.height;
    const t0 = performance.now();
    const rnd = (a, b) => a + Math.random() * (b - a);
    const confetti = [], rockets = [], sparks = [], smoke = [], embers = [];
    const colors = ["#ffd54a", "#ffffff", "#0ABAB5", "#e5484d", "#036c69"];
    let nextRocket = 0;

    if (mode === "win") {
      for (let i = 0; i < 220; i++) {
        confetti.push({
          x: rnd(0, W), y: rnd(-H, 0),
          vx: rnd(-0.6, 0.6), vy: rnd(1.2, 3.2),
          rot: rnd(0, Math.PI * 2), vr: rnd(-0.15, 0.15),
          c: colors[i % colors.length], ph: rnd(0, 6.28),
        });
      }
    } else {
      for (let i = 0; i < 60; i++) {
        smoke.push({
          x: rnd(0, W), y: rnd(H * 0.66, H + 40),
          r: rnd(18, 46), vy: rnd(0.2, 0.7), vx: rnd(-0.15, 0.15),
          grow: rnd(0.15, 0.4), a: rnd(0.18, 0.35), t: rnd(0, 6),
        });
      }
      for (let i = 0; i < 80; i++) {
        embers.push({
          x: rnd(0, W), y: rnd(H * 0.5, H),
          vy: rnd(0.4, 1.4), vx: rnd(-0.3, 0.3),
          s: rnd(1, 2.6), ph: rnd(0, 6.28),
        });
      }
    }

    function frame(now) {
      if (document.getElementById("gameover").classList.contains("hidden")) {
        stop();
        return;
      }
      const t = (now - t0) / 1000;
      g.clearRect(0, 0, W, H);
      if (mode === "win") {
        // rockets -> bursts for first 5s
        if (t < 5 && now > nextRocket) {
          nextRocket = now + 450;
          rockets.push({ x: rnd(W * 0.15, W * 0.85), y: H, t0: now, c: colors[(Math.random() * colors.length) | 0] });
        }
        for (let i = rockets.length - 1; i >= 0; i--) {
          const rk = rockets[i];
          const p = (now - rk.t0) / 600;
          if (p >= 1) {
            rockets.splice(i, 1);
            for (let j = 0; j < 60; j++) {
              const a = rnd(0, Math.PI * 2), v = rnd(0.8, 4.2);
              sparks.push({ x: rk.x, y: rk.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.2, c: rk.c });
            }
            const glow = g.createRadialGradient(rk.x, rk.y, 0, rk.x, rk.y, 90);
            glow.addColorStop(0, "rgba(255,240,180,0.35)");
            glow.addColorStop(1, "rgba(255,240,180,0)");
            g.fillStyle = glow;
            g.fillRect(rk.x - 90, rk.y - 90, 180, 180);
            if (window.GameAudio && GameAudio.firework) GameAudio.firework();
            continue;
          }
          rk.y = H - (H * 0.55 + rnd(0, H * 0.25)) * p;
          g.fillStyle = "#fff8d0";
          g.fillRect(rk.x - 1.5, rk.y, 3, 3);
          g.fillStyle = "rgba(255,240,180,0.4)";
          g.fillRect(rk.x - 1, rk.y + 4, 2, 14 * p);
        }
        g.globalCompositeOperation = "lighter";
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i];
          s.life -= 1 / 60;
          if (s.life <= 0) { sparks.splice(i, 1); continue; }
          s.vx *= 0.985; s.vy = s.vy * 0.985 + 0.04;
          s.x += s.vx; s.y += s.vy;
          g.globalAlpha = Math.min(1, s.life);
          g.fillStyle = s.c;
          g.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = "source-over";
        for (const cf of confetti) {
          cf.y += cf.vy;
          cf.x += cf.vx + Math.sin(t * 3 + cf.ph) * 0.6;
          cf.rot += cf.vr;
          if (cf.y > H + 12) {
            if (t < 5) { cf.y = -12; cf.x = rnd(0, W); }
            else continue;
          }
          g.save();
          g.translate(cf.x, cf.y);
          g.rotate(cf.rot);
          g.fillStyle = cf.c;
          g.fillRect(-3, -5, 6, 10);
          g.restore();
        }
      } else {
        // rain
        g.strokeStyle = "rgba(160,190,210,0.12)";
        g.lineWidth = 1;
        for (let i = 0; i < 90; i++) {
          const x = (i * 97 + t * 60) % (W + 60) - 30;
          const y = (i * 173 + t * 500) % H;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x - 6, y + 16);
          g.stroke();
        }
        // sinking ship silhouette
        const p = Math.min(1, t / 6);
        g.save();
        g.translate(W / 2, H * 0.55 + p * 120);
        g.rotate((p * 12 * Math.PI) / 180);
        g.globalAlpha = Math.max(0, 1 - p * 0.9);
        g.fillStyle = "rgba(15,20,25,0.9)";
        g.beginPath();
        g.moveTo(-130, 0);
        g.lineTo(-120, 22);
        g.lineTo(95, 22);
        g.lineTo(130, -6);
        g.lineTo(60, 0);
        g.closePath();
        g.fill();
        g.fillRect(-40, -26, 60, 26);
        g.fillRect(10, -40, 8, 40);
        g.restore();
        g.globalAlpha = 1;
        // heavy smoke
        for (const s of smoke) {
          s.y -= s.vy; s.x += s.vx; s.r += s.grow;
          if (s.y < H * 0.2 || s.r > 140) {
            s.x = rnd(0, W); s.y = rnd(H * 0.7, H + 40);
            s.r = rnd(18, 46);
          }
          const grad = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
          grad.addColorStop(0, `rgba(50,50,55,${s.a})`);
          grad.addColorStop(1, "rgba(50,50,55,0)");
          g.fillStyle = grad;
          g.beginPath();
          g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          g.fill();
        }
        // embers
        for (const e of embers) {
          e.y -= e.vy; e.x += e.vx + Math.sin(t * 2 + e.ph) * 0.4;
          if (e.y < -6) { e.y = rnd(H * 0.6, H); e.x = rnd(0, W); }
          g.globalAlpha = 0.5 + Math.sin(t * 8 + e.ph) * 0.4;
          g.fillStyle = "#ff8c1a";
          g.beginPath();
          g.arc(e.x, e.y, e.s, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    timer = setTimeout(stop, 8000);
  }

  return { start, stop };
})();

function showGameOver() {
  const go = $("gameover");
  go.classList.remove("hidden", "win", "lose");
  const shots = state.ai.shots.length;
  const hits = state.ai.shots.filter((s) => s[2] === "hit").length;
  const acc = shots ? Math.round((hits / shots) * 100) : 0;
  const stats = [
    [shots, "shots fired"],
    [hits, "hits"],
    [acc + "%", "accuracy"],
    [state.ai.sunk_ships.length + "/5", "enemy sunk"],
    [state.player.ships.filter((s) => s.sunk).length + "/5", "ships lost"],
  ];
  $("gameover-stats").innerHTML = stats
    .map(([v, l]) => `<li><b>${v}</b>${l}</li>`)
    .join("");
  if (state.winner === "player") playVictory();
  else playDefeat();
}

function playVictory() {
  $("gameover").classList.add("win");
  $("gameover-kicker").textContent = "MISSION ACCOMPLISHED";
  $("gameover-text").textContent = "VICTORY!";
  $("gameover-sub").textContent = "You sank the entire enemy fleet.";
  GameAudio.duckMusic(6);
  GameAudio.victory();
  FX.start("win");
}

function playDefeat() {
  $("gameover").classList.add("lose");
  $("gameover-kicker").textContent = "FLEET DESTROYED";
  $("gameover-text").textContent = "DEFEAT";
  $("gameover-sub").textContent = "Your fleet rests on the ocean floor.";
  document.body.classList.add("defeated");
  GameAudio.duckMusic(8);
  GameAudio.defeat();
  setTimeout(() => GameAudio.slam(), 500);
  setTimeout(() => {
    document.body.classList.remove("shake");
    void document.body.offsetWidth;
    document.body.classList.add("shake");
    setTimeout(() => document.body.classList.remove("shake"), 350);
  }, 900);
  FX.start("lose");
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
  const sky = document.createElement("div");
  sky.className = "sky-layer";
  el.appendChild(sky);
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
    const mini = miniSprite(name, size, size * 18, 17);
    mini.style.position = "static";
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

function planeSVG(side) {
  const enemy = side === "ai";
  const body = enemy ? "#6b6b6b" : "#5b6b3a";
  const dark = enemy ? "#444444" : "#3f4a28";
  const marks = enemy
    ? `<path d="M19 4 h6 M22 1.5 v8 M19 16 h6 M22 13.5 v8" stroke="#111" stroke-width="1.4"/>`
    : `<g><circle cx="22" cy="5.5" r="3" fill="#1c4587"/><circle cx="22" cy="5.5" r="1.9" fill="#fff"/><circle cx="22" cy="5.5" r="0.9" fill="#c0392b"/></g><g><circle cx="22" cy="22.5" r="3" fill="#1c4587"/><circle cx="22" cy="22.5" r="1.9" fill="#fff"/><circle cx="22" cy="22.5" r="0.9" fill="#c0392b"/></g>`;
  return `<svg width="68" height="28" viewBox="0 0 68 28" style="margin-left:-34px;margin-top:-14px">
    <path d="M34 1 L16 10 L16 18 L34 27 Z" fill="${body}" stroke="${dark}"/>
    <path d="M10 8 L3 11 L3 17 L10 20 Z" fill="${body}" stroke="${dark}"/>
    <path d="M6 10.5 L50 10.5 Q60 14 50 17.5 L6 17.5 Z" fill="${body}" stroke="${dark}"/>
    <ellipse cx="38" cy="14" rx="5" ry="3" fill="#9fd3e6" stroke="${dark}"/>
    <rect x="30" y="12.5" width="5" height="3" fill="${dark}"/>
    ${marks}
    <rect x="57" y="12.3" width="3.5" height="3.4" fill="${dark}"/>
    <g class="prop">
      <circle cx="62.5" cy="14" r="7" fill="rgba(255,255,255,0.15)"/>
      <line x1="62.5" y1="7.5" x2="62.5" y2="20.5" stroke="rgba(40,40,40,0.7)" stroke-width="1"/>
      <line x1="56.5" y1="11" x2="68.5" y2="17" stroke="rgba(40,40,40,0.7)" stroke-width="1"/>
      <line x1="56.5" y1="17" x2="68.5" y2="11" stroke="rgba(40,40,40,0.7)" stroke-width="1"/>
    </g>
  </svg>`;
}

function bombEl() {
  const d = document.createElement("div");
  d.className = "dbomb";
  d.innerHTML = `<svg width="10" height="18" viewBox="0 0 10 18">
    <path d="M5 1 Q8.5 1 8.5 7 L8.5 12 Q8.5 15 5 15 Q1.5 15 1.5 12 L1.5 7 Q1.5 1 5 1 Z" fill="#111"/>
    <path d="M2.4 14.5 L0.2 18 L3.6 16.4 Z M7.6 14.5 L9.8 18 L6.4 16.4 Z M4.6 15 L5 18 L5.4 15 Z" fill="#333"/>
  </svg>`;
  return d;
}

let lastHeading = null;

function airstrike(boardEl, row, col, side) {
  return new Promise((resolve) => {
    const sky = boardEl.querySelector(".sky-layer");
    const OFF = 60; // sky-layer inset
    const cx = col * 36 + 17 + OFF;
    const cy = row * 36 + 17 + OFF;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish = (bomb, delay) => {
      let done = false;
      const fin = () => {
        if (done) return;
        done = true;
        bomb.remove();
        resolve();
      };
      setTimeout(fin, delay);
      return fin;
    };
    if (reduced) {
      const bomb = bombEl();
      bomb.style.left = cx - 5 + "px";
      bomb.style.top = cy - 40 + "px";
      sky.appendChild(bomb);
      const anim = bomb.animate(
        [{ transform: "translateY(0)" }, { transform: "translateY(40px)" }],
        { duration: 250, easing: "cubic-bezier(.4,0,.8,1)", fill: "forwards" }
      );
      const fin = finish(bomb, 400);
      anim.onfinish = fin;
      return;
    }
    const headings = [0, 90, 180, 270].filter((h) => h !== lastHeading);
    const heading = headings[(Math.random() * headings.length) | 0];
    lastHeading = heading;
    window.__lastHeading = heading;
    const rad = (heading * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const start = { x: cx - ux * 300, y: cy - uy * 300 };
    const end = { x: cx + ux * 300, y: cy + uy * 300 };
    const dur = 1300;
    const tRelease = dur / 2;
    const plane = document.createElement("div");
    plane.className = "plane" + (side === "ai" ? " enemy" : "");
    plane.dataset.heading = heading;
    plane.innerHTML = planeSVG(side);
    const shadow = document.createElement("div");
    shadow.className = "plane-shadow";
    sky.appendChild(shadow);
    sky.appendChild(plane);
    const easing = "cubic-bezier(.4,0,.6,1)";
    const pAnim = plane.animate(
      [
        {
          transform: `translate(${start.x}px, ${start.y}px) rotate(${heading}deg)`,
        },
        { transform: `translate(${end.x}px, ${end.y}px) rotate(${heading}deg)` },
      ],
      { duration: dur, easing, fill: "forwards" }
    );
    shadow.animate(
      [
        {
          transform: `translate(${start.x - 28 + 10}px, ${start.y - 8 + 28}px) rotate(${heading}deg)`,
        },
        {
          transform: `translate(${end.x - 28 + 10}px, ${end.y - 8 + 28}px) rotate(${heading}deg)`,
        },
      ],
      { duration: dur, easing, fill: "forwards" }
    );
    pAnim.onfinish = () => {
      plane.remove();
      shadow.remove();
    };
    if (heading === 0 || heading === 180) {
      GameAudio.planePass(-ux, ux, dur / 1000, 1200);
    } else {
      GameAudio.planePass(-uy * 0.3, uy * 0.3, dur / 1000, 1100);
    }
    setTimeout(() => {
      const bomb = bombEl();
      bomb.style.left = cx - 5 - ux * 12 + "px";
      bomb.style.top = cy - 14 + "px";
      sky.appendChild(bomb);
      GameAudio.bombWhistle(0.45);
      const spin = ux + uy >= 0 ? 25 : -25;
      const anim = bomb.animate(
        [
          { transform: "translate(0, 0) scale(1.1) rotate(0deg)" },
          {
            transform: `translate(${ux * 12}px, 14px) scale(0.6) rotate(${spin}deg)`,
          },
        ],
        { duration: 450, easing: "cubic-bezier(.4,0,.8,1)", fill: "forwards" }
      );
      const fin = finish(bomb, 600);
      anim.onfinish = fin;
    }, tRelease);
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
    GameAudio.init();
    const [data] = await Promise.all([
      api(`/api/games/${gameId}/fire`, "POST", { row, col }),
      airstrike($("enemy-board"), row, col, "player"),
    ]);
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
      await airstrike($("player-board"), as.row, as.col, "ai");
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
    if (state.phase === "over") showGameOver();
  }
}

function miniSprite(name, size, w, h) {
  const mini = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const vW = size * 36 - 2;
  mini.setAttribute("class", `ship-sprite ${fleetStyle}`);
  mini.setAttribute("viewBox", `0 0 ${vW} 34`);
  mini.setAttribute("width", w);
  mini.setAttribute("height", h);
  mini.innerHTML = shipSVG(fleetStyle, name, size, vW);
  return mini;
}

function renderFleetList(ul, ships, shots, { known }) {
  ul.innerHTML = "";
  const byName = {};
  for (const s of ships || []) byName[s.name] = s;
  const shotCells = {};
  for (const [r, c, res] of shots || []) shotCells[`${r},${c}`] = res;
  for (const [name, size] of SHIPS) {
    const s = byName[name];
    let hits = 0;
    let sunk = false;
    let cellsKnown = false;
    if (s) {
      sunk = s.sunk;
      cellsKnown = !!s.cells;
      if (cellsKnown) {
        for (const [r, c] of s.cells)
          if (shotCells[`${r},${c}`] === "hit") hits++;
      }
      if (sunk) hits = size;
    }
    const canDamage = (known || cellsKnown) && !sunk && hits > 0;
    const li = document.createElement("li");
    li.className = "fleet-row" + (sunk ? " sunk" : canDamage ? " damaged" : "");
    li.appendChild(miniSprite(name, size, size * 14, 13));
    const nm = document.createElement("span");
    nm.className = "fleet-name";
    nm.textContent = name;
    li.appendChild(nm);
    const pips = document.createElement("span");
    pips.className = "pips";
    for (let i = 0; i < size; i++) {
      const pip = document.createElement("i");
      if (i < hits) pip.classList.add("hit");
      pips.appendChild(pip);
    }
    li.appendChild(pips);
    const st = document.createElement("span");
    st.className = "fleet-state";
    st.textContent = sunk
      ? "Sunk"
      : canDamage
      ? `Damaged (${hits}/${size})`
      : "Afloat";
    li.appendChild(st);
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
