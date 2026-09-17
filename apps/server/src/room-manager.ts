import { randomBytes, randomUUID } from "node:crypto";
import {
  PLAYER_PHOTO_CONTENT_TYPE,
  PLAYER_PHOTO_MAX_BYTES,
  isDisplayName,
  isRoomCode,
  normalizeDisplayName,
  normalizeRoomCode,
  type CreateRoomResult,
  type GameCommandErrorCode,
  type HostGameCommandResult,
  type JoinRoomRequest,
  type JoinRoomResult,
  type LockRoomResult,
  type PlayerGameCommandResult,
  type PlayerPhotoUploadResult,
  type PlayerSession,
  type PrivatePlayerIdentity,
  type PrivatePlayerState,
  type PublicLobbyPlayer,
  type PublicLobbyProjection,
  type ReconnectPlayerResult,
  type RoleCounts,
  type RoomStatus,
} from "@morder/shared";
import {
  advanceTimedPhase,
  confirmSelection,
  createGame,
  selectTarget,
  startVoting,
  toPlayerGameProjection,
  toPublicGameProjection,
  validateRoleCounts,
  type GameState,
} from "./game-engine.js";
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
  roleCounts: RoleCounts;
  game: GameState | null;
  timer: ReturnType<typeof setTimeout> | null;
}

interface PlayerLocator { roomCode: string; playerId: string; }

export type RoomManagerEvent =
  | { type: "lobby-updated"; hostSocketId: string; lobby: PublicLobbyProjection }
  | { type: "player-state-updated"; playerSocketId: string; playerState: PrivatePlayerState }
  | { type: "room-closed"; roomCode: string; playerSocketIds: string[] };

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
  now?: () => number;
  random?: () => number;
  schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancelSchedule?: (handle: ReturnType<typeof setTimeout>) => void;
}

const createSessionToken = () => randomBytes(32).toString("base64url");
const gameError = (code: GameCommandErrorCode, message: string): HostGameCommandResult => ({
  ok: false,
  error: { code, message },
});

export class RoomManager {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly roomCodeByHostSocket = new Map<string, string>();
  private readonly playerBySocket = new Map<string, PlayerLocator>();
  private readonly playerByToken = new Map<string, PlayerLocator>();
  private readonly listeners = new Set<(event: RoomManagerEvent) => void>();
  private readonly createRoomCode: () => string;
  private readonly createPlayerId: () => string;
  private readonly createReconnectToken: () => string;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly schedule: RoomManagerOptions["schedule"];
  private readonly cancelSchedule: RoomManagerOptions["cancelSchedule"];

  constructor(options: RoomManagerOptions = {}) {
    this.createRoomCode = options.createRoomCode ?? generateRoomCode;
    this.createPlayerId = options.createPlayerId ?? randomUUID;
    this.createReconnectToken = options.createReconnectToken ?? createSessionToken;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.cancelSchedule = options.cancelSchedule ?? clearTimeout;
  }

