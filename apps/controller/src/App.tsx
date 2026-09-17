import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  DISPLAY_NAME_MAX_LENGTH,
  PLAYER_JOIN_ROOM_EVENT,
  PLAYER_RECONNECT_EVENT,
  PLAYER_ROOM_CLOSED_EVENT,
  normalizeRoomCode,
  parseRoomQuery,
  removeRoomQueryFromUrl,
  type PlayerSession,
  type RoomClosedNotice,
} from "@morder/shared";
import {
  clearStoredSession,
  readStoredSession,
  storeSession,
} from "./session-storage";
import { playerSocket, serverUrl } from "./socket";

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

const INVALID_ROOM_LINK_MESSAGE =
  "This join link contains an invalid room code. Enter the code shown on the host.";

const clearConsumedRoomQuery = () => {
  const nextUrl = removeRoomQueryFromUrl(window.location.href);
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) {
    window.history.replaceState(window.history.state, "", nextUrl);
  }
};

export const App = () => {
  const [initialRoomQuery] = useState(() => parseRoomQuery(window.location.search));
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [connectionMessage, setConnectionMessage] = useState(
    "Connecting to the room server…",
  );
  const [session, setSession] = useState<PlayerSession>();
  const [roomCode, setRoomCode] = useState(() =>
    initialRoomQuery.status === "valid" ? initialRoomQuery.roomCode : "",
  );
  const [displayName, setDisplayName] = useState("");
  const [joinError, setJoinError] = useState(() =>
    initialRoomQuery.status === "invalid" ? INVALID_ROOM_LINK_MESSAGE : "",
  );
  const [isJoining, setIsJoining] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const sessionRef = useRef<PlayerSession | undefined>(undefined);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    let active = true;

    const recoverSession = () => {
      const current = sessionRef.current;
      const stored = current
        ? {
            roomCode: current.roomCode,
            reconnectToken: current.reconnectToken,
          }
        : readStoredSession();
      if (!stored) {
        setConnectionMessage("Connected — enter a room");
        return;
      }

      setIsRecovering(true);
      setConnectionMessage("Connected — restoring your place…");
      playerSocket.emit(
        PLAYER_RECONNECT_EVENT,
        { reconnectToken: stored.reconnectToken },
        (result) => {
          if (!active) {
            return;
          }
          setIsRecovering(false);
          if (result.ok) {
            sessionRef.current = result.session;
            setSession(result.session);
            setJoinError("");
            setConnectionMessage("Connected to room");
            storeSession({
              roomCode: result.session.roomCode,
              reconnectToken: result.session.reconnectToken,
            });
            clearConsumedRoomQuery();
            return;
          }

          clearStoredSession();
          sessionRef.current = undefined;
          setSession(undefined);
          setRoomCode(
            initialRoomQuery.status === "valid"
              ? initialRoomQuery.roomCode
              : stored.roomCode,
          );
          setJoinError(result.error.message);
          setConnectionMessage("Connected — join a room");
        },
      );
    };

    const onConnect = () => {
      setConnectionState("connected");
      recoverSession();
    };
    const onDisconnect = () => {
      setConnectionState("disconnected");
      setConnectionMessage("Connection lost — attempting to reconnect…");
      setIsJoining(false);
      setIsRecovering(false);
    };
    const onConnectError = (error: Error) => {
      setConnectionState("error");
      setConnectionMessage(`Server unavailable: ${error.message}`);
    };
    const onRoomClosed = (notice: RoomClosedNotice) => {
      clearStoredSession();
      sessionRef.current = undefined;
      setSession(undefined);
      setRoomCode(notice.roomCode);
      setJoinError(notice.message);
      setConnectionMessage("Connected — room closed");
    };

    playerSocket.on("connect", onConnect);
    playerSocket.on("disconnect", onDisconnect);
    playerSocket.on("connect_error", onConnectError);
    playerSocket.on(PLAYER_ROOM_CLOSED_EVENT, onRoomClosed);
    playerSocket.connect();

    return () => {
      active = false;
      playerSocket.off("connect", onConnect);
      playerSocket.off("disconnect", onDisconnect);
      playerSocket.off("connect_error", onConnectError);
      playerSocket.off(PLAYER_ROOM_CLOSED_EVENT, onRoomClosed);
      playerSocket.disconnect();
    };
  }, [initialRoomQuery]);

  const joinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!playerSocket.connected || isJoining) {
      return;
    }

    const normalizedCode = normalizeRoomCode(roomCode);
    setRoomCode(normalizedCode);
    setJoinError("");
    setIsJoining(true);
    playerSocket.emit(
      PLAYER_JOIN_ROOM_EVENT,
      { roomCode: normalizedCode, displayName },
      (result) => {
        setIsJoining(false);
        if (result.ok) {
          sessionRef.current = result.session;
          setSession(result.session);
          setConnectionMessage("Connected to room");
          storeSession({
            roomCode: result.session.roomCode,
            reconnectToken: result.session.reconnectToken,
          });
          clearConsumedRoomQuery();
          return;
        }
        setJoinError(result.error.message);
      },
    );
  };

  return (
    <main className="player-shell">
      <header>
        <p className="eyebrow">Morder</p>
        <div
          className={`connection connection--${connectionState}`}
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true" />
          {connectionMessage}
        </div>
      </header>

      {!session ? (
        <section className="join-card">
          <div>
            <p className="section-label">Player connection</p>
            <h1>{isRecovering ? "Restoring your place…" : "Join the room"}</h1>
            <p>Enter the name that should appear on the shared screen.</p>
          </div>

          <form onSubmit={joinRoom}>
            <label>
              Room code
              <input
                name="roomCode"
                value={roomCode}
                onChange={(event) => {
                  setRoomCode(event.target.value.toUpperCase().slice(0, 4));
                  setJoinError("");
                }}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={4}
                placeholder="ABCD"
                disabled={isRecovering}
                required
              />
            </label>
            <label>
              Display name
              <input
                name="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="nickname"
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                placeholder="Your name"
                disabled={isRecovering}
                autoFocus={initialRoomQuery.status === "valid"}
                required
              />
            </label>
            <button
              type="submit"
              disabled={
                connectionState !== "connected" || isJoining || isRecovering
              }
            >
              {isJoining ? "Joining…" : "Join room"}
            </button>
          </form>

          {joinError ? <p className="error" role="alert">{joinError}</p> : null}
          <p className="privacy-note">
            This creates a temporary room identity in this browser, not an
            account.
          </p>
        </section>
      ) : (
        <section className="confirmation-card">
          <span className="confirmation-mark" aria-hidden="true">✓</span>
          <p className="section-label">Joined room {session.roomCode}</p>
          <h1>{session.self.displayName}</h1>
          <p>Your name is now visible on the shared screen.</p>
          <div className="waiting">Waiting for the host</div>
        </section>
      )}

      <footer>Room server: {serverUrl}</footer>
    </main>
  );
};
