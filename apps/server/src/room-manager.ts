import { randomBytes, randomUUID } from "node:crypto";
import {
  isDisplayName,
  isRoomCode,
  normalizeDisplayName,
  normalizeRoomCode,
  type CreateRoomResult,
  type JoinRoomRequest,
  type JoinRoomResult,
  type PlayerSession,
  type PrivatePlayerIdentity,
  type PublicLobbyPlayer,
  type PublicLobbyProjection,
  type ReconnectPlayerResult,
} from "@morder/shared";
import { generateRoomCode } from "./room-code.js";

const MAX_ROOM_CODE_ATTEMPTS = 100;
const MAX_IDENTIFIER_ATTEMPTS = 10;

interface PlayerRecord {
  id: string;
  displayName: string;
  connected: boolean;
  socketId: string | null;
  reconnectToken: string;
}

interface RoomRecord {
  code: string;
  hostSocketId: string;
  players: Map<string, PlayerRecord>;
}

interface PlayerLocator {
  roomCode: string;
  playerId: string;
}

export type RoomManagerEvent =
  | {
      type: "lobby-updated";
      hostSocketId: string;
      lobby: PublicLobbyProjection;
    }
  | {
      type: "room-closed";
      roomCode: string;
      playerSocketIds: string[];
    };

export interface ReconnectPlayerOutcome {
  result: ReconnectPlayerResult;
  replacedSocketId: string | null;
}

export interface RoomManagerOptions {
  createRoomCode?: () => string;
  createPlayerId?: () => string;
  createReconnectToken?: () => string;
}

const createSessionToken = () => randomBytes(32).toString("base64url");

export class RoomManager {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly roomCodeByHostSocket = new Map<string, string>();
  private readonly playerBySocket = new Map<string, PlayerLocator>();
  private readonly playerByToken = new Map<string, PlayerLocator>();
  private readonly listeners = new Set<(event: RoomManagerEvent) => void>();
  private readonly createRoomCode: () => string;
  private readonly createPlayerId: () => string;
  private readonly createReconnectToken: () => string;

  constructor(options: RoomManagerOptions = {}) {
    this.createRoomCode = options.createRoomCode ?? generateRoomCode;
    this.createPlayerId = options.createPlayerId ?? randomUUID;
    this.createReconnectToken =
      options.createReconnectToken ?? createSessionToken;
  }

  subscribe(listener: (event: RoomManagerEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  createRoom(hostSocketId: string): CreateRoomResult {
    if (this.roomCodeByHostSocket.has(hostSocketId)) {
      return {
        ok: false,
        error: {
          code: "host_already_has_room",
          message: "This host already owns a room.",
        },
      };
    }

    let code: string | undefined;
    for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
      const candidate = normalizeRoomCode(this.createRoomCode());
      if (isRoomCode(candidate) && !this.rooms.has(candidate)) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      return {
        ok: false,
        error: {
          code: "room_code_unavailable",
          message: "A room code could not be generated. Please try again.",
        },
      };
    }

    const room: RoomRecord = {
      code,
      hostSocketId,
      players: new Map(),
    };
    this.rooms.set(code, room);
    this.roomCodeByHostSocket.set(hostSocketId, code);

    const lobby = this.toPublicLobby(room);
    this.emit({ type: "lobby-updated", hostSocketId, lobby });
    return { ok: true, lobby };
  }

  joinRoom(playerSocketId: string, request: JoinRoomRequest): JoinRoomResult {
    if (this.playerBySocket.has(playerSocketId)) {
      return {
        ok: false,
        error: {
          code: "already_joined",
          message: "This player is already joined to a room.",
        },
      };
    }

    const roomCode = normalizeRoomCode(request.roomCode);
    if (!isRoomCode(roomCode)) {
      return {
        ok: false,
        error: {
          code: "invalid_room_code",
          message: "Enter the four-character room code shown on the host.",
        },
      };
    }

    const room = this.rooms.get(roomCode);
    if (!room) {
      return {
        ok: false,
        error: {
          code: "room_not_found",
          message: "That room does not exist. Check the code and try again.",
        },
      };
    }

    const displayName = normalizeDisplayName(request.displayName);
    if (!isDisplayName(displayName)) {
      return {
        ok: false,
        error: {
          code: "invalid_display_name",
          message:
            "Use 1–24 letters or numbers; spaces, apostrophes, hyphens, and underscores are allowed.",
        },
      };
    }

    const normalizedName = displayName.toLocaleLowerCase("en-US");
    const duplicateName = [...room.players.values()].some(
      (player) =>
        player.displayName.toLocaleLowerCase("en-US") === normalizedName,
    );
    if (duplicateName) {
      return {
        ok: false,
        error: {
          code: "duplicate_display_name",
          message: "That display name is already in use in this room.",
        },
      };
    }

    const playerId = this.createUniquePlayerId();
    const reconnectToken = this.createUniqueToken();
    if (!playerId || !reconnectToken) {
      return {
        ok: false,
        error: {
          code: "session_unavailable",
          message: "A private player session could not be created. Please try again.",
        },
      };
    }

    const player: PlayerRecord = {
      id: playerId,
      displayName,
      connected: true,
      socketId: playerSocketId,
      reconnectToken,
    };
    room.players.set(player.id, player);

    const locator = { roomCode, playerId };
    this.playerBySocket.set(playerSocketId, locator);
    this.playerByToken.set(reconnectToken, locator);
    this.emitLobbyUpdated(room);

    return { ok: true, session: this.toPlayerSession(room, player) };
  }

  reconnectPlayer(
    playerSocketId: string,
    reconnectToken: string,
  ): ReconnectPlayerOutcome {
    if (this.playerBySocket.has(playerSocketId)) {
      return {
        result: {
          ok: false,
          error: {
            code: "already_joined",
            message: "This player is already joined to a room.",
          },
        },
        replacedSocketId: null,
      };
    }

    const locator = this.playerByToken.get(reconnectToken);
    const room = locator ? this.rooms.get(locator.roomCode) : undefined;
    const player = room && locator ? room.players.get(locator.playerId) : undefined;

    if (!locator || !room || !player || player.reconnectToken !== reconnectToken) {
      return {
        result: {
          ok: false,
          error: {
            code: "invalid_reconnect_token",
            message: "The previous player session is no longer available.",
          },
        },
        replacedSocketId: null,
      };
    }

    const replacedSocketId = player.socketId;
    if (replacedSocketId) {
      this.playerBySocket.delete(replacedSocketId);
    }

    player.socketId = playerSocketId;
    player.connected = true;
    this.playerBySocket.set(playerSocketId, locator);
    this.emitLobbyUpdated(room);

    return {
      result: { ok: true, session: this.toPlayerSession(room, player) },
      replacedSocketId,
    };
  }

  handleDisconnect(socketId: string) {
    const hostedRoomCode = this.roomCodeByHostSocket.get(socketId);
    if (hostedRoomCode) {
      this.closeRoom(hostedRoomCode);
      return;
    }

    const locator = this.playerBySocket.get(socketId);
    if (!locator) {
      return;
    }

    this.playerBySocket.delete(socketId);
    const room = this.rooms.get(locator.roomCode);
    const player = room?.players.get(locator.playerId);
    if (!room || !player || player.socketId !== socketId) {
      return;
    }

    player.connected = false;
    player.socketId = null;
    this.emitLobbyUpdated(room);
  }

  getLobbyForHost(hostSocketId: string): PublicLobbyProjection | null {
    const roomCode = this.roomCodeByHostSocket.get(hostSocketId);
    const room = roomCode ? this.rooms.get(roomCode) : undefined;
    return room ? this.toPublicLobby(room) : null;
  }

  dispose() {
    this.rooms.clear();
    this.roomCodeByHostSocket.clear();
    this.playerBySocket.clear();
    this.playerByToken.clear();
    this.listeners.clear();
  }

  private closeRoom(roomCode: string) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return;
    }