  subscribe(listener: (event: RoomManagerEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  createRoom(hostSocketId: string): CreateRoomResult {
    if (this.roomCodeByHostSocket.has(hostSocketId)) {
      return { ok: false, error: { code: "host_already_has_room", message: "This host already owns a room." } };
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
      return { ok: false, error: { code: "room_code_unavailable", message: "A room code could not be generated. Please try again." } };
    }
    const room: RoomRecord = {
      code,
      hostSocketId,
      status: "open",
      players: new Map(),
      roleCounts: { civilian: 0, murderer: 0, doctor: 0, sheriff: 0 },
      game: null,
      timer: null,
    };
    this.rooms.set(code, room);
    this.roomCodeByHostSocket.set(hostSocketId, code);
    const lobby = this.toPublicLobby(room);
    this.emit({ type: "lobby-updated", hostSocketId, lobby });
    return { ok: true, lobby };
  }

  joinRoom(playerSocketId: string, request: JoinRoomRequest): JoinRoomResult {
    if (this.playerBySocket.has(playerSocketId)) {
      return { ok: false, error: { code: "already_joined", message: "This player is already joined to a room." } };
    }
    const roomCode = normalizeRoomCode(request.roomCode);
    if (!isRoomCode(roomCode)) {
      return { ok: false, error: { code: "invalid_room_code", message: "Enter the four-character room code shown on the host." } };
    }
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { ok: false, error: { code: "room_not_found", message: "That room does not exist. Check the code and try again." } };
    }
    if (room.status === "locked") {
      return { ok: false, error: { code: "room_locked", message: "This lobby is locked and is no longer accepting new players." } };
    }
    const displayName = normalizeDisplayName(request.displayName);
    if (!isDisplayName(displayName)) {
      return { ok: false, error: { code: "invalid_display_name", message: "Use 1–24 letters or numbers; spaces, apostrophes, hyphens, and underscores are allowed." } };
    }
    const normalizedName = displayName.toLocaleLowerCase("en-US");
    if ([...room.players.values()].some((player) => player.displayName.toLocaleLowerCase("en-US") === normalizedName)) {
      return { ok: false, error: { code: "duplicate_display_name", message: "That display name is already in use in this room." } };
    }
    const playerId = this.createUniquePlayerId();
    const reconnectToken = this.createUniqueToken();
    if (!playerId || !reconnectToken) {
      return { ok: false, error: { code: "session_unavailable", message: "A private player session could not be created. Please try again." } };
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

  reconnectPlayer(playerSocketId: string, reconnectToken: string): ReconnectPlayerOutcome {
    if (this.playerBySocket.has(playerSocketId)) {
      return { result: { ok: false, error: { code: "already_joined", message: "This player is already joined to a room." } }, replacedSocketId: null };
    }
    const locator = this.playerByToken.get(reconnectToken);
    const room = locator ? this.rooms.get(locator.roomCode) : undefined;
    const player = room && locator ? room.players.get(locator.playerId) : undefined;
    if (!locator || !room || !player || player.reconnectToken !== reconnectToken) {
      return { result: { ok: false, error: { code: "invalid_reconnect_token", message: "The previous player session is no longer available." } }, replacedSocketId: null };
    }
    const replacedSocketId = player.socketId;
    if (replacedSocketId) this.playerBySocket.delete(replacedSocketId);
    player.socketId = playerSocketId;
    player.connected = true;
    this.playerBySocket.set(playerSocketId, locator);
    this.emitLobbyUpdated(room);
    return { result: { ok: true, session: this.toPlayerSession(room, player) }, replacedSocketId };
  }

  updatePlayerPhoto(playerSocketId: string, contentType: string, bytes: Uint8Array): PlayerPhotoUploadResult {
    const context = this.playerContext(playerSocketId);
    if (!context) {
      return { ok: false, error: { code: "not_joined", message: "Join a room before adding a photo." } };
    }
    const { room, player } = context;
    if (room.status === "locked") {
      return { ok: false, error: { code: "room_locked", message: "The roster is locked, so photos can no longer be changed." } };
    }
    if (contentType !== PLAYER_PHOTO_CONTENT_TYPE) {
      return { ok: false, error: { code: "invalid_photo_type", message: "The processed photo must be a JPEG image." } };
    }
    if (bytes.byteLength > PLAYER_PHOTO_MAX_BYTES) {
      return { ok: false, error: { code: "photo_too_large", message: "The processed photo is too large. Choose another image." } };
    }
    if (!this.isJpeg(bytes)) {
      return { ok: false, error: { code: "invalid_photo_data", message: "The processed photo is not a valid JPEG image." } };
    }
    player.photo = { contentType: PLAYER_PHOTO_CONTENT_TYPE, bytes: Uint8Array.from(bytes), version: (player.photo?.version ?? 0) + 1 };
    this.emitRoomStateUpdated(room);
    return { ok: true, playerState: this.toPrivatePlayerState(room, player) };
  }

  lockRoom(hostSocketId: string): LockRoomResult {
    const room = this.hostRoom(hostSocketId);
    if (!room) return { ok: false, error: { code: "room_not_found", message: "Create a room before locking the roster." } };
    if (room.status === "locked") return { ok: false, error: { code: "room_already_locked", message: "This roster is already locked." } };
    if (room.players.size === 0) return { ok: false, error: { code: "lobby_empty", message: "At least one player must join before locking the roster." } };
    room.status = "locked";
    room.roleCounts = {
      civilian: Math.max(0, room.players.size - (room.players.size >= 2 ? 1 : 0)),
      murderer: room.players.size >= 2 ? 1 : 0,
      doctor: 0,
      sheriff: 0,
    };
    this.emitRoomStateUpdated(room);
    return { ok: true, lobby: this.toPublicLobby(room) };
  }

  configureRoles(hostSocketId: string, counts: RoleCounts): HostGameCommandResult {
    const room = this.hostRoom(hostSocketId);
    if (!room) return gameError("room_not_found", "Create a room before configuring roles.");
    if (room.status !== "locked") return gameError("roster_not_locked", "Lock the roster before configuring roles.");
    if (room.game) return gameError("game_already_started", "Role counts cannot change after the game starts.");
    room.roleCounts = { ...counts };
    this.emitLobbyUpdated(room);
    return { ok: true, lobby: this.toPublicLobby(room) };
  }

  startGame(hostSocketId: string): HostGameCommandResult {
    const room = this.hostRoom(hostSocketId);
    if (!room) return gameError("room_not_found", "Create a room before starting the game.");
    if (room.status !== "locked") return gameError("roster_not_locked", "Lock the roster before starting the game.");
    if (room.game) return gameError("game_already_started", "This game has already started.");
    const created = createGame(
      [...room.players.values()].map((player) => ({
        id: player.id,
        displayName: player.displayName,
        photoVersion: player.photo?.version ?? null,
      })),
      room.roleCounts,
      this.now(),
      this.random,
    );
    if (!created.ok) return gameError("invalid_role_configuration", created.validation.message);
    room.game = created.game;
    this.emitRoomStateUpdated(room);
    this.scheduleNextTransition(room);
    return { ok: true, lobby: this.toPublicLobby(room) };
  }

  startVoting(hostSocketId: string): HostGameCommandResult {
    const room = this.hostRoom(hostSocketId);
    if (!room) return gameError("room_not_found", "This room does not exist.");
    if (!room.game) return gameError("game_not_started", "Start the game before voting.");
    const outcome = startVoting(room.game, this.now());
    if (!outcome.ok) return outcome;
    this.emitRoomStateUpdated(room);
    this.scheduleNextTransition(room);
    return { ok: true, lobby: this.toPublicLobby(room) };
  }

  selectGameTarget(playerSocketId: string, targetPlayerId: string): PlayerGameCommandResult {
    const context = this.playerContext(playerSocketId);
    if (!context) return { ok: false, error: { code: "not_joined", message: "Join the room before making a selection." } };
    if (!context.room.game) return { ok: false, error: { code: "game_not_started", message: "The game has not started." } };
    const outcome = selectTarget(context.room.game, context.player.id, targetPlayerId);
    if (!outcome.ok) return outcome;
    this.emitPlayerStates(context.room);
    return { ok: true, playerState: this.toPrivatePlayerState(context.room, context.player) };
  }

  confirmGameSelection(playerSocketId: string): PlayerGameCommandResult {
    const context = this.playerContext(playerSocketId);
    if (!context) return { ok: false, error: { code: "not_joined", message: "Join the room before confirming." } };
    if (!context.room.game) return { ok: false, error: { code: "game_not_started", message: "The game has not started." } };
    const outcome = confirmSelection(context.room.game, context.player.id);
    if (!outcome.ok) return outcome;
    this.emitPlayerStates(context.room);
    return { ok: true, playerState: this.toPrivatePlayerState(context.room, context.player) };
  }

  getPlayerPhoto(roomCode: string, playerId: string): StoredPlayerPhoto | null {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    if (!isRoomCode(normalizedRoomCode)) return null;
    const photo = this.rooms.get(normalizedRoomCode)?.players.get(playerId)?.photo;
    return photo ? { contentType: photo.contentType, bytes: photo.bytes.slice(), version: photo.version } : null;
  }

  handleDisconnect(socketId: string) {
    const hostedRoomCode = this.roomCodeByHostSocket.get(socketId);
    if (hostedRoomCode) {
      this.closeRoom(hostedRoomCode);
      return;
    }
    const locator = this.playerBySocket.get(socketId);
    if (!locator) return;
    this.playerBySocket.delete(socketId);
    const room = this.rooms.get(locator.roomCode);
    const player = room?.players.get(locator.playerId);
    if (!room || !player || player.socketId !== socketId) return;
    player.connected = false;
    player.socketId = null;
    this.emitLobbyUpdated(room);
  }

  getLobbyForHost(hostSocketId: string): PublicLobbyProjection | null {
    const room = this.hostRoom(hostSocketId);
    return room ? this.toPublicLobby(room) : null;
  }

  dispose() {
    for (const room of this.rooms.values()) this.clearRoomTimer(room);
    this.rooms.clear();
    this.roomCodeByHostSocket.clear();
    this.playerBySocket.clear();
    this.playerByToken.clear();
    this.listeners.clear();
  }

  private hostRoom(hostSocketId: string) {
    const roomCode = this.roomCodeByHostSocket.get(hostSocketId);
    return roomCode ? this.rooms.get(roomCode) : undefined;
  }

  private playerContext(playerSocketId: string) {
    const locator = this.playerBySocket.get(playerSocketId);
    const room = locator ? this.rooms.get(locator.roomCode) : undefined;
    const player = room && locator ? room.players.get(locator.playerId) : undefined;
    return locator && room && player && player.socketId === playerSocketId ? { room, player } : null;
  }

  private scheduleNextTransition(room: RoomRecord) {
    this.clearRoomTimer(room);
    const deadline = room.game?.deadline;
    if (deadline == null || !this.schedule) return;
    room.timer = this.schedule(() => {
      room.timer = null;
      if (!room.game || room.game.deadline !== deadline) return;
      if (!advanceTimedPhase(room.game, this.now())) {
        this.scheduleNextTransition(room);
        return;
      }
      this.emitRoomStateUpdated(room);
      this.scheduleNextTransition(room);
    }, Math.max(0, deadline - this.now()));
  }

  private clearRoomTimer(room: RoomRecord) {
    if (room.timer && this.cancelSchedule) this.cancelSchedule(room.timer);
    room.timer = null;
  }

  private closeRoom(roomCode: string) {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    this.clearRoomTimer(room);
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
      if (![...this.rooms.values()].some((room) => room.players.has(id))) return id;
    }
    return null;
  }

  private createUniqueToken() {
    for (let attempt = 0; attempt < MAX_IDENTIFIER_ATTEMPTS; attempt += 1) {
      const token = this.createReconnectToken();
      if (token.length >= 20 && token.length <= 128 && !this.playerByToken.has(token)) return token;
    }
    return null;
  }

  private lifeState(room: RoomRecord, player: PlayerRecord) {
    return room.game?.players.get(player.id)?.alive === false ? "eliminated" as const : "alive" as const;
  }

  private toPublicLobbyPlayer(room: RoomRecord, player: PlayerRecord): PublicLobbyPlayer {
    return {
      id: player.id,
      displayName: player.displayName,
      connectionState: player.connected ? "connected" : "disconnected",
      photoVersion: player.photo?.version ?? null,
      lifeState: this.lifeState(room, player),
    };
  }

  private toPrivatePlayerIdentity(room: RoomRecord, player: PlayerRecord): PrivatePlayerIdentity {
    return this.toPublicLobbyPlayer(room, player);
  }

  private toPublicLobby(room: RoomRecord): PublicLobbyProjection {
    return {
      roomCode: room.code,
      roomStatus: room.status,
      players: [...room.players.values()].map((player) => this.toPublicLobbyPlayer(room, player)),
      roleSetup:
        room.status === "locked" && !room.game
          ? validateRoleCounts(room.roleCounts, room.players.size)
          : null,
      game: room.game ? toPublicGameProjection(room.game) : null,
    };
  }

  private toPlayerSession(room: RoomRecord, player: PlayerRecord): PlayerSession {
    return { ...this.toPrivatePlayerState(room, player), reconnectToken: player.reconnectToken };
  }

  private toPrivatePlayerState(room: RoomRecord, player: PlayerRecord): PrivatePlayerState {
    return {
      roomCode: room.code,
      roomStatus: room.status,
      self: this.toPrivatePlayerIdentity(room, player),
      game: room.game ? toPlayerGameProjection(room.game, player.id) : null,
    };
  }

  private isJpeg(bytes: Uint8Array) {
    return bytes.byteLength >= 5 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  }

  private emitPlayerStates(room: RoomRecord) {
    for (const player of room.players.values()) {
      if (!player.socketId) continue;
      this.emit({ type: "player-state-updated", playerSocketId: player.socketId, playerState: this.toPrivatePlayerState(room, player) });
    }
  }

  private emitRoomStateUpdated(room: RoomRecord) {
    this.emitLobbyUpdated(room);
    this.emitPlayerStates(room);
  }

  private emitLobbyUpdated(room: RoomRecord) {
    this.emit({ type: "lobby-updated", hostSocketId: room.hostSocketId, lobby: this.toPublicLobby(room) });
  }

  private emit(event: RoomManagerEvent) {
    for (const listener of this.listeners) listener(event);
  }
}
