import { io, type Socket } from "socket.io-client";
import {
  CONNECTION_ROLES,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@morder/shared";

const configuredServerUrl = import.meta.env.VITE_SERVER_URL?.trim();

export const serverUrl =
  configuredServerUrl ||
  `${window.location.protocol}//${window.location.hostname}:3101`;

export const hostSocket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  serverUrl,
  {
    autoConnect: false,
    auth: { role: CONNECTION_ROLES.host },
  },
);
