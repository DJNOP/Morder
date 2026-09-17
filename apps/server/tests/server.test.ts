import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import {
  CONNECTION_ROLES,
  HOST_CONFIGURE_ROLES_EVENT,
  HOST_CREATE_ROOM_EVENT,
  HOST_GET_NETWORK_ADDRESSES_EVENT,
  HOST_LOCK_ROOM_EVENT,
  HOST_LOBBY_STATE_EVENT,
  HOST_START_GAME_EVENT,
  HOST_START_VOTING_EVENT,
  PLAYER_CONFIRM_SELECTION_EVENT,
  PLAYER_PHOTO_CONTENT_TYPE,
  PLAYER_PHOTO_MAX_BYTES,
  PLAYER_PHOTO_UPLOAD_EVENT,
  PLAYER_JOIN_ROOM_EVENT,
  PLAYER_RECONNECT_EVENT,
  PLAYER_ROOM_CLOSED_EVENT,
  PLAYER_SELECT_TARGET_EVENT,
  PLAYER_STATE_EVENT,
  type ClientToServerEvents,
  type ConnectionRole,
  type CreateRoomResult,
  type HostGameCommandResult,
  type JoinRoomResult,
  type LockRoomResult,
  type PlayerPhotoUploadResult,
  type PlayerGameCommandResult,
  type PlayerSession,
  type PrivatePlayerState,
  type PublicLobbyProjection,
  type ReconnectPlayerResult,
  type RoomClosedNotice,
  type ServerToClientEvents,
} from "@morder/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRealtimeServer } from "../src/create-server.js";
import { RoomManager } from "../src/room-manager.js";

type TypedClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

interface RunningServer {
  url: string;
  httpServer: HttpServer;
  io: ReturnType<typeof createRealtimeServer>["io"];
  dispose: () => void;
}

const clients: TypedClient[] = [];
let runningServer: RunningServer | undefined;

const startServer = async (providedRoomManager?: RoomManager): Promise<RunningServer> => {
  let roomCodeIndex = 0;
  let playerIndex = 0;
  let tokenIndex = 0;
  const roomCodes = ["ABCD", "EFGH", "JKLM"];
  const roomManager = providedRoomManager ?? new RoomManager({
    createRoomCode: () => roomCodes[roomCodeIndex++] ?? "WXYZ",
    createPlayerId: () => `player-${++playerIndex}`,
    createReconnectToken: () => `token-${String(++tokenIndex).padStart(26, "0")}`,
  });
  const httpServer = createServer();
  const realtime = createRealtimeServer(httpServer, {
    roomManager,
    getNetworkAddresses: () => [
      { address: "192.168.1.42", isPrivate: true },
    ],
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", resolve);
  });
  const address = httpServer.address() as AddressInfo;
  runningServer = {
    url: `http://127.0.0.1:${address.port}`,
    httpServer,
    io: realtime.io,
    dispose: realtime.dispose,
  };
  return runningServer;
};

