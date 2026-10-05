# Battleship

Player-vs-AI Battleship game: Flask backend, vanilla HTML/CSS/JS frontend.

## Setup

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Run

```sh
.venv/bin/python -m battleship.app
```

Then open http://127.0.0.1:5000

## Test

```sh
.venv/bin/pytest -q
```

## How to play

1. Pick a difficulty (Easy = random shots, Medium = hunt/target, Hard = probability density).
2. Place your five ships on the left grid: click a ship in the tray, hover the grid for a preview, press **R** or the Rotate button to change orientation. Or hit **Randomize**.
3. Press **Start Battle**, then click cells on the enemy grid to fire. The AI fires back after each of your shots.
4. Sink all five enemy ships before the AI sinks yours.
