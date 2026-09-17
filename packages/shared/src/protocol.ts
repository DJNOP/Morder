export const CONNECTION_ROLES = { host: "host", player: "player" } as const;
export type ConnectionRole = (typeof CONNECTION_ROLES)[keyof typeof CONNECTION_ROLES];
export interface ConnectionAuth { role: ConnectionRole; }

export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const DISPLAY_NAME_MAX_LENGTH = 24;
export const PLAYER_PHOTO_CONTENT_TYPE = "image/jpeg" as const;
export const PLAYER_PHOTO_MAX_BYTES = 400 * 1024;
export const NIGHT_ACTION_DURATION_MS = 30_000;
export const NIGHT_RESULT_DURATION_MS = 6_000;
export const MORNING_DURATION_MS = 6_000;
export const VOTING_DURATION_MS = 30_000;
export const VOTE_RESULT_DURATION_MS = 6_000;

export const GAME_ROLES = {
  civilian: "civilian",
  murderer: "murderer",
  doctor: "doctor",
  sheriff: "sheriff",
} as const;
export type GameRole = (typeof GAME_ROLES)[keyof typeof GAME_ROLES];
export type PlayerConnectionState = "connected" | "disconnected";
export type PlayerLifeState = "alive" | "eliminated";
export type RoomStatus = "open" | "locked";
export type WinnerSide = "murderers" | "non-murderers";
export type PublicGamePhase =
  | "night-actions"
  | "night-result"
  | "morning"
  | "discussion"
  | "voting"
  | "vote-result"
  | "result";

export interface RoleCounts {
  civilian: number;
  murderer: number;
  doctor: number;
  sheriff: number;
}

export interface PublicPlayerIdentity {
  id: string;
  displayName: string;
  photoVersion: number | null;
}

export interface PublicLobbyPlayer extends PublicPlayerIdentity {
  connectionState: PlayerConnectionState;
  lifeState: PlayerLifeState;
}

export interface RoleSetupProjection {
  counts: RoleCounts;
  totalAssigned: number;
  playerCount: number;
  valid: boolean;
  message: string;
}

export type PublicOutcome =
  | { kind: "eliminated"; player: PublicPlayerIdentity }
  | { kind: "no-death" }
  | { kind: "tie" }
  | { kind: "no-votes" };

export interface FinalRoleReveal extends PublicPlayerIdentity {
  role: GameRole;
  lifeState: PlayerLifeState;
}

export type PublicGameProjection =
  | { phase: "night-actions"; round: number; deadline: number }
  | { phase: "night-result"; round: number; deadline: number }
  | { phase: "morning"; round: number; deadline: number; outcome: PublicOutcome }
  | { phase: "discussion"; round: number }
  | { phase: "voting"; round: number; deadline: number }
  | { phase: "vote-result"; round: number; deadline: number; outcome: PublicOutcome }
  | { phase: "result"; round: number; winner: WinnerSide; reveal: FinalRoleReveal[] };

export interface PublicLobbyProjection {
  roomCode: string;
  roomStatus: RoomStatus;
  players: PublicLobbyPlayer[];
  roleSetup: RoleSetupProjection | null;
  game: PublicGameProjection | null;
}

export interface PrivatePlayerIdentity extends PublicPlayerIdentity {
  connectionState: PlayerConnectionState;
  lifeState: PlayerLifeState;
}

export interface TeamSelectionProjection {
  player: PublicPlayerIdentity;
  targetPlayerId: string | null;
  confirmed: boolean;
}

export interface InvestigationResultProjection {
  player: PublicPlayerIdentity;
  role: GameRole;
}

export type PlayerGameProjection =
  | { phase: "night-actions"; round: number; deadline: number; role: "civilian" }
  | {
      phase: "night-actions";
      round: number;
      deadline: number;
      role: "murderer" | "doctor" | "sheriff";
      teammates: PublicPlayerIdentity[];
      candidates: PublicPlayerIdentity[];
      teamSelections: TeamSelectionProjection[];
      ownSelection: string | null;
      confirmed: boolean;
    }
  | { phase: "night-result"; round: number; deadline: number; investigation: InvestigationResultProjection }
  | { phase: "night-result"; round: number; deadline: number }
  | { phase: "morning"; round: number; deadline: number; outcome: PublicOutcome }
  | { phase: "discussion"; round: number }
  | {
      phase: "voting";
      round: number;
      deadline: number;
      candidates: PublicPlayerIdentity[];
      ownSelection: string | null;
      confirmed: boolean;
    }
  | { phase: "vote-result"; round: number; deadline: number; outcome: PublicOutcome }
  | { phase: "eliminated"; publicPhase: PublicGamePhase; round: number }
  | { phase: "result"; round: number; winner: WinnerSide };

