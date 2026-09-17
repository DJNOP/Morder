import { describe, expect, it, vi } from "vitest";
import type {
  PlayerSession,
  PublicLobbyProjection,
} from "@morder/shared";
import {
  PLAYER_PHOTO_CONTENT_TYPE,
  PLAYER_PHOTO_MAX_BYTES,
} from "@morder/shared";
import { RoomManager, type RoomManagerEvent } from "../src/room-manager.js";

const createManager = (roomCodes = ["ABCD", "EFGH"]) => {
  let roomCodeIndex = 0;
  let playerIndex = 0;
  let tokenIndex = 0;
  return new RoomManager({
    createRoomCode: () => roomCodes[roomCodeIndex++] ?? "WXYZ",
    createPlayerId: () => `player-${++playerIndex}`,
    createReconnectToken: () => `token-${String(++tokenIndex).padStart(26, "0")}`,
  });
};

const createRoom = (manager: RoomManager, hostSocketId = "host-1") => {
  const result = manager.createRoom(hostSocketId);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("Expected room creation to succeed.");
  }
  return result.lobby;
};

const joinRoom = (
  manager: RoomManager,
  socketId: string,
  displayName: string,
  roomCode = "ABCD",
): PlayerSession => {
  const result = manager.joinRoom(socketId, { roomCode, displayName });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("Expected room join to succeed.");
  }
  return result.session;
};

const latestLobby = (events: RoomManagerEvent[]): PublicLobbyProjection => {
  const event = [...events]
    .reverse()
    .find((candidate) => candidate.type === "lobby-updated");
  if (!event || event.type !== "lobby-updated") {
    throw new Error("Expected a lobby update.");
  }
  return event.lobby;
};

const jpeg = (...payload: number[]) =>
  Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...payload, 0xff, 0xd9]);

