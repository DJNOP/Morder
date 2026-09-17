import { randomBytes, randomUUID } from "node:crypto";
import {
  PLAYER_PHOTO_CONTENT_TYPE,
  PLAYER_PHOTO_MAX_BYTES,
  isDisplayName,
  isRoomCode,
  normalizeDisplayName,
  normalizeRoomCode,
  type CreateRoomResult,
  type JoinRoomRequest,
  type JoinRoomResult,
  type LockRoomResult,
  type PlayerPhotoUploadResult,
  type PlayerSession,
  type PrivatePlayerIdentity,
  type PrivatePlayerState,
  type PublicLobbyPlayer,
  type PublicLobbyProjection,
  type ReconnectPlayerResult,
  type RoomStatus,
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
  photo: PlayerPhoto | null;
}

interface PlayerPhoto {
  contentType: typeof PLAYER_PHOTO_CONTENT_TYPE;
  bytes: Uint8Array;
  version: number;
}

interface RoomRecord {
  code: string;
  hostSocketId: string;
  status: RoomStatus;
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
      type: "player-state-updated";
      playerSocketId: string;
      playerState: PrivatePlayerState;
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

export interface StoredPlayerPhoto {
  contentType: typeof PLAYER_PHOTO_CONTENT_TYPE;
  bytes: Uint8Array;
  version: number;
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
      status: "open",
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

    if (room.status === "locked") {
      return {
        ok: false,
        error: {
          code: "room_locked",
          message: "This lobby is locked and is no longer accepting new players.",
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
      photo: null,
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

  updatePlayerPhoto(
    playerSocketId: string,
    contentType: string,
    bytes: Uint8Array,
  ): PlayerPhotoUploadResult {
    const locator = this.playerBySocket.get(playerSocketId);
    const room = locator ? this.rooms.get(locator.roomCode) : undefined;
    const player = room && locator ? room.players.get(locator.playerId) : undefined;

    if (!locator || !room || !player || player.socketId !== playerSocketId) {
      return {
        ok: false,
        error: {
          code: "not_joined",
          message: "Join a room before adding a photo.",
        },
      };
    }

    if (room.status === "locked") {
      return {
        ok: false,
        error: {
          code: "room_locked",
          message: "The roster is locked, so photos can no longer be changed.",
        },
      };
    }

    if (contentType !== PLAYER_PHOTO_CONTENT_TYPE) {
      return {
        ok: false,
        error: {
          code: "invalid_photo_type",
          message: "The processed photo must be a JPEG image.",
        },
      };
    }

    if (bytes.byteLength > PLAYER_PHOTO_MAX_BYTES) {
      return {
        ok: false,
        error: {
          code: "photo_too_large",
          message: "The processed photo is too large. Choose another image.",
        },
      };
    }

    if (!this.isJpeg(bytes)) {
      return {
        ok: false,
        error: {
          code: "invalid_photo_data",
          message: "The processed photo is not a valid JPEG image.",
        },
      };
    }

    player.photo = {
      contentType: PLAYER_PHOTO_CONTENT_TYPE,
      bytes: Uint8Array.from(bytes),
      version: (player.photo?.version ?? 0) + 1,
    };
    this.emitLobbyUpdated(room);
    const playerState = this.toPrivatePlayerState(room, player);
    this.emitPlayerStateUpdated(player, playerState);
    return { ok: true, playerState };
  }

  lockRoom(hostSocketId: string): LockRoomResult {
    const roomCode = this.roomCodeByHostSocket.get(hostSocketId);
    const room = roomCode ? this.rooms.get(roomCode) : undefined;
    if (!room) {
      return {
        ok: false,
        error: {
          code: "room_not_found",
          message: "Create a room before locking the roster.",
        },
      };
    }

    if (room.status === "locked") {
      return {
        ok: false,
        error: {
          code: "room_already_locked",
          message: "This roster is already locked.",
        },
      };
    }

    if (room.players.size === 0) {
      return {
        ok: false,
        error: {
          code: "lobby_empty",
          message: "At least one player must join before locking the roster.",
        },
      };
    }

    room.status = "locked";
    const lobby = this.toPublicLobby(room);
    this.emit({ type: "lobby-updated", hostSocketId, lobby });
    for (const player of room.players.values()) {
      this.emitPlayerStateUpdated(
        player,
        this.toPrivatePlayerState(room, player),
      );
    }
    return { ok: true, lobby };
  }

  getPlayerPhoto(roomCode: string, playerId: string): StoredPlayerPhoto | null {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    if (!isRoomCode(normalizedRoomCode)) {
      return null;
    }
    const photo = this.rooms.get(normalizedRoomCode)?.players.get(playerId)?.photo;
    if (!photo) {
      return null;
    }
    return {
      contentType: photo.contentType,
      bytes: photo.bytes.slice(),
      version: photo.version,
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
      photoVersion: player.photo?.version ?? null,
    };
  }

  private toPrivatePlayerIdentity(player: PlayerRecord): PrivatePlayerIdentity {
    return {
      id: player.id,
      displayName: player.displayName,
      connectionState: player.connected ? "connected" : "disconnected",
      photoVersion: player.photo?.version ?? null,
    };
  }

  private toPublicLobby(room: RoomRecord): PublicLobbyProjection {
    return {
      roomCode: room.code,
      roomStatus: room.status,
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
      ...this.toPrivatePlayerState(room, player),
      reconnectToken: player.reconnectToken,
    };
  }

  private toPrivatePlayerState(
    room: RoomRecord,
    player: PlayerRecord,
  ): PrivatePlayerState {
    return {
      roomCode: room.code,
      roomStatus: room.status,
      self: this.toPrivatePlayerIdentity(player),
    };
  }

  private isJpeg(bytes: Uint8Array) {
    return (
      bytes.byteLength >= 5 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff &&
      bytes.at(-2) === 0xff &&
      bytes.at(-1) === 0xd9
    );
  }

  private emitPlayerStateUpdated(
    player: PlayerRecord,
    playerState: PrivatePlayerState,
  ) {
    if (!player.socketId) {
      return;
    }
    this.emit({
      type: "player-state-updated",
      playerSocketId: player.socketId,
      playerState,
    });
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