export interface PrivatePlayerState {
  roomCode: string;
  roomStatus: RoomStatus;
  self: PrivatePlayerIdentity;
  game: PlayerGameProjection | null;
}
export interface PlayerSession extends PrivatePlayerState { reconnectToken: string; }

export interface JoinRoomRequest { roomCode: string; displayName: string; }
export interface ReconnectPlayerRequest { reconnectToken: string; }
export interface PlayerPhotoUploadRequest {
  contentType: typeof PLAYER_PHOTO_CONTENT_TYPE;
  data: ArrayBuffer | Uint8Array;
}
export interface ConfigureRolesRequest { counts: RoleCounts; }
export interface SelectTargetRequest { targetPlayerId: string; }
export interface ProtocolError<Code extends string> { code: Code; message: string; }

export type CreateRoomErrorCode = "not_authorized" | "host_already_has_room" | "room_code_unavailable";
export type JoinRoomErrorCode =
  | "not_authorized" | "already_joined" | "invalid_room_code" | "room_not_found"
  | "invalid_display_name" | "duplicate_display_name" | "room_locked" | "session_unavailable";
export type ReconnectPlayerErrorCode = "not_authorized" | "already_joined" | "invalid_reconnect_token";
export type LockRoomErrorCode = "not_authorized" | "room_not_found" | "lobby_empty" | "room_already_locked";
export type PlayerPhotoUploadErrorCode =
  | "not_authorized" | "not_joined" | "room_locked" | "invalid_photo_type"
  | "invalid_photo_data" | "photo_too_large";
export type GameCommandErrorCode =
  | "not_authorized" | "room_not_found" | "roster_not_locked" | "game_already_started"
  | "game_not_started" | "invalid_role_configuration" | "invalid_phase" | "not_joined"
  | "player_eliminated" | "action_not_available" | "invalid_target"
  | "selection_confirmed" | "selection_required";

export type CreateRoomResult = { ok: true; lobby: PublicLobbyProjection } | { ok: false; error: ProtocolError<CreateRoomErrorCode> };
export type JoinRoomResult = { ok: true; session: PlayerSession } | { ok: false; error: ProtocolError<JoinRoomErrorCode> };
export type ReconnectPlayerResult = { ok: true; session: PlayerSession } | { ok: false; error: ProtocolError<ReconnectPlayerErrorCode> };
export type LockRoomResult = { ok: true; lobby: PublicLobbyProjection } | { ok: false; error: ProtocolError<LockRoomErrorCode> };
export type PlayerPhotoUploadResult = { ok: true; playerState: PrivatePlayerState } | { ok: false; error: ProtocolError<PlayerPhotoUploadErrorCode> };
export type HostGameCommandResult = { ok: true; lobby: PublicLobbyProjection } | { ok: false; error: ProtocolError<GameCommandErrorCode> };
export type PlayerGameCommandResult = { ok: true; playerState: PrivatePlayerState } | { ok: false; error: ProtocolError<GameCommandErrorCode> };

export interface RoomClosedNotice { roomCode: string; reason: "host_disconnected"; message: string; }
export interface LocalNetworkAddress { address: string; isPrivate: boolean; }
export type HostNetworkAddressesResult = { ok: true; addresses: LocalNetworkAddress[] } | { ok: false; error: ProtocolError<"not_authorized"> };

export const HOST_CREATE_ROOM_EVENT = "host:create-room" as const;
export const HOST_GET_NETWORK_ADDRESSES_EVENT = "host:get-network-addresses" as const;
export const HOST_LOCK_ROOM_EVENT = "host:lock-room" as const;
export const HOST_CONFIGURE_ROLES_EVENT = "host:configure-roles" as const;
export const HOST_START_GAME_EVENT = "host:start-game" as const;
export const HOST_START_VOTING_EVENT = "host:start-voting" as const;
export const HOST_LOBBY_STATE_EVENT = "host:lobby-state" as const;
export const PLAYER_JOIN_ROOM_EVENT = "player:join-room" as const;
export const PLAYER_PHOTO_UPLOAD_EVENT = "player:upload-photo" as const;
export const PLAYER_RECONNECT_EVENT = "player:reconnect" as const;
export const PLAYER_SELECT_TARGET_EVENT = "player:select-target" as const;
export const PLAYER_CONFIRM_SELECTION_EVENT = "player:confirm-selection" as const;
export const PLAYER_STATE_EVENT = "player:state" as const;
export const PLAYER_ROOM_CLOSED_EVENT = "player:room-closed" as const;

