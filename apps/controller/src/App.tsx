import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  DISPLAY_NAME_MAX_LENGTH,
  PLAYER_CONFIRM_SELECTION_EVENT,
  PLAYER_JOIN_ROOM_EVENT,
  PLAYER_PHOTO_CONTENT_TYPE,
  PLAYER_PHOTO_UPLOAD_EVENT,
  PLAYER_RECONNECT_EVENT,
  PLAYER_ROOM_CLOSED_EVENT,
  PLAYER_SELECT_TARGET_EVENT,
  PLAYER_STATE_EVENT,
  buildPlayerPhotoUrl,
  normalizeRoomCode,
  parseRoomQuery,
  removeRoomQueryFromUrl,
  type PlayerSession,
  type PrivatePlayerState,
  type PublicOutcome,
  type PublicPlayerIdentity,
  type RoomClosedNotice,
} from "@morder/shared";
import { preparePlayerPhoto } from "./photo-processing";
import { clearStoredSession, readStoredSession, storeSession } from "./session-storage";
import { playerSocket, serverUrl } from "./socket";

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";
const INVALID_ROOM_LINK_MESSAGE = "This join link contains an invalid room code. Enter the code shown on the host.";
const roleLabel = { civilian: "Civilian", murderer: "Murderer", doctor: "Doctor", sheriff: "Sheriff" } as const;

const clearConsumedRoomQuery = () => {
  const nextUrl = removeRoomQueryFromUrl(window.location.href);
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) window.history.replaceState(window.history.state, "", nextUrl);
};

const useCountdown = (deadline?: number) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return deadline == null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
};

const outcomeText = (outcome: PublicOutcome) => {
  if (outcome.kind === "eliminated") return `${outcome.player.displayName} was eliminated.`;
  if (outcome.kind === "tie") return "The vote was tied. Nobody was eliminated.";
  if (outcome.kind === "no-votes") return "No votes were cast. Nobody was eliminated.";
  return "Nobody died.";
};

const PlayerPhoto = ({ player, roomCode }: { player: PublicPlayerIdentity; roomCode: string }) => (
  <div className="target-photo">
    {player.photoVersion == null ? <span>{player.displayName.slice(0, 1).toUpperCase()}</span> : <img src={buildPlayerPhotoUrl(serverUrl, roomCode, player.id, player.photoVersion)} alt="" />}
  </div>
);

