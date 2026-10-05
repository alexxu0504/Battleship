# Battleship

Player-vs-AI Battleship game: Flask backend, vanilla HTML/CSS/JS frontend with animated ocean, airstrikes, sound effects and three AI difficulties.

## Setup

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Run

```sh
.venv/bin/python -m battleship.app
```

Then open **http://127.0.0.1:5001**

> Port 5001 is used on purpose: on macOS, port 5000 is occupied by the AirPlay Receiver, which answers with "403 Access Denied".

## Test

```sh
.venv/bin/pytest -q
```

## How to play

1. Pick a difficulty (Easy = random shots, Medium = hunt/target, Hard = probability density) and a fleet style (Military or Pirate). Both are locked once the battle starts.
2. Place your five ships: click a ship in the tray, hover the grid for a preview, press **R** or the Rotate button to change orientation. Click a placed ship to pick it up again, or hit **Randomize**.
3. Press **Start Battle** — or **Quick Battle** to randomize and start in one click — then click cells on the enemy grid to fire. The AI fires back after each of your shots.
4. Sink all five enemy ships before the AI sinks yours.

## Sound

Sound effects (bombs, explosions, splashes, fanfares) and the ambient artillery/aircraft are synthesized live with the Web Audio API. Browsers require a click before audio can start; use the speaker button in the header to mute and the ♪ slider to set the music volume.

Background music: "Hot Swing" by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 3.0 — http://creativecommons.org/licenses/by/3.0/ (see `battleship/static/music/CREDITS.txt`).