    const playerSocketIds: string[] = [];
    for (const player of room.players.values()) {
      if (player.socketId) {
        playerSocketIds.push(player.socketId);
        this.playerBySocket.delete(player.socketId);
      }
      this.playerByToken.delete(player.reconnectToken);
    }

    this.rooms.delete(roomCode);
    this.roomCodeByHostSocket.delete(room.hostSocketId);
    this.emit({ type: "room-closed", roomCode, playerSocketIds });
  }

  private createUniquePlayerId() {
    for (let attempt = 0; attempt < MAX_IDENTIFIER_ATTEMPTS; attempt += 1) {
      const id = this.createPlayerId();
      const alreadyUsed = [...this.rooms.values()].some((room) =>
        room.players.has(id),
      );
      if (!alreadyUsed) {
        return id;
      }
    }
    return null;
  }

  private createUniqueToken() {
    for (let attempt = 0; attempt < MAX_IDENTIFIER_ATTEMPTS; attempt += 1) {
      const token = this.createReconnectToken();
      if (
        token.length >= 20 &&
        token.length <= 128 &&
        !this.playerByToken.has(token)
      ) {
        return token;
      }
    }
    return null;
  }

  private toPublicLobbyPlayer(player: PlayerRecord): PublicLobbyPlayer {
    return {
      id: player.id,
      displayName: player.displayName,
      connectionState: player.connected ? "connected" : "disconnected",
    };
  }

  private toPrivatePlayerIdentity(player: PlayerRecord): PrivatePlayerIdentity {
    return {
      id: player.id,
      displayName: player.displayName,
      connectionState: player.connected ? "connected" : "disconnected",
    };
  }

  private toPublicLobby(room: RoomRecord): PublicLobbyProjection {
    return {
      roomCode: room.code,
      players: [...room.players.values()].map((player) =>
        this.toPublicLobbyPlayer(player),
      ),
    };
  }

  private toPlayerSession(
    room: RoomRecord,
    player: PlayerRecord,
  ): PlayerSession {
    return {
      roomCode: room.code,
      self: this.toPrivatePlayerIdentity(player),
      reconnectToken: player.reconnectToken,
    };
  }

  private emitLobbyUpdated(room: RoomRecord) {
    this.emit({
      type: "lobby-updated",
      hostSocketId: room.hostSocketId,
      lobby: this.toPublicLobby(room),
    });
  }

  private emit(event: RoomManagerEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