describe("RoomManager", () => {
  it("creates one room owned by a host", () => {
    const manager = createManager();
    expect(manager.createRoom("host-1")).toEqual({
      ok: true,
      lobby: { roomCode: "ABCD", roomStatus: "open", players: [] },
    });
    expect(manager.createRoom("host-1")).toMatchObject({
      ok: false,
      error: { code: "host_already_has_room" },
    });
  });

  it("joins normalized rooms and rejects invalid or nonexistent rooms", () => {
    const manager = createManager();
    createRoom(manager);

    expect(
      manager.joinRoom("player-1", { roomCode: " abcd ", displayName: " Ada " }),
    ).toMatchObject({
      ok: true,
      session: {
        roomCode: "ABCD",
        self: { displayName: "Ada", connectionState: "connected" },
      },
    });
    expect(
      manager.joinRoom("player-2", { roomCode: "ABC!", displayName: "Grace" }),
    ).toMatchObject({ ok: false, error: { code: "invalid_room_code" } });
    expect(
      manager.joinRoom("player-3", { roomCode: "WXYZ", displayName: "Lin" }),
    ).toMatchObject({ ok: false, error: { code: "room_not_found" } });
  });

  it("rejects invalid and duplicate display names", () => {
    const manager = createManager();
    createRoom(manager);
    joinRoom(manager, "player-1", "Ada");

    expect(
      manager.joinRoom("player-2", { roomCode: "ABCD", displayName: "  " }),
    ).toMatchObject({ ok: false, error: { code: "invalid_display_name" } });
    expect(
      manager.joinRoom("player-3", { roomCode: "ABCD", displayName: "ada" }),
    ).toMatchObject({ ok: false, error: { code: "duplicate_display_name" } });
  });

  it("supports more than four players without a fixed lobby capacity", () => {
    const manager = createManager();
    createRoom(manager);

    for (let index = 1; index <= 8; index += 1) {
      joinRoom(manager, `socket-${index}`, `Player ${index}`);
    }

    expect(manager.getLobbyForHost("host-1")?.players).toHaveLength(8);
  });

  it("never exposes reconnect capabilities in the public host projection", () => {
    const manager = createManager();
    createRoom(manager);
    const session = joinRoom(manager, "player-1", "Ada");

    const serializedLobby = JSON.stringify(manager.getLobbyForHost("host-1"));
    expect(serializedLobby).not.toContain(session.reconnectToken);
    expect(serializedLobby).not.toContain("reconnectToken");
    expect(serializedLobby).not.toContain("bytes");
  });

  it("stores valid photos by player, exposes only a version, and preserves them on reconnect", () => {
    const manager = createManager();
    createRoom(manager);
    const session = joinRoom(manager, "player-old", "Ada");

    expect(
      manager.updatePlayerPhoto(
        "player-old",
        PLAYER_PHOTO_CONTENT_TYPE,
        jpeg(1, 2, 3),
      ),
    ).toMatchObject({
      ok: true,
      playerState: { self: { photoVersion: 1 } },
    });
    const firstLobby = manager.getLobbyForHost("host-1");
    expect(firstLobby?.players[0]?.photoVersion).toBe(1);
    expect(JSON.stringify(firstLobby)).not.toContain("bytes");
    expect(manager.getPlayerPhoto("ABCD", session.self.id)).toMatchObject({
      contentType: PLAYER_PHOTO_CONTENT_TYPE,
      version: 1,
    });

    manager.handleDisconnect("player-old");
    const restored = manager.reconnectPlayer(
      "player-new",
      session.reconnectToken,
    );
    expect(restored.result).toMatchObject({
      ok: true,
      session: { self: { id: session.self.id, photoVersion: 1 } },
    });

    expect(
      manager.updatePlayerPhoto(
        "player-new",
        PLAYER_PHOTO_CONTENT_TYPE,
        jpeg(9, 8, 7),
      ),
    ).toMatchObject({
      ok: true,
      playerState: { self: { photoVersion: 2 } },
    });
    expect(manager.getPlayerPhoto("ABCD", session.self.id)).toMatchObject({
      bytes: jpeg(9, 8, 7),
      version: 2,
    });
  });

  it("rejects unsupported, malformed, and oversized photo payloads", () => {
    const manager = createManager();
    createRoom(manager);
    joinRoom(manager, "player-1", "Ada");

    expect(
      manager.updatePlayerPhoto("player-1", "image/png", jpeg()),
    ).toMatchObject({ ok: false, error: { code: "invalid_photo_type" } });
    expect(
      manager.updatePlayerPhoto(
        "player-1",
        PLAYER_PHOTO_CONTENT_TYPE,
        Uint8Array.from([1, 2, 3]),
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_photo_data" } });
    expect(
      manager.updatePlayerPhoto(
        "player-1",
        PLAYER_PHOTO_CONTENT_TYPE,
        new Uint8Array(PLAYER_PHOTO_MAX_BYTES + 1),
      ),
    ).toMatchObject({ ok: false, error: { code: "photo_too_large" } });
  });

  it("scopes photo retrieval to its room and removes bytes with the room", () => {
    const manager = createManager();
    createRoom(manager, "host-1");
    createRoom(manager, "host-2");
    const session = joinRoom(manager, "player-1", "Ada", "ABCD");
    manager.updatePlayerPhoto(
      "player-1",
      PLAYER_PHOTO_CONTENT_TYPE,
      jpeg(1),
    );

    expect(manager.getPlayerPhoto("EFGH", session.self.id)).toBeNull();
    expect(manager.getPlayerPhoto("ABCD", "missing-player")).toBeNull();
    expect(manager.getPlayerPhoto("ABCD", session.self.id)).not.toBeNull();

    manager.handleDisconnect("host-1");
    expect(manager.getPlayerPhoto("ABCD", session.self.id)).toBeNull();
  });

  it("locks one room authoritatively while preserving reconnect and room isolation", () => {
    const manager = createManager();
    createRoom(manager, "host-1");
    createRoom(manager, "host-2");

    expect(manager.lockRoom("host-1")).toMatchObject({
      ok: false,
      error: { code: "lobby_empty" },
    });
    const session = joinRoom(manager, "player-old", "Ada", "ABCD");
    manager.updatePlayerPhoto(
      "player-old",
      PLAYER_PHOTO_CONTENT_TYPE,
      jpeg(1),
    );
    expect(manager.lockRoom("host-1")).toMatchObject({
      ok: true,
      lobby: { roomStatus: "locked" },
    });
    expect(
      manager.joinRoom("new-player", { roomCode: "ABCD", displayName: "Grace" }),
    ).toMatchObject({ ok: false, error: { code: "room_locked" } });
    expect(
      manager.updatePlayerPhoto(
        "player-old",
        PLAYER_PHOTO_CONTENT_TYPE,
        jpeg(2),
      ),
    ).toMatchObject({ ok: false, error: { code: "room_locked" } });

    manager.handleDisconnect("player-old");
    expect(
      manager.reconnectPlayer("player-new", session.reconnectToken).result,
    ).toMatchObject({
      ok: true,
      session: {
        roomStatus: "locked",
        self: { id: session.self.id, photoVersion: 1 },
      },
    });
    expect(manager.getLobbyForHost("host-1")?.players).toHaveLength(1);

    expect(
      manager.joinRoom("room-two-player", {
        roomCode: "EFGH",
        displayName: "Lin",
      }),
    ).toMatchObject({ ok: true, session: { roomStatus: "open" } });
  });

  it("marks a disconnect and restores the same identity without expiring it", () => {
    const events: RoomManagerEvent[] = [];
    const manager = createManager();
    manager.subscribe((event) => events.push(event));
    createRoom(manager);
    const original = joinRoom(manager, "player-old", "Ada");

    manager.handleDisconnect("player-old");
    expect(latestLobby(events).players[0]).toMatchObject({
      id: original.self.id,
      connectionState: "disconnected",
    });

    const outcome = manager.reconnectPlayer(
      "player-new",
      original.reconnectToken,
    );
    expect(outcome.result).toMatchObject({
      ok: true,
      session: {
        roomCode: "ABCD",
        self: { id: original.self.id, displayName: "Ada" },
      },
    });
    expect(latestLobby(events).players[0]).toMatchObject({
      id: original.self.id,
      connectionState: "connected",
    });
  });

  it("replaces a duplicate reconnect socket and ignores its late disconnect", () => {
    const events: RoomManagerEvent[] = [];
    const manager = createManager();
    manager.subscribe((event) => events.push(event));
    createRoom(manager);
    const original = joinRoom(manager, "player-old", "Ada");

    const outcome = manager.reconnectPlayer(
      "player-new",
      original.reconnectToken,
    );
    expect(outcome.replacedSocketId).toBe("player-old");

    manager.handleDisconnect("player-old");
    expect(latestLobby(events).players[0]?.connectionState).toBe("connected");
  });

  it("keeps rooms isolated", () => {
    const manager = createManager();
    createRoom(manager, "host-1");
    createRoom(manager, "host-2");
    joinRoom(manager, "player-1", "Ada", "ABCD");
    joinRoom(manager, "player-2", "Grace", "EFGH");

    expect(manager.getLobbyForHost("host-1")?.players.map((player) => player.displayName)).toEqual([
      "Ada",
    ]);
    expect(manager.getLobbyForHost("host-2")?.players.map((player) => player.displayName)).toEqual([
      "Grace",
    ]);
  });

  it("closes a room and invalidates its reconnect identities with the host", () => {
    const events: RoomManagerEvent[] = [];
    const manager = createManager();
    manager.subscribe((event) => events.push(event));
    createRoom(manager);
    const session = joinRoom(manager, "player-1", "Ada");

    manager.handleDisconnect("host-1");

    expect(events.at(-1)).toEqual({
      type: "room-closed",
      roomCode: "ABCD",
      playerSocketIds: ["player-1"],
    });
    expect(
      manager.reconnectPlayer("player-new", session.reconnectToken).result,
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_reconnect_token" },
    });
  });

  it("retries room-code, player-id, and reconnect-token collisions", () => {
    const manager = createManager(["ABCD", "ABCD", "EFGH"]);
    createRoom(manager, "host-1");
    expect(manager.createRoom("host-2")).toMatchObject({
      ok: true,
      lobby: { roomCode: "EFGH" },
    });
  });

  it("supports subscriptions that can be removed", () => {
    const listener = vi.fn();
    const manager = createManager();
    const unsubscribe = manager.subscribe(listener);
    unsubscribe();
    manager.createRoom("host-1");
    expect(listener).not.toHaveBeenCalled();
  });
});
