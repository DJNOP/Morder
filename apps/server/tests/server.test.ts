import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import {
  CONNECTION_ROLES,
  HOST_CREATE_ROOM_EVENT,
  HOST_GET_NETWORK_ADDRESSES_EVENT,
  HOST_LOBBY_STATE_EVENT,
  PLAYER_JOIN_ROOM_EVENT,
  PLAYER_RECONNECT_EVENT,
  PLAYER_ROOM_CLOSED_EVENT,
  type ClientToServerEvents,
  type ConnectionRole,
  type CreateRoomResult,
  type JoinRoomResult,
  type PlayerSession,
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

const startServer = async (): Promise<RunningServer> => {
  let roomCodeIndex = 0;
  let playerIndex = 0;
  let tokenIndex = 0;
  const roomCodes = ["ABCD", "EFGH", "JKLM"];
  const roomManager = new RoomManager({
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
});