const connectClient = (url: string, role: ConnectionRole) =>
  new Promise<TypedClient>((resolve, reject) => {
    const client: TypedClient = createClient(url, {
      autoConnect: false,
      auth: { role },
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    clients.push(client);
    client.once("connect", () => resolve(client));
    client.once("connect_error", reject);
    client.connect();
  });

const createRoom = (client: TypedClient) =>
  new Promise<CreateRoomResult>((resolve) =>
    client.emit(HOST_CREATE_ROOM_EVENT, resolve),
  );

const joinRoom = (
  client: TypedClient,
  roomCode: string,
  displayName: string,
) =>
  new Promise<JoinRoomResult>((resolve) =>
    client.emit(PLAYER_JOIN_ROOM_EVENT, { roomCode, displayName }, resolve),
  );

const reconnect = (client: TypedClient, reconnectToken: string) =>
  new Promise<ReconnectPlayerResult>((resolve) =>
    client.emit(PLAYER_RECONNECT_EVENT, { reconnectToken }, resolve),
  );

const lockRoom = (client: TypedClient) =>
  new Promise<LockRoomResult>((resolve) =>
    client.emit(HOST_LOCK_ROOM_EVENT, resolve),
  );

const configureRoles = (
  client: TypedClient,
  counts: { civilian: number; murderer: number; doctor: number; sheriff: number },
) =>
  new Promise<HostGameCommandResult>((resolve) =>
    client.emit(HOST_CONFIGURE_ROLES_EVENT, { counts }, resolve),
  );

const startGame = (client: TypedClient) =>
  new Promise<HostGameCommandResult>((resolve) =>
    client.emit(HOST_START_GAME_EVENT, resolve),
  );

const startVoting = (client: TypedClient) =>
  new Promise<HostGameCommandResult>((resolve) =>
    client.emit(HOST_START_VOTING_EVENT, resolve),
  );

const selectTarget = (client: TypedClient, targetPlayerId: string) =>
  new Promise<PlayerGameCommandResult>((resolve) =>
    client.emit(PLAYER_SELECT_TARGET_EVENT, { targetPlayerId }, resolve),
  );

const confirmSelection = (client: TypedClient) =>
  new Promise<PlayerGameCommandResult>((resolve) =>
    client.emit(PLAYER_CONFIRM_SELECTION_EVENT, resolve),
  );

const uploadPhoto = (client: TypedClient, data: ArrayBuffer) =>
  new Promise<PlayerPhotoUploadResult>((resolve) =>
    client.emit(
      PLAYER_PHOTO_UPLOAD_EVENT,
      { contentType: PLAYER_PHOTO_CONTENT_TYPE, data },
      resolve,
    ),
  );

const jpeg = (...payload: number[]) =>
  Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...payload, 0xff, 0xd9]);

const asArrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

const waitForEvent = <Payload>(
  socket: TypedClient,
  eventName: string,
  predicate: (payload: Payload) => boolean = () => true,
) =>
  new Promise<Payload>((resolve, reject) => {
    const eventSocket = socket as unknown as {
      on: (name: string, listener: (payload: unknown) => void) => void;
      off: (name: string, listener: (payload: unknown) => void) => void;
    };
    const timeout = setTimeout(() => {
      eventSocket.off(eventName, listener);
      reject(new Error(`Timed out waiting for ${eventName}.`));
    }, 2_000);
    const listener = (value: unknown) => {
      const payload = value as Payload;
      if (!predicate(payload)) {
        return;
      }
      clearTimeout(timeout);
      eventSocket.off(eventName, listener);
      resolve(payload);
    };
    eventSocket.on(eventName, listener);
  });

const expectCreated = (result: CreateRoomResult): PublicLobbyProjection => {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("Expected room creation to succeed.");
  }
  return result.lobby;
};

const expectJoined = (result: JoinRoomResult): PlayerSession => {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("Expected room join to succeed.");
  }
  return result.session;
};

afterEach(async () => {
  for (const client of clients.splice(0)) {
    client.disconnect();
  }
  if (runningServer) {
    await new Promise<void>((resolve) => runningServer?.io.close(() => resolve()));
    runningServer.dispose();
    if (runningServer.httpServer.listening) {
      await new Promise<void>((resolve) => runningServer?.httpServer.close(() => resolve()));
    }
    runningServer = undefined;
  }
});

