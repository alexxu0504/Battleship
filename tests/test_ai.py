import random

import pytest

from battleship.ai import HuntTargetAI, ProbabilityAI, make_ai
from battleship.game import BOARD_SIZE, Board


def play_full_game(difficulty, seed):
    rng = random.Random(seed)
    board = Board()
    board.place_random(random.Random(seed + 1000))
    ai = make_ai(difficulty, rng)
    shots = 0
    seen = set()
    while not board.all_sunk:
        r, c = ai.choose_shot(board)
        assert (r, c) not in seen, "AI repeated a cell"
        assert (r, c) not in board.shots
        seen.add((r, c))
        res = board.fire(r, c)
        ai.notify(r, c, res["result"], res["sunk"])
        shots += 1
        assert shots <= 100
    return shots


@pytest.mark.parametrize("difficulty", ["easy", "medium", "hard"])
def test_ai_completes_game(difficulty):
    for seed in range(5):
        shots = play_full_game(difficulty, seed)
        assert shots <= 100


def test_hunt_target_adjacent_after_hit():
    board = Board()
    board.shots[(5, 5)] = "hit"
    rng = random.Random(0)
    ai = HuntTargetAI(rng)
    r, c = ai.choose_shot(board)
    assert abs(r - 5) + abs(c - 5) == 1


def test_probability_prefers_neighbor_of_hit():
    board = Board()
    board.shots[(4, 4)] = "hit"
    ship = board.place("Carrier", 5, 4, 3, True)  # cells (4,3..7)
    ship.hits.add((4, 4))
    rng = random.Random(0)
    ai = ProbabilityAI(rng)
    ai.notify(4, 4, "hit", None)
    for _ in range(10):
        r, c = ai.choose_shot(board)
        assert abs(r - 4) + abs(c - 4) == 1


def test_hard_beats_easy_on_average():
    easy_total = sum(play_full_game("easy", s) for s in range(30))
    hard_total = sum(play_full_game("hard", s) for s in range(30))
    assert hard_total / 30 < easy_total / 30


@pytest.mark.parametrize(
    "cls, expected",
    [
        (HuntTargetAI, {(2, 0), (1, 1)}),
        (ProbabilityAI, {(2, 0), (1, 1), (1, 2)}),
    ],
)
def test_adjacent_ships_hits_not_forgotten_after_sink(cls, expected):
    board = Board()
    board.place("Destroyer", 2, 0, 0, True)  # (0,0)-(0,1)
    board.place("Cruiser", 3, 1, 0, True)    # (1,0)-(1,2)
    ai = cls(random.Random(0))
    for r, c in [(1, 0), (0, 0), (0, 1)]:
        res = board.fire(r, c)
        ai.notify(r, c, res["result"], res["sunk"])
    # Destroyer is sunk; the only unresolved hit is (1,0) on the Cruiser.
    # Valid continuations: neighbors (2,0)/(1,1), or (1,2) extending the line.
    assert ai.choose_shot(board) in expected


def test_make_ai_bad_difficulty():
    with pytest.raises(ValueError):
        make_ai("impossible", random.Random(0))
