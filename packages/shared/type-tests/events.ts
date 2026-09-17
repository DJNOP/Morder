import {
  HOST_CREATE_ROOM_EVENT,
  HOST_LOBBY_STATE_EVENT,
  PLAYER_JOIN_ROOM_EVENT,
  PLAYER_RECONNECT_EVENT,
  type ClientToServerEvents,
  type PublicLobbyProjection,
  type ServerToClientEvents,
} from "../src/index.js";

const createRoom: ClientToServerEvents[typeof HOST_CREATE_ROOM_EVENT] = (
  acknowledge,
) => acknowledge({ ok: true, lobby: { roomCode: "ABCD", players: [] } });

const joinRoom: ClientToServerEvents[typeof PLAYER_JOIN_ROOM_EVENT] = (
  request,
  acknowledge,
) => {
  request.displayName.toUpperCase();
  acknowledge({
    ok: false,
    error: { code: "room_not_found", message: "Room not found." },
  });
};

const reconnect: ClientToServerEvents[typeof PLAYER_RECONNECT_EVENT] = (
  request,
  acknowledge,
) => {
  request.reconnectToken.toUpperCase();
  acknowledge({
    ok: false,
    error: { code: "invalid_reconnect_token", message: "Session unavailable." },
  });
};

const receiveLobby: ServerToClientEvents[typeof HOST_LOBBY_STATE_EVENT] = (
  lobby,
) => lobby.players.length.toFixed(0);

const publicLobby: PublicLobbyProjection = {
  roomCode: "ABCD",
  players: [
    {
      id: "player-id",
      displayName: "Ada",
      connectionState: "connected",
    },
  ],
};

void createRoom;
void joinRoom;
void reconnect;
void receiveLobby;
void publicLobby;
