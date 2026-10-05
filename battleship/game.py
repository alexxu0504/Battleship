from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

from .ai import make_ai, AIStrategy

BOARD_SIZE = 10
SHIPS = [
    ("Carrier", 5),
    ("Battleship", 4),
    ("Cruiser", 3),
    ("Submarine", 3),
    ("Destroyer", 2),
]

Coord = Tuple[int, int]


@dataclass
class Ship:
    name: str
    size: int
    cells: List[Coord]
    hits: Set[Coord] = field(default_factory=set)

    @property
    def is_sunk(self) -> bool:
        return len(self.hits) >= self.size


class Board:
    def __init__(self) -> None:
        self.ships: List[Ship] = []
        self.shots: Dict[Coord, str] = {}

    @property
    def occupied(self) -> Set[Coord]:
        cells: Set[Coord] = set()
        for ship in self.ships:
            cells.update(ship.cells)
        return cells

    def _cells_for(self, size: int, row: int, col: int, horizontal: bool) -> List[Coord]:
        if horizontal:
            return [(row, col + i) for i in range(size)]
        return [(row + i, col) for i in range(size)]

    def can_place(self, size: int, row: int, col: int, horizontal: bool) -> bool:
        cells = self._cells_for(size, row, col, horizontal)
        occ = self.occupied
        for r, c in cells:
            if not (0 <= r < BOARD_SIZE and 0 <= c < BOARD_SIZE):
                return False
            if (r, c) in occ:
                return False
        return True

    def place(self, name: str, size: int, row: int, col: int, horizontal: bool) -> Ship:
        if not self.can_place(size, row, col, horizontal):
            raise ValueError("Cannot place %s at (%d, %d)" % (name, row, col))
        ship = Ship(name=name, size=size, cells=self._cells_for(size, row, col, horizontal))
        self.ships.append(ship)
        return ship

    def place_random(self, rng: random.Random) -> None:
        self.ships = []
        self.shots = {}
        for name, size in SHIPS:
            while True:
                row = rng.randrange(BOARD_SIZE)
                col = rng.randrange(BOARD_SIZE)
                horizontal = rng.random() < 0.5
                if self.can_place(size, row, col, horizontal):
                    self.place(name, size, row, col, horizontal)
                    break

    def fire(self, row: int, col: int) -> dict:
        if not (0 <= row < BOARD_SIZE and 0 <= col < BOARD_SIZE):
            raise ValueError("Shot out of bounds")
        coord = (row, col)
        if coord in self.shots:
            raise ValueError("Cell already fired upon")
        for ship in self.ships:
            if coord in ship.cells:
                ship.hits.add(coord)
                self.shots[coord] = "hit"
                return {"result": "hit", "sunk": ship.name if ship.is_sunk else None}
        self.shots[coord] = "miss"
        return {"result": "miss", "sunk": None}

    @property
    def all_sunk(self) -> bool:
        return len(self.ships) == len(SHIPS) and all(s.is_sunk for s in self.ships)

    @property
    def remaining_ships(self) -> List[str]:
        return [s.name for s in self.ships if not s.is_sunk]


class Game:
    def __init__(self, difficulty: str, seed: Optional[int] = None) -> None:
        self.difficulty = difficulty
        self.rng = random.Random(seed)
        self.player_board = Board()
        self.ai_board = Board()
        self.ai_board.place_random(self.rng)
        self.ai: AIStrategy = make_ai(difficulty, self.rng)
        self.phase = "placement"
        self.winner: Optional[str] = None
        self.log: List[dict] = []

    def _log(self, who: str, text: str) -> None:
        self.log.append({"who": who, "text": text})

    def set_difficulty(self, difficulty: str) -> None:
        if self.phase != "placement":
            raise ValueError("Difficulty can only be changed during placement")
        self.ai = make_ai(difficulty, self.rng)
        self.difficulty = difficulty

    def place_player_ship(self, name: str, row: int, col: int, horizontal: bool) -> None:
        if self.phase != "placement":
            raise ValueError("Game already started")
        size = None
        for n, s in SHIPS:
            if n == name:
                size = s
        if size is None:
            raise ValueError("Unknown ship %s" % name)
        if any(s.name == name for s in self.player_board.ships):
            raise ValueError("%s already placed" % name)
        self.player_board.place(name, size, row, col, horizontal)

    def randomize_player_board(self) -> None:
        if self.phase != "placement":
            raise ValueError("Game already started")
        self.player_board.place_random(self.rng)

    def start(self) -> None:
        if self.phase != "placement":
            raise ValueError("Game already started")
        if len(self.player_board.ships) < len(SHIPS):
            raise ValueError("All ships must be placed before starting")
        self.phase = "playing"
        self._log("system", "Battle started — fire away!")

    def player_fire(self, row: int, col: int) -> dict:
        if self.phase != "playing":
            raise ValueError("Game is not in playing phase")
        res = self.ai_board.fire(row, col)
        player_shot = {"row": row, "col": col, "result": res["result"], "sunk": res["sunk"]}
        if res["result"] == "hit":
            self._log("player", "You hit at %s!" % coord_label(row, col))
        else:
            self._log("player", "You missed at %s." % coord_label(row, col))
        if res["sunk"]:
            self._log("player", "You sank the enemy %s!" % res["sunk"])
        ai_shot = None
        if self.ai_board.all_sunk:
            self.phase = "over"
            self.winner = "player"
            self._log("system", "Victory! All enemy ships sunk.")
        else:
            r, c = self.ai.choose_shot(self.player_board)
            ares = self.player_board.fire(r, c)
            self.ai.notify(r, c, ares["result"], ares["sunk"])
            ai_shot = {"row": r, "col": c, "result": ares["result"], "sunk": ares["sunk"]}
            if ares["result"] == "hit":
                self._log("ai", "Enemy hit at %s!" % coord_label(r, c))
            else:
                self._log("ai", "Enemy missed at %s." % coord_label(r, c))
            if ares["sunk"]:
                self._log("ai", "Enemy sank your %s!" % ares["sunk"])
            if self.player_board.all_sunk:
                self.phase = "over"
                self.winner = "ai"
                self._log("system", "Defeat — your fleet has been destroyed.")
        return {"player_shot": player_shot, "ai_shot": ai_shot, "winner": self.winner}

    def to_state(self, reveal_ai: bool = False) -> dict:
        reveal = reveal_ai or self.phase == "over"

        def ship_dict(s: Ship) -> dict:
            return {
                "name": s.name,
                "size": s.size,
                "cells": [list(c) for c in s.cells],
                "sunk": s.is_sunk,
            }

        def shots_list(board: Board) -> list:
            return [[r, c, res] for (r, c), res in board.shots.items()]

        ai_state = {
            "shots": shots_list(self.ai_board),
            "sunk_ships": [s.name for s in self.ai_board.ships if s.is_sunk],
            "remaining": len(self.ai_board.remaining_ships),
            "ships": [ship_dict(s) for s in self.ai_board.ships if reveal or s.is_sunk],
        }
        return {
            "phase": self.phase,
            "difficulty": self.difficulty,
            "winner": self.winner,
            "player": {
                "ships": [ship_dict(s) for s in self.player_board.ships],
                "shots": shots_list(self.player_board),
            },
            "ai": ai_state,
            "log": list(self.log),
        }


def coord_label(row: int, col: int) -> str:
    return "%s%d" % (chr(ord("A") + row), col + 1)
