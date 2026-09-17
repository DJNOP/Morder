import type {
  IncomingMessage,
  Server as HttpServer,
  ServerResponse,
} from "node:http";
import { Server } from "socket.io";
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
  PLAYER_PHOTO_UPLOAD_EVENT,
  PLAYER_JOIN_ROOM_EVENT,
  PLAYER_RECONNECT_EVENT,
  PLAYER_ROOM_CLOSED_EVENT,
  PLAYER_SELECT_TARGET_EVENT,
  PLAYER_STATE_EVENT,
  isConfigureRolesRequest,
  isConnectionAuth,
  isJoinRoomRequest,
  isPlayerPhotoUploadRequest,
  isReconnectPlayerRequest,
  isSelectTargetRequest,
  type ClientToServerEvents,
  type CreateRoomResult,
  type HostNetworkAddressesResult,
  type HostGameCommandResult,
  type InterServerEvents,
  type JoinRoomResult,
  type LocalNetworkAddress,
  type LockRoomResult,
  type PlayerPhotoUploadResult,
  type PlayerGameCommandResult,
  type ReconnectPlayerResult,
  type ServerToClientEvents,
  type SocketData,
} from "@morder/shared";
import { discoverLocalNetworkAddresses } from "./network-address.js";
import { RoomManager } from "./room-manager.js";

export interface RealtimeServerOptions {
  roomManager?: RoomManager;
  getNetworkAddresses?: () => LocalNetworkAddress[];
}

const notAuthorizedToCreate: CreateRoomResult = {
  ok: false,
  error: {
    code: "not_authorized",
    message: "Only a host can create a room.",
  },
};

const notAuthorizedToJoin: JoinRoomResult = {
  ok: false,
  error: {
    code: "not_authorized",
    message: "Only a player connection can join a room.",
  },
};

const notAuthorizedToReconnect: ReconnectPlayerResult = {
  ok: false,
  error: {
    code: "not_authorized",
    message: "Only a player connection can restore a session.",
  },
};

const notAuthorizedToLock: LockRoomResult = {
  ok: false,
  error: {
    code: "not_authorized",
    message: "Only the room host can lock the roster.",
  },
};

const notAuthorizedToUploadPhoto: PlayerPhotoUploadResult = {
  ok: false,
  error: {
    code: "not_authorized",
    message: "Only a joined player can upload a photo.",
  },
};

const notAuthorizedHostGameCommand: HostGameCommandResult = {
  ok: false,
  error: {
    code: "not_authorized",
    message: "Only the room host can control the game.",
  },
};

const notAuthorizedPlayerGameCommand: PlayerGameCommandResult = {
  ok: false,
  error: {
    code: "not_authorized",
    message: "Only a joined player can make a game selection.",
  },
};

const notAuthorizedToReadNetworkAddresses: HostNetworkAddressesResult = {
  ok: false,
  error: {
    code: "not_authorized",
    message: "Only a host can request local network addresses.",
  },
};

