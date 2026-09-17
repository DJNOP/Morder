import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  DISPLAY_NAME_MAX_LENGTH,
  PLAYER_JOIN_ROOM_EVENT,
  PLAYER_PHOTO_CONTENT_TYPE,
  PLAYER_PHOTO_UPLOAD_EVENT,
  PLAYER_RECONNECT_EVENT,
  PLAYER_ROOM_CLOSED_EVENT,
  PLAYER_STATE_EVENT,
  buildPlayerPhotoUrl,
  normalizeRoomCode,
  parseRoomQuery,
  removeRoomQueryFromUrl,
  type PlayerSession,
  type PrivatePlayerState,
  type RoomClosedNotice,
} from "@morder/shared";
import { preparePlayerPhoto } from "./photo-processing";
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
  const [preparedPhoto, setPreparedPhoto] = useState<Blob>();
  const [previewUrl, setPreviewUrl] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoStatus, setPhotoStatus] = useState("");
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const sessionRef = useRef<PlayerSession | undefined>(undefined);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!preparedPhoto) {
      setPreviewUrl("");
      return;
    }
    const nextPreviewUrl = URL.createObjectURL(preparedPhoto);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [preparedPhoto]);

  useEffect(() => {
    let active = true;

    const applyPlayerState = (state: PrivatePlayerState) => {
      const current = sessionRef.current;
      if (!current || current.self.id !== state.self.id) {
        return;
      }
      const nextSession: PlayerSession = {
        ...state,
        reconnectToken: current.reconnectToken,
      };
      sessionRef.current = nextSession;
      setSession(nextSession);
      if (state.roomStatus === "locked") {
        setPreparedPhoto(undefined);
        setPhotoError("");
        setPhotoStatus("The host locked the roster.");
      }
    };

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
      setIsUploadingPhoto(false);
    };
    const onConnectError = (error: Error) => {
      setConnectionState("error");
      setConnectionMessage(`Server unavailable: ${error.message}`);
    };
    const onRoomClosed = (notice: RoomClosedNotice) => {
      clearStoredSession();
      sessionRef.current = undefined;
      setSession(undefined);
      setPreparedPhoto(undefined);
      setRoomCode(notice.roomCode);
      setJoinError(notice.message);
      setConnectionMessage("Connected — room closed");
    };

    playerSocket.on("connect", onConnect);
    playerSocket.on("disconnect", onDisconnect);
    playerSocket.on("connect_error", onConnectError);
    playerSocket.on(PLAYER_STATE_EVENT, applyPlayerState);
    playerSocket.on(PLAYER_ROOM_CLOSED_EVENT, onRoomClosed);
    playerSocket.connect();

    return () => {
      active = false;
      playerSocket.off("connect", onConnect);
      playerSocket.off("disconnect", onDisconnect);
      playerSocket.off("connect_error", onConnectError);
      playerSocket.off(PLAYER_STATE_EVENT, applyPlayerState);
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

  const preparePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || session?.roomStatus !== "open") {
      return;
    }

    setPhotoError("");
    setPhotoStatus("");
    setIsPreparingPhoto(true);
    try {
      const photo = await preparePlayerPhoto(file);
      setPreparedPhoto(photo);
      setPhotoStatus("Preview ready — save it when you are happy.");
    } catch (error) {
      setPreparedPhoto(undefined);
      setPhotoError(
        error instanceof Error ? error.message : "The photo could not be prepared.",
      );
    } finally {
      setIsPreparingPhoto(false);
    }
  };

  const uploadPhoto = async () => {
    const current = sessionRef.current;
    if (
      !current ||
      current.roomStatus !== "open" ||
      !preparedPhoto ||
      !playerSocket.connected ||
      isUploadingPhoto
    ) {
      return;
    }

    setPhotoError("");
    setPhotoStatus("");
    setIsUploadingPhoto(true);
    try {
      const data = await preparedPhoto.arrayBuffer();
      playerSocket.emit(
        PLAYER_PHOTO_UPLOAD_EVENT,
        { contentType: PLAYER_PHOTO_CONTENT_TYPE, data },
        (result) => {
          setIsUploadingPhoto(false);
          if (!result.ok) {
            setPhotoError(result.error.message);
            return;
          }
          const nextSession: PlayerSession = {
            ...result.playerState,
            reconnectToken: current.reconnectToken,
          };
          sessionRef.current = nextSession;
          setSession(nextSession);
          setPreparedPhoto(undefined);
          setPhotoStatus("Photo saved to this temporary room.");
        },
      );
    } catch {
      setIsUploadingPhoto(false);
      setPhotoError("The prepared photo could not be read. Choose it again.");
    }
  };

  const savedPhotoUrl =
    session?.self.photoVersion == null
      ? ""
      : buildPlayerPhotoUrl(
          serverUrl,
          session.roomCode,
          session.self.id,
          session.self.photoVersion,
        );
  const visiblePhotoUrl = previewUrl || savedPhotoUrl;
  const canChangePhoto =
    session?.roomStatus === "open" && connectionState === "connected";

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
          <p className="section-label">Joined room {session.roomCode}</p>
          <h1>{session.self.displayName}</h1>

          <div className="photo-preview" aria-live="polite">
            {visiblePhotoUrl ? (
              <img src={visiblePhotoUrl} alt="Your player photo" />
            ) : (
              <span aria-hidden="true">
                {session.self.displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>

          {session.roomStatus === "open" ? (
            <>
              <p>
                Add a quick photo so everyone can recognize you. It stays only
                in this room and is optional.
              </p>
              <div className="photo-actions">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={!canChangePhoto || isPreparingPhoto || isUploadingPhoto}
                >
                  Take photo
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={!canChangePhoto || isPreparingPhoto || isUploadingPhoto}
                >
                  Choose photo
                </button>
              </div>
              <input
                ref={cameraInputRef}
                hidden
                type="file"
                accept="image/*"
                capture="user"
                onChange={(event) => void preparePhoto(event)}
              />
              <input
                ref={galleryInputRef}
                hidden
                type="file"
                accept="image/*"
                onChange={(event) => void preparePhoto(event)}
              />
              {preparedPhoto ? (
                <button
                  type="button"
                  className="save-photo-button"
                  onClick={() => void uploadPhoto()}
                  disabled={!canChangePhoto || isUploadingPhoto}
                >
                  {isUploadingPhoto ? "Saving…" : "Save photo"}
                </button>
              ) : null}
              {isPreparingPhoto ? <p className="photo-status">Preparing photo…</p> : null}
              {photoStatus ? <p className="photo-status">{photoStatus}</p> : null}
              {photoError ? <p className="error" role="alert">{photoError}</p> : null}
              <div className="waiting">Waiting for the host to lock the roster</div>
            </>
          ) : (
            <>
              <p>The roster is locked. Your place and photo are preserved.</p>
              <div className="waiting waiting--locked">Roster locked · waiting</div>
            </>
          )}
        </section>
      )}

      <footer>Room server: {serverUrl}</footer>
    </main>
  );
};
