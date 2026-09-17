import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import {
  CONNECTION_ROLES,
  HOST_CREATE_ROOM_EVENT,
  HOST_GET_NETWORK_ADDRESSES_EVENT,
  HOST_LOBBY_STATE_EVENT,
  PLAYER_JOIN_ROOM_EVENT,
  PLAYER_RECONNECT_EVENT,
  PLAYER_ROOM_CLOSED_EVENT,
  isConnectionAuth,
  isJoinRoomRequest,
  isReconnectPlayerRequest,
  type ClientToServerEvents,
  type CreateRoomResult,
  type HostNetworkAddressesResult,
  type InterServerEvents,
  type JoinRoomResult,
  type LocalNetworkAddress,
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

    for (const socketId of event.playerSocketIds) {
      io.sockets.sockets.get(socketId)?.emit(PLAYER_ROOM_CLOSED_EVENT, {
        roomCode: event.roomCode,
        reason: "host_disconnected",
        message: "The host disconnected, so the room has closed.",
      });
    }
  });

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

    socket.on("disconnect", () => {
      roomManager.handleDisconnect(socket.id);
    });
  });

  const dispose = () => {
    unsubscribeRoomManager();
    roomManager.dispose();
  };

  return { io, roomManager, dispose };
};