export const createRealtimeServer = (
  httpServer: HttpServer,
  options: RealtimeServerOptions = {},
) => {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: true,
      methods: ["GET", "POST"],
    },
    serveClient: false,
  });

  const roomManager = options.roomManager ?? new RoomManager();
  const getNetworkAddresses =
    options.getNetworkAddresses ?? discoverLocalNetworkAddresses;

  const unsubscribeRoomManager = roomManager.subscribe((event) => {
    if (event.type === "lobby-updated") {
      io.sockets.sockets
        .get(event.hostSocketId)
        ?.emit(HOST_LOBBY_STATE_EVENT, event.lobby);
      return;
    }

    if (event.type === "player-state-updated") {
      io.sockets.sockets
        .get(event.playerSocketId)
        ?.emit(PLAYER_STATE_EVENT, event.playerState);
      return;
    }

    for (const socketId of event.playerSocketIds) {
      io.sockets.sockets.get(socketId)?.emit(PLAYER_ROOM_CLOSED_EVENT, {
        roomCode: event.roomCode,
        reason: "host_disconnected",
        message: "The host disconnected, so the room has closed.",
      });
    }
  });

  const handlePhotoRequest = (
    request: IncomingMessage,
    response: ServerResponse,
  ) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const match = /^\/rooms\/([^/]+)\/players\/([^/]+)\/photo$/.exec(
      requestUrl.pathname,
    );
    if (!match) {
      return;
    }

    if (request.method !== "GET") {
      response.writeHead(405, { Allow: "GET" });
      response.end();
      return;
    }

    let roomCode: string;
    let playerId: string;
    try {
      roomCode = decodeURIComponent(match[1] ?? "");
      playerId = decodeURIComponent(match[2] ?? "");
    } catch {
      response.writeHead(404);
      response.end();
      return;
    }

    const photo = roomManager.getPlayerPhoto(roomCode, playerId);
    if (!photo) {
      response.writeHead(404, {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end("Photo not found.");
      return;
    }

    response.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "Content-Length": photo.bytes.byteLength,
      "Content-Type": photo.contentType,
      "X-Content-Type-Options": "nosniff",
    });
    response.end(photo.bytes);
  };

  httpServer.on("request", handlePhotoRequest);

  io.on("connection", (socket) => {
    if (!isConnectionAuth(socket.handshake.auth)) {
      socket.disconnect(true);
      return;
    }

    socket.data.role = socket.handshake.auth.role;

    socket.on(HOST_CREATE_ROOM_EVENT, (acknowledge) => {
      if (typeof acknowledge !== "function") {
        return;
      }
      if (socket.data.role !== CONNECTION_ROLES.host) {
        acknowledge(notAuthorizedToCreate);
        return;
      }
      acknowledge(roomManager.createRoom(socket.id));
    });

    socket.on(HOST_GET_NETWORK_ADDRESSES_EVENT, (acknowledge) => {
      if (typeof acknowledge !== "function") {
        return;
      }
      if (socket.data.role !== CONNECTION_ROLES.host) {
        acknowledge(notAuthorizedToReadNetworkAddresses);
        return;
      }

      let addresses: LocalNetworkAddress[] = [];
      try {
        addresses = getNetworkAddresses();
      } catch {
        // The host can still show a browser-hostname fallback URL.
      }
      acknowledge({ ok: true, addresses });
    });

    socket.on(HOST_LOCK_ROOM_EVENT, (acknowledge) => {
      if (typeof acknowledge !== "function") {
        return;
      }
      if (socket.data.role !== CONNECTION_ROLES.host) {
        acknowledge(notAuthorizedToLock);
        return;
      }
      acknowledge(roomManager.lockRoom(socket.id));
    });

    socket.on(HOST_CONFIGURE_ROLES_EVENT, (request, acknowledge) => {
      if (typeof acknowledge !== "function") return;
      if (socket.data.role !== CONNECTION_ROLES.host) {
        acknowledge(notAuthorizedHostGameCommand);
        return;
      }
      if (!isConfigureRolesRequest(request)) {
        acknowledge({
          ok: false,
          error: {
            code: "invalid_role_configuration",
            message: "Choose valid whole-number role counts.",
          },
        });
        return;
      }
      acknowledge(roomManager.configureRoles(socket.id, request.counts));
    });

    socket.on(HOST_START_GAME_EVENT, (acknowledge) => {
      if (typeof acknowledge !== "function") return;
      if (socket.data.role !== CONNECTION_ROLES.host) {
        acknowledge(notAuthorizedHostGameCommand);
        return;
      }
      acknowledge(roomManager.startGame(socket.id));
    });

    socket.on(HOST_START_VOTING_EVENT, (acknowledge) => {
      if (typeof acknowledge !== "function") return;
      if (socket.data.role !== CONNECTION_ROLES.host) {
        acknowledge(notAuthorizedHostGameCommand);
        return;
      }
      acknowledge(roomManager.startVoting(socket.id));
    });

    socket.on(PLAYER_JOIN_ROOM_EVENT, (request, acknowledge) => {
      if (typeof acknowledge !== "function") {
        return;
      }
      if (socket.data.role !== CONNECTION_ROLES.player) {
        acknowledge(notAuthorizedToJoin);
        return;
      }
      if (!isJoinRoomRequest(request)) {
        acknowledge({
          ok: false,
          error: {
            code: "invalid_room_code",
            message: "Check the room code and display name, then try again.",
          },
        });
        return;
      }
      acknowledge(roomManager.joinRoom(socket.id, request));
    });

    socket.on(PLAYER_RECONNECT_EVENT, (request, acknowledge) => {
      if (typeof acknowledge !== "function") {
        return;
      }
      if (socket.data.role !== CONNECTION_ROLES.player) {
        acknowledge(notAuthorizedToReconnect);
        return;
      }
      if (!isReconnectPlayerRequest(request)) {
        acknowledge({
          ok: false,
          error: {
            code: "invalid_reconnect_token",
            message: "The previous player session is not valid.",
          },
        });
        return;
      }

      const outcome = roomManager.reconnectPlayer(
        socket.id,
        request.reconnectToken,
      );
      if (
        outcome.result.ok &&
        outcome.replacedSocketId &&
        outcome.replacedSocketId !== socket.id
      ) {
        io.sockets.sockets.get(outcome.replacedSocketId)?.disconnect(true);
      }
      acknowledge(outcome.result);
    });

    socket.on(PLAYER_PHOTO_UPLOAD_EVENT, (request, acknowledge) => {
      if (typeof acknowledge !== "function") {
        return;
      }
      if (socket.data.role !== CONNECTION_ROLES.player) {
        acknowledge(notAuthorizedToUploadPhoto);
        return;
      }
      if (!isPlayerPhotoUploadRequest(request)) {
        acknowledge({
          ok: false,
          error: {
            code: "invalid_photo_data",
            message: "Choose a valid image and try again.",
          },
        });
        return;
      }

      const bytes =
        request.data instanceof ArrayBuffer
          ? new Uint8Array(request.data)
          : new Uint8Array(
              request.data.buffer,
              request.data.byteOffset,
              request.data.byteLength,
            );
      acknowledge(
        roomManager.updatePlayerPhoto(
          socket.id,
          request.contentType,
          bytes,
        ),
      );
    });

    socket.on(PLAYER_SELECT_TARGET_EVENT, (request, acknowledge) => {
      if (typeof acknowledge !== "function") return;
      if (socket.data.role !== CONNECTION_ROLES.player) {
        acknowledge(notAuthorizedPlayerGameCommand);
        return;
      }
      if (!isSelectTargetRequest(request)) {
        acknowledge({
          ok: false,
          error: { code: "invalid_target", message: "Choose a valid player." },
        });
        return;
      }
      acknowledge(roomManager.selectGameTarget(socket.id, request.targetPlayerId));
    });

    socket.on(PLAYER_CONFIRM_SELECTION_EVENT, (acknowledge) => {
      if (typeof acknowledge !== "function") return;
      if (socket.data.role !== CONNECTION_ROLES.player) {
        acknowledge(notAuthorizedPlayerGameCommand);
        return;
      }
      acknowledge(roomManager.confirmGameSelection(socket.id));
    });

    socket.on("disconnect", () => {
      roomManager.handleDisconnect(socket.id);
    });
  });

  const dispose = () => {
    httpServer.off("request", handlePhotoRequest);
    unsubscribeRoomManager();
    roomManager.dispose();
  };

  return { io, roomManager, dispose };
};
