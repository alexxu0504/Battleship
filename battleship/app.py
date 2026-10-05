from __future__ import annotations

import os
import uuid
from collections import OrderedDict

from flask import Flask, jsonify, request, send_from_directory

from .game import Game

app = Flask(__name__, static_folder="static", static_url_path="/static")

GAMES = OrderedDict()
MAX_GAMES = 500


@app.errorhandler(404)
def not_found(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Game not found"}), 404
    return e


def get_game(game_id: str) -> Game:
    game = GAMES.get(game_id)
    if game is None:
        from flask import abort
        abort(404)
    return game


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/games", methods=["POST"])
def create_game():
    body = request.get_json(silent=True) or {}
    difficulty = body.get("difficulty", "medium")
    try:
        game = Game(difficulty)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    game_id = uuid.uuid4().hex
    if len(GAMES) >= MAX_GAMES:
        GAMES.popitem(last=False)
    GAMES[game_id] = game
    return jsonify({"id": game_id, "state": game.to_state()})


@app.route("/api/games/<game_id>", methods=["GET"])
def game_state(game_id):
    game = get_game(game_id)
    return jsonify({"state": game.to_state()})


@app.route("/api/games/<game_id>/place", methods=["POST"])
def place_ship(game_id):
    game = get_game(game_id)
    body = request.get_json(force=True)
    try:
        game.place_player_ship(
            body["name"], int(body["row"]), int(body["col"]), bool(body["horizontal"])
        )
    except (ValueError, KeyError, TypeError) as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"state": game.to_state()})


@app.route("/api/games/<game_id>/difficulty", methods=["POST"])
def set_difficulty(game_id):
    game = get_game(game_id)
    body = request.get_json(force=True)
    try:
        game.set_difficulty(body["difficulty"])
    except (ValueError, KeyError, TypeError) as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"state": game.to_state()})


@app.route("/api/games/<game_id>/remove", methods=["POST"])
def remove_ship(game_id):
    game = get_game(game_id)
    body = request.get_json(force=True)
    try:
        game.remove_player_ship(body["name"])
    except (ValueError, KeyError, TypeError) as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"state": game.to_state()})


@app.route("/api/games/<game_id>/randomize", methods=["POST"])
def randomize(game_id):
    game = get_game(game_id)
    try:
        game.randomize_player_board()
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"state": game.to_state()})


@app.route("/api/games/<game_id>/start", methods=["POST"])
def start(game_id):
    game = get_game(game_id)
    try:
        game.start()
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"state": game.to_state()})


@app.route("/api/games/<game_id>/fire", methods=["POST"])
def fire(game_id):
    game = get_game(game_id)
    body = request.get_json(force=True)
    try:
        turn = game.player_fire(int(body["row"]), int(body["col"]))
    except (ValueError, KeyError, TypeError) as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"state": game.to_state(), "turn": turn})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    host = "0.0.0.0" if "PORT" in os.environ else "127.0.0.1"
    debug = os.environ.get("FLASK_DEBUG", "0" if "PORT" in os.environ else "1") == "1"
    app.run(host=host, port=port, debug=debug)
