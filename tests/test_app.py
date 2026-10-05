import pytest

from battleship.app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


def test_full_flow(client):
    res = client.post("/api/games", json={"difficulty": "easy"})
    assert res.status_code == 200
    data = res.get_json()
    gid = data["id"]
    assert data["state"]["phase"] == "placement"

    res = client.post(f"/api/games/{gid}/randomize")
    assert res.status_code == 200
    assert len(res.get_json()["state"]["player"]["ships"]) == 5

    res = client.post(f"/api/games/{gid}/start")
    assert res.status_code == 200
    assert res.get_json()["state"]["phase"] == "playing"

    res = client.post(f"/api/games/{gid}/fire", json={"row": 0, "col": 0})
    assert res.status_code == 200
    data = res.get_json()
    assert data["turn"]["player_shot"]["result"] in ("hit", "miss")
    assert data["turn"]["ai_shot"] is not None

    res = client.get(f"/api/games/{gid}")
    assert res.status_code == 200
    assert res.get_json()["state"]["phase"] == "playing"


def test_fire_before_start(client):
    gid = client.post("/api/games", json={"difficulty": "medium"}).get_json()["id"]
    res = client.post(f"/api/games/{gid}/fire", json={"row": 0, "col": 0})
    assert res.status_code == 400
    assert "error" in res.get_json()


def test_start_before_placement(client):
    gid = client.post("/api/games", json={"difficulty": "medium"}).get_json()["id"]
    res = client.post(f"/api/games/{gid}/start")
    assert res.status_code == 400


def test_difficulty_endpoint(client):
    gid = client.post("/api/games", json={"difficulty": "easy"}).get_json()["id"]
    res = client.post(f"/api/games/{gid}/difficulty", json={"difficulty": "hard"})
    assert res.status_code == 200
    assert res.get_json()["state"]["difficulty"] == "hard"
    client.post(f"/api/games/{gid}/randomize")
    client.post(f"/api/games/{gid}/start")
    res = client.post(f"/api/games/{gid}/difficulty", json={"difficulty": "easy"})
    assert res.status_code == 400


def test_unknown_id(client):
    res = client.get("/api/games/nope")
    assert res.status_code == 404
    assert res.get_json() == {"error": "Game not found"}
    res = client.post("/api/games/nope/fire", json={"row": 0, "col": 0})
    assert res.status_code == 404
    assert res.get_json()["error"]


def test_remove_ship_endpoint(client):
    gid = client.post("/api/games", json={"difficulty": "easy"}).get_json()["id"]
    res = client.post(
        f"/api/games/{gid}/place",
        json={"name": "Carrier", "row": 0, "col": 0, "horizontal": True},
    )
    assert res.status_code == 200
    res = client.post(f"/api/games/{gid}/remove", json={"name": "Carrier"})
    assert res.status_code == 200
    assert res.get_json()["state"]["player"]["ships"] == []
    res = client.post(f"/api/games/{gid}/remove", json={"name": "Carrier"})
    assert res.status_code == 400


def test_games_eviction(client, monkeypatch):
    import battleship.app as app_module

    monkeypatch.setattr(app_module, "MAX_GAMES", 3)
    app_module.GAMES.clear()
    ids = [
        client.post("/api/games", json={"difficulty": "easy"}).get_json()["id"]
        for _ in range(4)
    ]
    assert client.get(f"/api/games/{ids[0]}").status_code == 404
    assert client.get(f"/api/games/{ids[3]}").status_code == 200


def test_bad_place(client):
    gid = client.post("/api/games", json={"difficulty": "medium"}).get_json()["id"]
    res = client.post(
        f"/api/games/{gid}/place",
        json={"name": "Carrier", "row": 0, "col": 9, "horizontal": True},
    )
    assert res.status_code == 400