type Acknowledge<Result> = (result: Result) => void;
export interface ClientToServerEvents {
  [HOST_CREATE_ROOM_EVENT]: (acknowledge: Acknowledge<CreateRoomResult>) => void;
  [HOST_GET_NETWORK_ADDRESSES_EVENT]: (acknowledge: Acknowledge<HostNetworkAddressesResult>) => void;
  [HOST_LOCK_ROOM_EVENT]: (acknowledge: Acknowledge<LockRoomResult>) => void;
  [HOST_CONFIGURE_ROLES_EVENT]: (request: ConfigureRolesRequest, acknowledge: Acknowledge<HostGameCommandResult>) => void;
  [HOST_START_GAME_EVENT]: (acknowledge: Acknowledge<HostGameCommandResult>) => void;
  [HOST_START_VOTING_EVENT]: (acknowledge: Acknowledge<HostGameCommandResult>) => void;
  [PLAYER_JOIN_ROOM_EVENT]: (request: JoinRoomRequest, acknowledge: Acknowledge<JoinRoomResult>) => void;
  [PLAYER_RECONNECT_EVENT]: (request: ReconnectPlayerRequest, acknowledge: Acknowledge<ReconnectPlayerResult>) => void;
  [PLAYER_PHOTO_UPLOAD_EVENT]: (request: PlayerPhotoUploadRequest, acknowledge: Acknowledge<PlayerPhotoUploadResult>) => void;
  [PLAYER_SELECT_TARGET_EVENT]: (request: SelectTargetRequest, acknowledge: Acknowledge<PlayerGameCommandResult>) => void;
  [PLAYER_CONFIRM_SELECTION_EVENT]: (acknowledge: Acknowledge<PlayerGameCommandResult>) => void;
}
export interface ServerToClientEvents {
  [HOST_LOBBY_STATE_EVENT]: (lobby: PublicLobbyProjection) => void;
  [PLAYER_STATE_EVENT]: (state: PrivatePlayerState) => void;
  [PLAYER_ROOM_CLOSED_EVENT]: (notice: RoomClosedNotice) => void;
}
export interface InterServerEvents {}
export interface SocketData { role: ConnectionRole; }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const hasExactKeys = (value: Record<string, unknown>, keys: string[]) => {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => key in value);
};
export const normalizeRoomCode = (value: string) => value.trim().toUpperCase();
export const isRoomCode = (value: string) => value.length === ROOM_CODE_LENGTH && [...value].every((character) => ROOM_CODE_ALPHABET.includes(character));
export const normalizeDisplayName = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ");
export const isDisplayName = (value: string) => {
  const length = [...value].length;
  return length >= 1 && length <= DISPLAY_NAME_MAX_LENGTH && /^[\p{L}\p{N}][\p{L}\p{N} _'-]*$/u.test(value);
};
export const isConnectionAuth = (value: unknown): value is ConnectionAuth =>
  isRecord(value) && hasExactKeys(value, ["role"]) && (value.role === CONNECTION_ROLES.host || value.role === CONNECTION_ROLES.player);
export const isJoinRoomRequest = (value: unknown): value is JoinRoomRequest =>
  isRecord(value) && hasExactKeys(value, ["roomCode", "displayName"]) && typeof value.roomCode === "string" && typeof value.displayName === "string";
export const isReconnectPlayerRequest = (value: unknown): value is ReconnectPlayerRequest =>
  isRecord(value) && hasExactKeys(value, ["reconnectToken"]) && typeof value.reconnectToken === "string" && value.reconnectToken.length >= 20 && value.reconnectToken.length <= 128;
export const isPlayerPhotoUploadRequest = (value: unknown): value is PlayerPhotoUploadRequest =>
  isRecord(value) && hasExactKeys(value, ["contentType", "data"]) && value.contentType === PLAYER_PHOTO_CONTENT_TYPE && (value.data instanceof ArrayBuffer || value.data instanceof Uint8Array);
const isNonNegativeInteger = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
export const isConfigureRolesRequest = (value: unknown): value is ConfigureRolesRequest =>
  isRecord(value) && hasExactKeys(value, ["counts"]) && isRecord(value.counts) &&
  hasExactKeys(value.counts, ["civilian", "murderer", "doctor", "sheriff"]) &&
  isNonNegativeInteger(value.counts.civilian) && isNonNegativeInteger(value.counts.murderer) &&
  isNonNegativeInteger(value.counts.doctor) && isNonNegativeInteger(value.counts.sheriff);
export const isSelectTargetRequest = (value: unknown): value is SelectTargetRequest =>
  isRecord(value) && hasExactKeys(value, ["targetPlayerId"]) && typeof value.targetPlayerId === "string" && value.targetPlayerId.length > 0 && value.targetPlayerId.length <= 128;