describe("Morder lobby Socket.IO transport", () => {
  it("exposes detected local addresses only to hosts", async () => {
    const server = await startServer();
    const host = await connectClient(server.url, CONNECTION_ROLES.host);
    const player = await connectClient(server.url, CONNECTION_ROLES.player);

    await expect(
      new Promise((resolve) =>
        host.emit(HOST_GET_NETWORK_ADDRESSES_EVENT, resolve),
      ),
    ).resolves.toEqual({
      ok: true,
      addresses: [{ address: "192.168.1.42", isPrivate: true }],
    });
    await expect(
      new Promise((resolve) =>
        player.emit(HOST_GET_NETWORK_ADDRESSES_EVENT, resolve),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "not_authorized" },
    });
  });

  it("creates isolated rooms and routes public lobby projections only to their hosts", async () => {
    const server = await startServer();
    const hostOne = await connectClient(server.url, CONNECTION_ROLES.host);
    const hostTwo = await connectClient(server.url, CONNECTION_ROLES.host);
    const playerOne = await connectClient(server.url, CONNECTION_ROLES.player);
    const playerTwo = await connectClient(server.url, CONNECTION_ROLES.player);
    const roomOne = expectCreated(await createRoom(hostOne));
    const roomTwo = expectCreated(await createRoom(hostTwo));

    const hostOneLobby = waitForEvent<PublicLobbyProjection>(
      hostOne,
      HOST_LOBBY_STATE_EVENT,
      (lobby) => lobby.players.length === 1,
    );
    const sessionOne = expectJoined(
      await joinRoom(playerOne, roomOne.roomCode, "Ada"),
    );
    const firstLobby = await hostOneLobby;
    expect(firstLobby.players.map((player) => player.displayName)).toEqual([
      "Ada",
    ]);
    expect(JSON.stringify(firstLobby)).not.toContain(sessionOne.reconnectToken);
    expect(JSON.stringify(firstLobby)).not.toContain("reconnectToken");
    expect(JSON.stringify(firstLobby)).not.toContain("bytes");

    const hostTwoLobby = waitForEvent<PublicLobbyProjection>(
      hostTwo,
      HOST_LOBBY_STATE_EVENT,
      (lobby) => lobby.players.length === 1,
    );
    expectJoined(await joinRoom(playerTwo, roomTwo.roomCode, "Grace"));
    expect((await hostTwoLobby).players.map((player) => player.displayName)).toEqual([
      "Grace",
    ]);
    expect(firstLobby.players.map((player) => player.displayName)).not.toContain(
      "Grace",
    );
  });

  it("rejects invalid rooms, malformed joins, and wrong connection roles", async () => {
    const server = await startServer();
    const host = await connectClient(server.url, CONNECTION_ROLES.host);
    const player = await connectClient(server.url, CONNECTION_ROLES.player);

    await expect(joinRoom(player, "WXYZ", "Ada")).resolves.toMatchObject({
      ok: false,
      error: { code: "room_not_found" },
    });
    await expect(joinRoom(host, "ABCD", "Ada")).resolves.toMatchObject({
      ok: false,
      error: { code: "not_authorized" },
    });
    await expect(createRoom(player)).resolves.toMatchObject({
      ok: false,
      error: { code: "not_authorized" },
    });

    const malformed = await new Promise<JoinRoomResult>((resolve) => {
      player.emit(
        PLAYER_JOIN_ROOM_EVENT,
        // @ts-expect-error Deliberately verify runtime validation.
        { roomCode: "ABCD" },
        resolve,
      );
    });
    expect(malformed).toMatchObject({
      ok: false,
      error: { code: "invalid_room_code" },
    });
  });

  it("shows disconnects and restores the same player identity", async () => {
    const server = await startServer();
    const host = await connectClient(server.url, CONNECTION_ROLES.host);
    const originalPlayer = await connectClient(
      server.url,
      CONNECTION_ROLES.player,
    );
    const room = expectCreated(await createRoom(host));
    const joinedLobby = waitForEvent<PublicLobbyProjection>(
      host,
      HOST_LOBBY_STATE_EVENT,
      (lobby) => lobby.players.length === 1,
    );
    const originalSession = expectJoined(
      await joinRoom(originalPlayer, room.roomCode, "Ada"),
    );
    await joinedLobby;

    const disconnectedLobby = waitForEvent<PublicLobbyProjection>(
      host,
      HOST_LOBBY_STATE_EVENT,
      (lobby) => lobby.players[0]?.connectionState === "disconnected",
    );
    originalPlayer.disconnect();
    await expect(disconnectedLobby).resolves.toMatchObject({
      players: [
        { id: originalSession.self.id, connectionState: "disconnected" },
      ],
    });

    const replacement = await connectClient(
      server.url,
      CONNECTION_ROLES.player,
    );
    const restoredLobby = waitForEvent<PublicLobbyProjection>(
      host,
      HOST_LOBBY_STATE_EVENT,
      (lobby) => lobby.players[0]?.connectionState === "connected",
    );
    const restored = await reconnect(replacement, originalSession.reconnectToken);
    expect(restored).toMatchObject({
      ok: true,
      session: { self: { id: originalSession.self.id, displayName: "Ada" } },
    });
    await restoredLobby;
  });

  it("uploads versioned photos separately, locks the roster, and preserves reconnect", async () => {
    const server = await startServer();
    const host = await connectClient(server.url, CONNECTION_ROLES.host);
    const player = await connectClient(server.url, CONNECTION_ROLES.player);
    const room = expectCreated(await createRoom(host));
    const session = expectJoined(await joinRoom(player, room.roomCode, "Ada"));

    const photoLobby = waitForEvent<PublicLobbyProjection>(
      host,
      HOST_LOBBY_STATE_EVENT,
      (lobby) => lobby.players[0]?.photoVersion === 1,
    );
    await expect(
      uploadPhoto(player, asArrayBuffer(jpeg(1, 2, 3))),
    ).resolves.toMatchObject({
      ok: true,
      playerState: { roomStatus: "open", self: { photoVersion: 1 } },
    });
    const projected = await photoLobby;
    expect(JSON.stringify(projected)).not.toContain("bytes");
    expect(JSON.stringify(projected)).not.toContain(session.reconnectToken);

    const photoUrl = `${server.url}/rooms/${room.roomCode}/players/${session.self.id}/photo?v=1`;
    const photoResponse = await fetch(photoUrl);
    expect(photoResponse.status).toBe(200);
    expect(photoResponse.headers.get("content-type")).toBe("image/jpeg");
    expect(photoResponse.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await photoResponse.arrayBuffer())).toEqual(
      jpeg(1, 2, 3),
    );
    await expect(
      fetch(`${server.url}/rooms/EFGH/players/${session.self.id}/photo`),
    ).resolves.toMatchObject({ status: 404 });
    await expect(
      fetch(`${server.url}/rooms/${room.roomCode}/players/missing/photo`),
    ).resolves.toMatchObject({ status: 404 });

    await expect(
      uploadPhoto(player, new ArrayBuffer(PLAYER_PHOTO_MAX_BYTES + 1)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "photo_too_large" },
    });

    const replacementLobby = waitForEvent<PublicLobbyProjection>(
      host,
      HOST_LOBBY_STATE_EVENT,
      (lobby) => lobby.players[0]?.photoVersion === 2,
    );
    await expect(
      uploadPhoto(player, asArrayBuffer(jpeg(9, 8, 7))),
    ).resolves.toMatchObject({
      ok: true,
      playerState: { self: { photoVersion: 2 } },
    });
    await replacementLobby;

    const lockedPlayerState = waitForEvent<PrivatePlayerState>(
      player,
      PLAYER_STATE_EVENT,
      (state) => state.roomStatus === "locked",
    );
    await expect(lockRoom(host)).resolves.toMatchObject({
      ok: true,
      lobby: { roomStatus: "locked" },
    });
    const privateLockedState = await lockedPlayerState;
    expect(privateLockedState).toMatchObject({
      roomCode: room.roomCode,
      roomStatus: "locked",
      self: { id: session.self.id, photoVersion: 2 },
    });
    expect(Object.keys(privateLockedState).sort()).toEqual([
      "game",
      "roomCode",
      "roomStatus",
      "self",
    ]);
    expect(JSON.stringify(privateLockedState)).not.toContain("reconnectToken");
    expect(JSON.stringify(privateLockedState)).not.toContain("players");

    const newcomer = await connectClient(server.url, CONNECTION_ROLES.player);
    await expect(joinRoom(newcomer, room.roomCode, "Grace")).resolves.toMatchObject({
      ok: false,
      error: { code: "room_locked" },
    });
    await expect(
      uploadPhoto(player, asArrayBuffer(jpeg(4))),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "room_locked" },
    });

    player.disconnect();
    const restoredPlayer = await connectClient(
      server.url,
      CONNECTION_ROLES.player,
    );
    await expect(
      reconnect(restoredPlayer, session.reconnectToken),
    ).resolves.toMatchObject({
      ok: true,
      session: {
        roomStatus: "locked",
        self: { id: session.self.id, photoVersion: 2 },
      },
    });

    host.disconnect();
    await vi.waitFor(async () => {
      expect((await fetch(photoUrl)).status).toBe(404);
    });
  });

  it("notifies players and invalidates sessions when the host disconnects", async () => {
    const server = await startServer();
    const host = await connectClient(server.url, CONNECTION_ROLES.host);
    const player = await connectClient(server.url, CONNECTION_ROLES.player);
    const room = expectCreated(await createRoom(host));
    const session = expectJoined(await joinRoom(player, room.roomCode, "Ada"));
    const notice = waitForEvent<RoomClosedNotice>(
      player,
      PLAYER_ROOM_CLOSED_EVENT,
    );

    host.disconnect();

    await expect(notice).resolves.toEqual({
      roomCode: room.roomCode,
      reason: "host_disconnected",
      message: "The host disconnected, so the room has closed.",
    });
    const replacement = await connectClient(
      server.url,
      CONNECTION_ROLES.player,
    );
    await expect(reconnect(replacement, session.reconnectToken)).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_reconnect_token" },
    });
  });

  it("replaces a duplicate reconnect socket", async () => {
    const server = await startServer();
    const host = await connectClient(server.url, CONNECTION_ROLES.host);
    const originalPlayer = await connectClient(
      server.url,
      CONNECTION_ROLES.player,
    );
    const room = expectCreated(await createRoom(host));
    const session = expectJoined(
      await joinRoom(originalPlayer, room.roomCode, "Ada"),
    );
    const originalDisconnect = vi.fn();
    originalPlayer.on("disconnect", originalDisconnect);

    const replacement = await connectClient(
      server.url,
      CONNECTION_ROLES.player,
    );
    await expect(reconnect(replacement, session.reconnectToken)).resolves.toMatchObject({
      ok: true,
    });

    await vi.waitFor(() => expect(originalDisconnect).toHaveBeenCalledOnce());
  });

  it("runs the four-role loop with authoritative public and private projections", async () => {
    let now = 10_000;
    let timerId = 0;
    let pendingTimer: { callback: () => void; delayMs: number } | null = null;
    const roomManager = new RoomManager({
      createRoomCode: () => "ABCD",
      createPlayerId: (() => {
        let index = 0;
        return () => `player-${++index}`;
      })(),
      createReconnectToken: (() => {
        let index = 0;
        return () => `token-${String(++index).padStart(26, "0")}`;
      })(),
      now: () => now,
      random: () => 0.999,
      schedule: (callback, delayMs) => {
        pendingTimer = { callback, delayMs };
        return ++timerId as unknown as ReturnType<typeof setTimeout>;
      },
      cancelSchedule: () => {
        pendingTimer = null;
      },
    });
    const advanceTimer = (expectedDelayMs: number) => {
      const timer = pendingTimer as { callback: () => void; delayMs: number } | null;
      expect(timer?.delayMs).toBe(expectedDelayMs);
      pendingTimer = null;
      now += expectedDelayMs;
      timer?.callback();
    };

    const server = await startServer(roomManager);
    const host = await connectClient(server.url, CONNECTION_ROLES.host);
    const playerSockets = await Promise.all(
      Array.from({ length: 4 }, () =>
        connectClient(server.url, CONNECTION_ROLES.player),
      ),
    );
    const room = expectCreated(await createRoom(host));
    const sessions: PlayerSession[] = [];
    for (const [index, socket] of playerSockets.entries()) {
      sessions.push(
        expectJoined(await joinRoom(socket, room.roomCode, `Player ${index + 1}`)),
      );
    }
    await expect(lockRoom(host)).resolves.toMatchObject({ ok: true });
    await expect(
      configureRoles(host, { murderer: 3, doctor: 0, sheriff: 0, civilian: 1 }),
    ).resolves.toMatchObject({ ok: true, lobby: { roleSetup: { valid: false } } });
    await expect(startGame(host)).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_role_configuration" },
    });
    await expect(
      configureRoles(host, { murderer: 1, doctor: 1, sheriff: 1, civilian: 1 }),
    ).resolves.toMatchObject({ ok: true, lobby: { roleSetup: { valid: true } } });

    const openingStates = playerSockets.map((socket) =>
      waitForEvent<PrivatePlayerState>(
        socket,
        PLAYER_STATE_EVENT,
        (state) => state.game?.phase === "night-actions",
      ),
    );
    const started = await startGame(host);
    expect(started).toMatchObject({
      ok: true,
      lobby: { game: { phase: "night-actions", deadline: now + 30_000 } },
    });
    const privateOpeningStates = await Promise.all(openingStates);
    expect(privateOpeningStates.map((state) =>
      state.game?.phase === "night-actions" ? state.game.role : null,
    )).toEqual(["murderer", "doctor", "sheriff", "civilian"]);

    const activePublicState = started.ok ? started.lobby : null;
    expect(activePublicState?.game).toEqual({
      phase: "night-actions",
      round: 1,
      deadline: now + 30_000,
    });
    expect(activePublicState?.players.every((player) => !("role" in player))).toBe(true);
    expect(JSON.stringify(activePublicState?.game)).not.toMatch(
      /role|selection|target|investigation/i,
    );

    await expect(selectTarget(playerSockets[0]!, sessions[3]!.self.id)).resolves.toMatchObject({ ok: true });
    await expect(confirmSelection(playerSockets[0]!)).resolves.toMatchObject({ ok: true });
    await expect(selectTarget(playerSockets[1]!, sessions[3]!.self.id)).resolves.toMatchObject({ ok: true });
    await expect(confirmSelection(playerSockets[1]!)).resolves.toMatchObject({ ok: true });
    await expect(selectTarget(playerSockets[2]!, sessions[0]!.self.id)).resolves.toMatchObject({ ok: true });
    await expect(confirmSelection(playerSockets[2]!)).resolves.toMatchObject({ ok: true });

    const hostNightResult = waitForEvent<PublicLobbyProjection>(
      host,
      HOST_LOBBY_STATE_EVENT,
      (lobby) => lobby.game?.phase === "night-result",
    );
    const sheriffNightResult = waitForEvent<PrivatePlayerState>(
      playerSockets[2]!,
      PLAYER_STATE_EVENT,
      (state) => state.game?.phase === "night-result",
    );
    const civilianNightResult = waitForEvent<PrivatePlayerState>(
      playerSockets[3]!,
      PLAYER_STATE_EVENT,
      (state) => state.game?.phase === "night-result",
    );
    advanceTimer(30_000);
    expect((await hostNightResult).game).toEqual({
      phase: "night-result",
      round: 1,
      deadline: now + 6_000,
    });
    expect((await sheriffNightResult).game).toMatchObject({
      phase: "night-result",
      investigation: { player: { id: sessions[0]!.self.id }, role: "murderer" },
    });
    expect((await civilianNightResult).game).toEqual({
      phase: "night-result",
      round: 1,
      deadline: now + 6_000,
    });

    const morningStates = playerSockets.map((socket) =>
      waitForEvent<PrivatePlayerState>(
        socket,
        PLAYER_STATE_EVENT,
        (state) => state.game?.phase === "morning",
      ),
    );
    advanceTimer(6_000);
    const privateMorningStates = await Promise.all(morningStates);
    expect(privateMorningStates.map((state) => state.game)).toEqual(
      Array(4).fill({
        phase: "morning",
        round: 1,
        deadline: now + 6_000,
        outcome: { kind: "no-death" },
      }),
    );

    const discussionStates = playerSockets.map((socket) =>
      waitForEvent<PrivatePlayerState>(
        socket,
        PLAYER_STATE_EVENT,
        (state) => state.game?.phase === "discussion",
      ),
    );
    advanceTimer(6_000);
    const privateDiscussionStates = await Promise.all(discussionStates);
    expect(privateDiscussionStates.map((state) => state.game)).toEqual(
      Array(4).fill({ phase: "discussion", round: 1 }),
    );

    const votingStates = playerSockets.map((socket) =>
      waitForEvent<PrivatePlayerState>(
        socket,
        PLAYER_STATE_EVENT,
        (state) => state.game?.phase === "voting",
      ),
    );
    const votingStarted = await startVoting(host);
    expect(votingStarted).toMatchObject({
      ok: true,
      lobby: { game: { phase: "voting" } },
    });
    if (votingStarted.ok) {
      expect(votingStarted.lobby.game).toEqual({
        phase: "voting",
        round: 1,
        deadline: now + 30_000,
      });
      expect(JSON.stringify(votingStarted.lobby.game)).not.toMatch(
        /role|selection|target|ballot|investigation/i,
      );
    }
    await Promise.all(votingStates);

    for (const socket of playerSockets) {
      await expect(selectTarget(socket, sessions[0]!.self.id)).resolves.toMatchObject({ ok: true });
      await expect(confirmSelection(socket)).resolves.toMatchObject({ ok: true });
    }

    playerSockets[3]!.disconnect();
    const reconnectedCivilian = await connectClient(server.url, CONNECTION_ROLES.player);
    const restored = await reconnect(reconnectedCivilian, sessions[3]!.reconnectToken);
    expect(restored).toMatchObject({
      ok: true,
      session: {
        self: { id: sessions[3]!.self.id },
        game: {
          phase: "voting",
          ownSelection: sessions[0]!.self.id,
          confirmed: true,
        },
      },
    });
    if (restored.ok && restored.session.game?.phase === "voting") {
      expect(JSON.stringify(restored.session.game)).not.toMatch(/role|investigation/i);
    }

    const hostVoteResult = waitForEvent<PublicLobbyProjection>(
      host,
      HOST_LOBBY_STATE_EVENT,
      (lobby) => lobby.game?.phase === "vote-result",
    );
    advanceTimer(30_000);
    expect((await hostVoteResult).game).toMatchObject({
      phase: "vote-result",
      outcome: { kind: "eliminated", player: { id: sessions[0]!.self.id } },
    });

    const hostResult = waitForEvent<PublicLobbyProjection>(
      host,
      HOST_LOBBY_STATE_EVENT,
      (lobby) => lobby.game?.phase === "result",
    );
    advanceTimer(6_000);
    const finalLobby = await hostResult;
    expect(finalLobby.game).toMatchObject({
      phase: "result",
      winner: "non-murderers",
    });
    expect(finalLobby.game?.phase === "result" ? finalLobby.game.reveal : []).toHaveLength(4);
    expect(pendingTimer).toBeNull();
  });
});