const GameScreen = ({ session, onState }: { session: PlayerSession; onState: (state: PrivatePlayerState) => void }) => {
  const game = session.game!;
  const deadline = "deadline" in game ? game.deadline : undefined;
  const countdown = useCountdown(deadline);
  const [error, setError] = useState("");
  const interactive = game.phase === "night-actions" && game.role !== "civilian" || game.phase === "voting";
  const candidates = interactive ? game.candidates : [];
  const ownSelection = interactive ? game.ownSelection : null;
  const confirmed = interactive ? game.confirmed : false;

  const select = (targetPlayerId: string) => {
    setError("");
    playerSocket.emit(PLAYER_SELECT_TARGET_EVENT, { targetPlayerId }, (result) => result.ok ? onState(result.playerState) : setError(result.error.message));
  };
  const confirm = () => {
    setError("");
    playerSocket.emit(PLAYER_CONFIRM_SELECTION_EVENT, (result) => result.ok ? onState(result.playerState) : setError(result.error.message));
  };

  if (game.phase === "eliminated") {
    return <section className="confirmation-card game-card"><p className="section-label">Round {game.round}</p><h1>You are eliminated</h1><p>Follow the game on the shared screen.</p><div className="waiting waiting--locked">No more private actions or team information</div></section>;
  }
  if (game.phase === "result") {
    return <section className="confirmation-card game-card"><p className="section-label">Game finished</p><h1>{game.winner === "murderers" ? "Murderers win" : "Non-Murderers win"}</h1><p>The shared screen shows the final role reveal.</p></section>;
  }
  if (game.phase === "night-actions") {
    return (
      <section className="confirmation-card game-card night-card">
        <p className="section-label">Round {game.round}</p><h1>Night</h1><div className="phone-countdown">{countdown}</div>
        <div className="private-panel"><span>Your private role</span><strong>{roleLabel[game.role]}</strong></div>
        {game.role === "civilian" ? <p>The night is in progress. Keep your phone private and wait for morning.</p> : (
          <>
            <p>{game.role === "murderer" ? "Agree on one non-Murderer to kill." : game.role === "doctor" ? "Agree on one living player to protect." : "Agree on one player to investigate."}</p>
            <div className="teammates"><strong>Your living team</strong><p>{game.teammates.length ? game.teammates.map((player) => player.displayName).join(", ") : "You are the only living member."}</p></div>
            <div className="target-grid">{candidates.map((candidate) => <button type="button" key={candidate.id} className={`target-card ${ownSelection === candidate.id ? "target-card--selected" : ""}`} onClick={() => select(candidate.id)} disabled={confirmed}><PlayerPhoto player={candidate} roomCode={session.roomCode} /><span>{candidate.displayName}</span></button>)}</div>
            <div className="team-selections"><strong>Team selections</strong>{game.teamSelections.map((selection) => <p key={selection.player.id}>{selection.player.displayName}: {selection.targetPlayerId ? selection.targetPlayerId === session.self.id ? session.self.displayName : candidates.find((candidate) => candidate.id === selection.targetPlayerId)?.displayName ?? "selected" : "no selection"}{selection.confirmed ? " · confirmed" : ""}</p>)}</div>
            <button type="button" className="save-photo-button" onClick={confirm} disabled={!ownSelection || confirmed}>{confirmed ? "Confirmed" : "Confirm selection"}</button>
          </>
        )}
        {error ? <p className="error">{error}</p> : null}
      </section>
    );
  }
  if (game.phase === "night-result") {
    return <section className="confirmation-card game-card night-card"><p className="section-label">Round {game.round}</p><h1>Night</h1><div className="phone-countdown">{countdown}</div>{"investigation" in game ? <div className="private-panel"><span>Private Sheriff result</span><strong>{game.investigation.player.displayName} is a {roleLabel[game.investigation.role]}.</strong></div> : <p>The night is still in progress. Keep your phone private.</p>}</section>;
  }
  if (game.phase === "voting") {
    return <section className="confirmation-card game-card"><p className="section-label">Round {game.round}</p><h1>Voting</h1><div className="phone-countdown">{countdown}</div><p>Select one living player. Your latest choice counts at the deadline even without Confirm.</p><div className="target-grid">{game.candidates.map((candidate) => <button type="button" key={candidate.id} className={`target-card ${game.ownSelection === candidate.id ? "target-card--selected" : ""}`} onClick={() => select(candidate.id)} disabled={game.confirmed}><PlayerPhoto player={candidate} roomCode={session.roomCode} /><span>{candidate.displayName}</span></button>)}</div><button type="button" className="save-photo-button" onClick={confirm} disabled={!game.ownSelection || game.confirmed}>{game.confirmed ? "Vote confirmed" : "Confirm vote"}</button>{error ? <p className="error">{error}</p> : null}</section>;
  }
  if (game.phase === "discussion") {
    return <section className="confirmation-card game-card day-card"><p className="section-label">Round {game.round}</p><h1>Discussion</h1><p>Talk to the room. Keep your phone down.</p><div className="waiting">The host will start voting when the room is ready.</div></section>;
  }
  return <section className="confirmation-card game-card day-card"><p className="section-label">Round {game.round}</p><h1>{game.phase === "morning" ? "Morning" : "Vote result"}</h1><div className="phone-countdown">{countdown}</div><p>{outcomeText(game.outcome)}</p><div className="waiting">Follow the public result on the shared screen.</div></section>;
};

