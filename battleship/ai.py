from __future__ import annotations

import random
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Set, Tuple

Coord = Tuple[int, int]

SHIP_SIZES = [5, 4, 3, 3, 2]
SHIP_NAME_TO_SIZE = {
    "Carrier": 5,
    "Battleship": 4,
    "Cruiser": 3,
    "Submarine": 3,
    "Destroyer": 2,
}


class AIStrategy(ABC):
    def __init__(self, rng: random.Random) -> None:
        self.rng = rng

    @abstractmethod
    def choose_shot(self, board) -> Coord:
        ...

    def notify(self, r: int, c: int, result: str, sunk: Optional[str]) -> None:
        pass


def _unshot_cells(board) -> List[Coord]:
    size = _board_size(board)
    return [(r, c) for r in range(size) for c in range(size) if (r, c) not in board.shots]


def _board_size(board) -> int:
    from .game import BOARD_SIZE
    return BOARD_SIZE


def _neighbors(board, r: int, c: int) -> List[Coord]:
    size = _board_size(board)
    out = []
    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nr, nc = r + dr, c + dc
        if 0 <= nr < size and 0 <= nc < size and (nr, nc) not in board.shots:
            out.append((nr, nc))
    return out


class RandomAI(AIStrategy):
    def choose_shot(self, board) -> Coord:
        return self.rng.choice(_unshot_cells(board))


class HuntTargetAI(AIStrategy):
    def _line_extension(self, board, hits: List[Coord]) -> Optional[Coord]:
        # If unresolved hits share a row or column, extend that line.
        rows: Dict[int, List[int]] = {}
        cols: Dict[int, List[int]] = {}
        for r, c in hits:
            rows.setdefault(r, []).append(c)
            cols.setdefault(c, []).append(r)
        candidates: List[Coord] = []
        if len(rows) == 1 and len(hits) >= 2:
            r = next(iter(rows))
            cs = sorted(rows[r])
            candidates = [(r, cs[0] - 1), (r, cs[-1] + 1)]
        elif len(cols) == 1 and len(hits) >= 2:
            c = next(iter(cols))
            rs = sorted(cols[c])
            candidates = [(rs[0] - 1, c), (rs[-1] + 1, c)]
        if not candidates:
            return None
        valid = [cell for cell in candidates if cell in _unshot_set(board)]
        if valid:
            return self.rng.choice(valid)
        return None

    def choose_shot(self, board) -> Coord:
        unshot = set(_unshot_cells(board))
        hits = sorted(_unresolved_hits(board))
        if len(hits) >= 2:
            ext = self._line_extension(board, hits)
            if ext is not None:
                return ext
        if hits:
            opts: List[Coord] = []
            for r, c in hits:
                for n in _neighbors(board, r, c):
                    if n in unshot and n not in opts:
                        opts.append(n)
            if opts:
                return self.rng.choice(opts)
        parity = [cell for cell in unshot if (cell[0] + cell[1]) % 2 == 0]
        pool = parity if parity else list(unshot)
        return self.rng.choice(pool)


def _unshot_set(board) -> Set[Coord]:
    return set(_unshot_cells(board))


def _sunk_cells(board) -> Set[Coord]:
    cells: Set[Coord] = set()
    for ship in board.ships:
        if ship.is_sunk:
            cells.update(ship.cells)
    return cells


def _unresolved_hits(board) -> Set[Coord]:
    return {
        cell for cell, res in board.shots.items() if res == "hit"
    } - _sunk_cells(board)


class ProbabilityAI(AIStrategy):
    def __init__(self, rng: random.Random) -> None:
        super().__init__(rng)
        self.remaining_sizes: List[int] = list(SHIP_SIZES)

    def notify(self, r: int, c: int, result: str, sunk: Optional[str]) -> None:
        if sunk is not None:
            size = SHIP_NAME_TO_SIZE.get(sunk)
            if size in self.remaining_sizes:
                self.remaining_sizes.remove(size)

    def choose_shot(self, board) -> Coord:
        size = _board_size(board)
        unshot = _unshot_set(board)
        unresolved = _unresolved_hits(board)
        misses = {cell for cell, res in board.shots.items() if res == "miss"}
        blocked = misses | _sunk_cells(board)
        weights: Dict[Coord, float] = {}
        for ship_size in self.remaining_sizes:
            for r in range(size):
                for c in range(size):
                    for horiz in (True, False):
                        cells = (
                            [(r, c + i) for i in range(ship_size)]
                            if horiz
                            else [(r + i, c) for i in range(ship_size)]
                        )
                        if any(not (0 <= cr < size and 0 <= cc < size) for cr, cc in cells):
                            continue
                        if any(cell in blocked for cell in cells):
                            continue
                        covered = sum(1 for cell in cells if cell in unresolved)
                        w = 1.0 * (50 ** covered)
                        for cell in cells:
                            if cell in unshot:
                                weights[cell] = weights.get(cell, 0.0) + w
        if not weights:
            return self.rng.choice(list(unshot))
        best = max(weights.values())
        best_cells = [cell for cell, w in weights.items() if w == best]
        return self.rng.choice(best_cells)


def make_ai(difficulty: str, rng: random.Random) -> AIStrategy:
    if difficulty == "easy":
        return RandomAI(rng)
    if difficulty == "medium":
        return HuntTargetAI(rng)
    if difficulty == "hard":
        return ProbabilityAI(rng)
    raise ValueError("Unknown difficulty %r" % difficulty)
