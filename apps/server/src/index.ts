import { createServer } from "node:http";
import { createRealtimeServer } from "./create-server.js";

const host = process.env.HOST?.trim() || "0.0.0.0";
const configuredPort = Number.parseInt(process.env.PORT ?? "3101", 10);
const port = Number.isSafeInteger(configuredPort) ? configuredPort : 3101;

const httpServer = createServer();
createRealtimeServer(httpServer);

httpServer.on("error", (error) => {
  console.error("Real-time server failed:", error);
  process.exitCode = 1;
});

httpServer.listen(port, host, () => {
  console.log(`Real-time server listening on http://${host}:${port}`);
});