export const App = () => {
  const [initialRoomQuery] = useState(() => parseRoomQuery(window.location.search));
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [connectionMessage, setConnectionMessage] = useState("Connecting to the room server…");
  const [session, setSession] = useState<PlayerSession>();
  const [roomCode, setRoomCode] = useState(() => initialRoomQuery.status === "valid" ? initialRoomQuery.roomCode : "");
  const [displayName, setDisplayName] = useState("");
  const [joinError, setJoinError] = useState(() => initialRoomQuery.status === "invalid" ? INVALID_ROOM_LINK_MESSAGE : "");
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

  const applyState = (state: PrivatePlayerState) => {
    const current = sessionRef.current;
    if (!current || current.self.id !== state.self.id) return;
    const next = { ...state, reconnectToken: current.reconnectToken };
    sessionRef.current = next;
    setSession(next);
  };

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => {
    if (!preparedPhoto) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(preparedPhoto);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preparedPhoto]);

  useEffect(() => {
    let active = true;
    const recoverSession = () => {
      const current = sessionRef.current;
      const stored = current ? { roomCode: current.roomCode, reconnectToken: current.reconnectToken } : readStoredSession();
      if (!stored) { setConnectionMessage("Connected — enter a room"); return; }
      setIsRecovering(true);
      setConnectionMessage("Connected — restoring your place…");
      playerSocket.emit(PLAYER_RECONNECT_EVENT, { reconnectToken: stored.reconnectToken }, (result) => {
        if (!active) return;
        setIsRecovering(false);
        if (result.ok) {
          sessionRef.current = result.session; setSession(result.session); setJoinError(""); setConnectionMessage("Connected to room");
          storeSession({ roomCode: result.session.roomCode, reconnectToken: result.session.reconnectToken }); clearConsumedRoomQuery(); return;
        }
        clearStoredSession(); sessionRef.current = undefined; setSession(undefined);
        setRoomCode(initialRoomQuery.status === "valid" ? initialRoomQuery.roomCode : stored.roomCode);
        setJoinError(result.error.message); setConnectionMessage("Connected — join a room");
      });
    };
    const onConnect = () => { setConnectionState("connected"); recoverSession(); };
    const onDisconnect = () => { setConnectionState("disconnected"); setConnectionMessage("Connection lost — attempting to reconnect…"); setIsJoining(false); setIsRecovering(false); setIsUploadingPhoto(false); };
    const onConnectError = (error: Error) => { setConnectionState("error"); setConnectionMessage(`Server unavailable: ${error.message}`); };
    const onRoomClosed = (notice: RoomClosedNotice) => { clearStoredSession(); sessionRef.current = undefined; setSession(undefined); setPreparedPhoto(undefined); setRoomCode(notice.roomCode); setJoinError(notice.message); setConnectionMessage("Connected — room closed"); };
    playerSocket.on("connect", onConnect); playerSocket.on("disconnect", onDisconnect); playerSocket.on("connect_error", onConnectError); playerSocket.on(PLAYER_STATE_EVENT, applyState); playerSocket.on(PLAYER_ROOM_CLOSED_EVENT, onRoomClosed); playerSocket.connect();
    return () => { active = false; playerSocket.off("connect", onConnect); playerSocket.off("disconnect", onDisconnect); playerSocket.off("connect_error", onConnectError); playerSocket.off(PLAYER_STATE_EVENT, applyState); playerSocket.off(PLAYER_ROOM_CLOSED_EVENT, onRoomClosed); playerSocket.disconnect(); };
  }, [initialRoomQuery]);

  const joinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!playerSocket.connected || isJoining) return;
    const normalizedCode = normalizeRoomCode(roomCode); setRoomCode(normalizedCode); setJoinError(""); setIsJoining(true);
    playerSocket.emit(PLAYER_JOIN_ROOM_EVENT, { roomCode: normalizedCode, displayName }, (result) => {
      setIsJoining(false);
      if (result.ok) { sessionRef.current = result.session; setSession(result.session); setConnectionMessage("Connected to room"); storeSession({ roomCode: result.session.roomCode, reconnectToken: result.session.reconnectToken }); clearConsumedRoomQuery(); }
      else setJoinError(result.error.message);
    });
  };

  const preparePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || session?.roomStatus !== "open") return;
    setPhotoError(""); setPhotoStatus(""); setIsPreparingPhoto(true);
    try { const photo = await preparePlayerPhoto(file); setPreparedPhoto(photo); setPhotoStatus("Preview ready — save it when you are happy."); }
    catch (error) { setPreparedPhoto(undefined); setPhotoError(error instanceof Error ? error.message : "The photo could not be prepared."); }
    finally { setIsPreparingPhoto(false); }
  };
  const uploadPhoto = async () => {
    const current = sessionRef.current;
    if (!current || current.roomStatus !== "open" || !preparedPhoto || !playerSocket.connected || isUploadingPhoto) return;
    setPhotoError(""); setPhotoStatus(""); setIsUploadingPhoto(true);
    try {
      const data = await preparedPhoto.arrayBuffer();
      playerSocket.emit(PLAYER_PHOTO_UPLOAD_EVENT, { contentType: PLAYER_PHOTO_CONTENT_TYPE, data }, (result) => {
        setIsUploadingPhoto(false);
        if (!result.ok) { setPhotoError(result.error.message); return; }
        applyState(result.playerState); setPreparedPhoto(undefined); setPhotoStatus("Photo saved to this temporary room.");
      });
    } catch { setIsUploadingPhoto(false); setPhotoError("The prepared photo could not be read. Choose it again."); }
  };

  const savedPhotoUrl = session?.self.photoVersion == null ? "" : buildPlayerPhotoUrl(serverUrl, session.roomCode, session.self.id, session.self.photoVersion);
  const visiblePhotoUrl = previewUrl || savedPhotoUrl;
  return (
    <main className="player-shell">
      <header><p className="eyebrow">Morder</p><div className={`connection connection--${connectionState}`} role="status"><span aria-hidden="true" />{connectionMessage}</div></header>
      {!session ? (
        <section className="join-card"><div><p className="section-label">Player connection</p><h1>{isRecovering ? "Restoring your place…" : "Join the room"}</h1><p>Enter the name that should appear on the shared screen.</p></div><form onSubmit={joinRoom}><label>Room code<input name="roomCode" value={roomCode} onChange={(event) => { setRoomCode(event.target.value.toUpperCase().slice(0, 4)); setJoinError(""); }} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={4} placeholder="ABCD" disabled={isRecovering} required /></label><label>Display name<input name="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="nickname" maxLength={DISPLAY_NAME_MAX_LENGTH} placeholder="Your name" disabled={isRecovering} autoFocus={initialRoomQuery.status === "valid"} required /></label><button type="submit" disabled={connectionState !== "connected" || isJoining || isRecovering}>{isJoining ? "Joining…" : "Join room"}</button></form>{joinError ? <p className="error">{joinError}</p> : null}<p className="privacy-note">This creates a temporary room identity in this browser, not an account.</p></section>
      ) : session.game ? <GameScreen session={session} onState={applyState} /> : (
        <section className="confirmation-card"><p className="section-label">Joined room {session.roomCode}</p><h1>{session.self.displayName}</h1><div className="photo-preview">{visiblePhotoUrl ? <img src={visiblePhotoUrl} alt="Your player photo" /> : <span>{session.self.displayName.slice(0, 1).toUpperCase()}</span>}</div>{session.roomStatus === "open" ? <><p>Add a quick photo so everyone can recognize you. It stays only in this room and is optional.</p><div className="photo-actions"><button type="button" onClick={() => cameraInputRef.current?.click()} disabled={connectionState !== "connected" || isPreparingPhoto || isUploadingPhoto}>Take photo</button><button type="button" className="secondary-button" onClick={() => galleryInputRef.current?.click()} disabled={connectionState !== "connected" || isPreparingPhoto || isUploadingPhoto}>Choose photo</button></div><input ref={cameraInputRef} hidden type="file" accept="image/*" capture="user" onChange={(event) => void preparePhoto(event)} /><input ref={galleryInputRef} hidden type="file" accept="image/*" onChange={(event) => void preparePhoto(event)} />{preparedPhoto ? <button type="button" className="save-photo-button" onClick={() => void uploadPhoto()} disabled={isUploadingPhoto}>{isUploadingPhoto ? "Saving…" : "Save photo"}</button> : null}{isPreparingPhoto ? <p className="photo-status">Preparing photo…</p> : null}{photoStatus ? <p className="photo-status">{photoStatus}</p> : null}{photoError ? <p className="error">{photoError}</p> : null}<div className="waiting">Waiting for the host to lock the roster</div></> : <><p>The roster is locked. Waiting for the host to configure and start the game.</p><div className="waiting waiting--locked">Roster locked · waiting</div></>}</section>
      )}
      <footer>Room server: {serverUrl}</footer>
    </main>
  );
};
