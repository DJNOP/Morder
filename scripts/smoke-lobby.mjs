import { io } from "socket.io-client";
import {
  CONNECTION_ROLES,
  HOST_CREATE_ROOM_EVENT,
  HOST_GET_NETWORK_ADDRESSES_EVENT,
  HOST_LOBBY_STATE_EVENT,
  PLAYER_JOIN_ROOM_EVENT,
  PLAYER_RECONNECT_EVENT,
} from "@morder/shared";

const serverUrl = process.env.SMOKE_SERVER_URL ?? "http://127.0.0.1:3101";
const hostUrl = process.env.SMOKE_HOST_URL ?? "http://127.0.0.1:5183";
const playerUrl = process.env.SMOKE_PLAYER_URL ?? "http://127.0.0.1:5184";
const clients = [];

const withTimeout = (operation, label, timeoutMs = 5_000) =>
  Promise.race([
    operation,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs),
    ),
  ]);

const connect = (role) =>
  withTimeout(
    new Promise((resolve, reject) => {
      const socket = io(serverUrl, {
        autoConnect: false,
        auth: { role },
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      });
      clients.push(socket);
      socket.once("connect", () => resolve(socket));
      socket.once("connect_error", reject);
      socket.connect();
    }),
    `${role} connection`,
  );

const acknowledge = (socket, eventName, ...args) =>
  withTimeout(
    new Promise((resolve) => socket.emit(eventName, ...args, resolve)),
    `${eventName} acknowledgement`,
  );

const waitForEvent = (socket, eventName, predicate = () => true) =>
  withTimeout(
    new Promise((resolve) => {
      const listener = (payload) => {
        if (!predicate(payload)) {
          return;
        }
        socket.off(eventName, listener);
        resolve(payload);
      };
      socket.on(eventName, listener);
    }),
    eventName,
  );

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const expectSuccess = (result, label) => {
  assert(result?.ok === true, `${label} failed: ${JSON.stringify(result)}`);
  return result;
};

try {
  for (const [url, label] of [
    [hostUrl, "host page"],
    [playerUrl, "player page"],
  ]) {
    const response = await withTimeout(fetch(url), `${label} fetch`);
    assert(response.ok, `${label} returned HTTP ${response.status}.`);
  }

  const hostOne = await connect(CONNECTION_ROLES.host);
  const hostTwo = await connect(CONNECTION_ROLES.host);
  const addresses = await acknowledge(
    hostOne,
    HOST_GET_NETWORK_ADDRESSES_EVENT,
  );
  assert(addresses.ok, "Host could not read LAN address candidates.");

  const roomOne = expectSuccess(
    await acknowledge(hostOne, HOST_CREATE_ROOM_EVENT),
    "first room creation",
  ).lobby;
  const roomTwo = expectSuccess(
    await acknowledge(hostTwo, HOST_CREATE_ROOM_EVENT),
    "second room creation",
  ).lobby;
  assert(roomOne.roomCode !== roomTwo.roomCode, "Rooms reused the same code.");

  const roomOnePlayers = [];
  for (let index = 1; index <= 5; index += 1) {
    const player = await connect(CONNECTION_ROLES.player);
    const lobbyUpdate = waitForEvent(
      hostOne,
      HOST_LOBBY_STATE_EVENT,
      (lobby) => lobby.players.length === index,
    );
    const joined = expectSuccess(
      await acknowledge(player, PLAYER_JOIN_ROOM_EVENT, {
        roomCode: roomOne.roomCode,
        displayName: `Player ${index}`,
      }),
      `player ${index} join`,
    );
    roomOnePlayers.push({ socket: player, session: joined.session });
    await lobbyUpdate;
  }

  const isolatedPlayer = await connect(CONNECTION_ROLES.player);
  const isolatedLobby = waitForEvent(
    hostTwo,
    HOST_LOBBY_STATE_EVENT,
    (lobby) => lobby.players.length === 1,
  );
  expectSuccess(
    await acknowledge(isolatedPlayer, PLAYER_JOIN_ROOM_EVENT, {
      roomCode: roomTwo.roomCode,
      displayName: "Isolated",
    }),
    "isolated room join",
  );
  const roomTwoState = await isolatedLobby;
  assert(
    roomTwoState.players.every((player) => player.displayName === "Isolated"),
    "Room isolation failed.",
  );

  const invalidPlayer = await connect(CONNECTION_ROLES.player);
  const invalidJoin = await acknowledge(invalidPlayer, PLAYER_JOIN_ROOM_EVENT, {
    roomCode: "WXYZ",
    displayName: "Missing room",
  });
  assert(
    invalidJoin.ok === false && invalidJoin.error.code === "room_not_found",
    "Invalid-room join was not rejected.",
  );

  const original = roomOnePlayers[0];
  assert(original, "The first room player was not retained for reconnect.");
  const disconnectedLobby = waitForEvent(
    hostOne,
    HOST_LOBBY_STATE_EVENT,
    (lobby) => lobby.players[0]?.connectionState === "disconnected",
  );
  original.socket.disconnect();
  const disconnectedState = await disconnectedLobby;
  const originalId = disconnectedState.players[0].id;

  const replacement = await connect(CONNECTION_ROLES.player);
  const reconnectedLobby = waitForEvent(
    hostOne,
    HOST_LOBBY_STATE_EVENT,
    (lobby) => lobby.players[0]?.connectionState === "connected",
  );
  const restoredSession = expectSuccess(
    await acknowledge(replacement, PLAYER_RECONNECT_EVENT, {
      reconnectToken: original.session.reconnectToken,
    }),
    "reconnect proof",
  );
  const restoredLobby = await reconnectedLobby;
  assert(restoredSession.session.self.id === originalId, "Reconnect changed identity.");
  assert(restoredLobby.players.length === 5, "Reconnect created a duplicate player.");

  console.log(
    `Smoke passed: pages reachable, ${roomOne.roomCode}/${roomTwo.roomCode} isolated, five-player lobby accepted, invalid room rejected.`,
  );
} finally {
  for (const client of clients) {
    client.disconnect();
  }
}
