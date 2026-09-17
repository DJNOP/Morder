import { isRoomCode, normalizeRoomCode } from "./protocol.js";

export const DEFAULT_PLAYER_PORT = 5184;
export const ROOM_QUERY_PARAMETER = "room";

export type RoomQueryResult =
  | { status: "missing" }
  | { status: "valid"; roomCode: string }
  | { status: "invalid" };

export const buildPlayerJoinUrl = (
  address: string,
  roomCode: string,
  port = DEFAULT_PLAYER_PORT,
) => {
  const url = new URL(`http://${address}:${port}/`);
  url.searchParams.set(ROOM_QUERY_PARAMETER, roomCode);
  return url.toString();
};

export const buildPlayerPhotoUrl = (
  serverUrl: string,
  roomCode: string,
  playerId: string,
  photoVersion: number,
) => {
  const url = new URL(
    `/rooms/${encodeURIComponent(roomCode)}/players/${encodeURIComponent(playerId)}/photo`,
    serverUrl,
  );
  url.searchParams.set("v", String(photoVersion));
  return url.toString();
};

export const parseRoomQuery = (search: string): RoomQueryResult => {
  const values = new URLSearchParams(search).getAll(ROOM_QUERY_PARAMETER);
  if (values.length === 0) {
    return { status: "missing" };
  }
  if (values.length !== 1) {
    return { status: "invalid" };
  }

  const roomCode = normalizeRoomCode(values[0] ?? "");
  return isRoomCode(roomCode)
    ? { status: "valid", roomCode }
    : { status: "invalid" };
};

export const removeRoomQueryFromUrl = (href: string) => {
  const url = new URL(href);
  url.searchParams.delete(ROOM_QUERY_PARAMETER);
  return `${url.pathname}${url.search}${url.hash}`;
};
