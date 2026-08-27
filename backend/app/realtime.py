"""Socket.IO presence + live issue rooms."""

from __future__ import annotations

import socketio

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

# issue_id -> {sid: {user_id, name, avatar, typing}}
PRESENCE: dict[str, dict[str, dict]] = {}


@sio.event
async def connect(sid, environ, auth):
    await sio.save_session(sid, {"user": (auth or {}).get("user") or {"name": "Guest", "id": 0, "avatar": "?"}})


@sio.event
async def disconnect(sid):
    for room, members in list(PRESENCE.items()):
        if sid in members:
            members.pop(sid, None)
            await sio.emit("presence", {"issue_id": int(room), "viewers": list(members.values())}, room=f"issue:{room}")


@sio.event
async def join_board(sid, data=None):
    await sio.enter_room(sid, "board")


@sio.event
async def join_issue(sid, data):
    issue_id = str(data.get("issue_id"))
    session = await sio.get_session(sid)
    user = session.get("user") or {}
    await sio.enter_room(sid, f"issue:{issue_id}")
    PRESENCE.setdefault(issue_id, {})[sid] = {
        "id": user.get("id"),
        "name": user.get("name"),
        "avatar": user.get("avatar"),
        "typing": False,
    }
    await sio.emit("presence", {"issue_id": int(issue_id), "viewers": list(PRESENCE[issue_id].values())}, room=f"issue:{issue_id}")


@sio.event
async def leave_issue(sid, data):
    issue_id = str(data.get("issue_id"))
    await sio.leave_room(sid, f"issue:{issue_id}")
    PRESENCE.get(issue_id, {}).pop(sid, None)
    await sio.emit("presence", {"issue_id": int(issue_id), "viewers": list(PRESENCE.get(issue_id, {}).values())}, room=f"issue:{issue_id}")


@sio.event
async def typing(sid, data):
    issue_id = str(data.get("issue_id"))
    if sid in PRESENCE.get(issue_id, {}):
        PRESENCE[issue_id][sid]["typing"] = bool(data.get("typing"))
        await sio.emit("presence", {"issue_id": int(issue_id), "viewers": list(PRESENCE[issue_id].values())}, room=f"issue:{issue_id}")


async def broadcast_issue(issue_id: int, event: str, payload: dict):
    await sio.emit(event, payload, room=f"issue:{issue_id}")
    await sio.emit("board_invalidate", {"issue_id": issue_id, **payload}, room="board")
