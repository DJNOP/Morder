import {
  HOST_CREATE_ROOM_EVENT,
  HOST_LOCK_ROOM_EVENT,
  HOST_LOBBY_STATE_EVENT,
  PLAYER_JOIN_ROOM_EVENT,
  PLAYER_PHOTO_UPLOAD_EVENT,
  PLAYER_RECONNECT_EVENT,
  PLAYER_STATE_EVENT,
  type ClientToServerEvents,
  type PrivatePlayerState,
  type PublicLobbyProjection,
  type ServerToClientEvents,
} from "../src/index.js";
// @ts-expect-error Internal authoritative room records are not shared wire types.
import type { RoomRecord } from "../src/index.js";

const createRoom: ClientToServerEvents[typeof HOST_CREATE_ROOM_EVENT] = (
  acknowledge,
) =>
  acknowledge({
    ok: true,
    lobby: {
      roomCode: "ABCD",
      roomStatus: "open",
      players: [],
      roleSetup: null,
      game: null,
    },
  });

const lockRoom: ClientToServerEvents[typeof HOST_LOCK_ROOM_EVENT] = (
  acknowledge,
) =>
  acknowledge({
    ok: true,
    lobby: {
      roomCode: "ABCD",
      roomStatus: "locked",
      players: [],
      roleSetup: null,
      game: null,
    },
  });

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

const uploadPhoto: ClientToServerEvents[typeof PLAYER_PHOTO_UPLOAD_EVENT] = (
  request,
  acknowledge,
) => {
  request.data.byteLength.toFixed(0);
  acknowledge({
    ok: false,
    error: { code: "photo_too_large", message: "Photo too large." },
  });
};

const receiveLobby: ServerToClientEvents[typeof HOST_LOBBY_STATE_EVENT] = (
  lobby,
) => lobby.players.length.toFixed(0);

const receivePlayerState: ServerToClientEvents[typeof PLAYER_STATE_EVENT] = (
  state,
) => state.self.photoVersion?.toFixed(0);

const publicLobby: PublicLobbyProjection = {
  roomCode: "ABCD",
  roomStatus: "open",
  players: [
    {
      id: "player-id",
      displayName: "Ada",
      connectionState: "connected",
      photoVersion: 1,
      lifeState: "alive",
    },
  ],
  roleSetup: null,
  game: null,
};

const privatePlayerState: PrivatePlayerState = {
  roomCode: "ABCD",
  roomStatus: "locked",
  self: {
    id: "player-id",
    displayName: "Ada",
    connectionState: "connected",
    photoVersion: 1,
    lifeState: "alive",
  },
  game: { phase: "discussion", round: 1 },
};

void createRoom;
void lockRoom;
void joinRoom;
void reconnect;
void uploadPhoto;
void receiveLobby;
void receivePlayerState;
void publicLobby;
void privatePlayerState;
void (null as unknown as RoomRecord);
