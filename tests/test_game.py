import random

import pytest

from battleship.game import BOARD_SIZE, SHIPS, Board, Game


def test_place_out_of_bounds():
    b = Board()
    assert not b.can_place(5, 0, 9, True)
    assert not b.can_place(3, 8, 0, False)
    with pytest.raises(ValueError):
        b.place("Carrier", 5, 0, 9, True)


def test_place_overlap():
    b = Board()
    b.place("Carrier", 5, 0, 0, True)
    assert not b.can_place(3, 0, 2, True)
    assert not b.can_place(3, 0, 2, False)
    with pytest.raises(ValueError):
        b.place("Cruiser", 3, 0, 2, False)


def test_place_adjacent_ok():
    b = Board()
    b.place("Carrier", 5, 0, 0, True)
    assert b.can_place(3, 1, 0, True)


def test_fire_hit_miss_sunk():
    b = Board()
    ship = b.place("Destroyer", 2, 3, 3, True)
    assert b.fire(0, 0)["result"] == "miss"
    r = b.fire(3, 3)
    assert r["result"] == "hit" and r["sunk"] is None
    r = b.fire(3, 4)
    assert r["result"] == "hit" and r["sunk"] == "Destroyer"
    assert ship.is_sunk


def test_fire_duplicate_and_bounds():
    b = Board()
    b.fire(0, 0)
    with pytest.raises(ValueError):
        b.fire(0, 0)
    with pytest.raises(ValueError):
        b.fire(-1, 0)
    with pytest.raises(ValueError):
        b.fire(0, BOARD_SIZE)


def test_all_sunk_and_remaining():
    b = Board()
    b.place("Destroyer", 2, 0, 0, True)
    assert not b.all_sunk
    b.ships = [b.ships[0]]
    b.fire(0, 0)
    assert b.remaining_ships == ["Destroyer"]
    b.fire(0, 1)
    assert b.remaining_ships == []


def test_random_placement_many_seeds():
    for seed in range(50):
        b = Board()
        b.place_random(random.Random(seed))
        assert len(b.ships) == len(SHIPS)
        cells = [c for s in b.ships for c in s.cells]
        assert len(cells) == len(set(cells)) == sum(s for _, s in SHIPS)
        assert all(0 <= r < BOARD_SIZE and 0 <= c < BOARD_SIZE for r, c in cells)


def test_game_start_requires_full_placement():
    g = Game("easy", seed=1)
    with pytest.raises(ValueError):
        g.start()
    g.randomize_player_board()
    g.start()
    assert g.phase == "playing"


def test_player_fire_triggers_ai_shot():
    g = Game("easy", seed=2)
    g.randomize_player_board()
    g.start()
    res = g.player_fire(0, 0)
    assert res["player_shot"]["result"] in ("hit", "miss")
    assert res["ai_shot"] is not None
    assert len(g.player_board.shots) == 1


def test_fire_before_start_raises():
    g = Game("easy", seed=3)
    with pytest.raises(ValueError):
        g.player_fire(0, 0)


def test_winner_set():
    g = Game("easy", seed=4)
    g.randomize_player_board()
    g.start()
    # Fire at every cell until game ends
    for r in range(BOARD_SIZE):
        for c in range(BOARD_SIZE):
            if g.phase == "playing":
                g.player_fire(r, c)
    assert g.phase == "over"
    assert g.winner in ("player", "ai")


def test_to_state_reveal():
    g = Game("medium", seed=5)
    state = g.to_state()
    assert state["ai"]["ships"] == []
    state = g.to_state(reveal_ai=True)
    assert len(state["ai"]["ships"]) == 5
    g.randomize_player_board()
    g.start()
    while g.phase == "playing":
        for r in range(BOARD_SIZE):
            for c in range(BOARD_SIZE):
                if g.phase == "playing" and (r, c) not in g.ai_board.shots:
                    g.player_fire(r, c)
                if g.phase == "playing" and g.to_state()["ai"]["sunk_ships"]:
                    st = g.to_state()
                    assert all(s["sunk"] for s in st["ai"]["ships"])
    st = g.to_state()
    assert len(st["ai"]["ships"]) == 5
    assert st["winner"] is not None
