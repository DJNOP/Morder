import { useEffect, useMemo, useState } from "react";
import {
  HOST_CONFIGURE_ROLES_EVENT,
  HOST_CREATE_ROOM_EVENT,
  HOST_GET_NETWORK_ADDRESSES_EVENT,
  HOST_LOCK_ROOM_EVENT,
  HOST_LOBBY_STATE_EVENT,
  HOST_START_GAME_EVENT,
  HOST_START_VOTING_EVENT,
  buildPlayerJoinUrl,
  buildPlayerPhotoUrl,
  type GameRole,
  type LocalNetworkAddress,
  type PublicLobbyPlayer,
  type PublicLobbyProjection,
  type PublicOutcome,
  type RoleCounts,
} from "@morder/shared";
import { JoinQrCode } from "./JoinQrCode";
import { hostSocket, serverUrl } from "./socket";

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

const roleLabels: Record<keyof RoleCounts, string> = {
  civilian: "Civilians",
  murderer: "Murderers",
  doctor: "Doctors",
  sheriff: "Sheriffs",
};

const roleDisplay: Record<GameRole, string> = {
  civilian: "Civilian",
  murderer: "Murderer",
  doctor: "Doctor",
  sheriff: "Sheriff",
};

const copyText = async (value: string) => {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable.");
  await navigator.clipboard.writeText(value);
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
  if (outcome.kind === "no-votes") return "No valid votes were cast. Nobody was eliminated.";
  return "Nobody died.";
};

const PlayerCard = ({ player, roomCode }: { player: PublicLobbyPlayer; roomCode: string }) => (
  <li className={`player player--${player.connectionState} player--${player.lifeState}`}>
    <div className="player-photo">
      {player.photoVersion == null ? (
        <span aria-hidden="true">{player.displayName.slice(0, 1).toUpperCase()}</span>
      ) : (
        <img src={buildPlayerPhotoUrl(serverUrl, roomCode, player.id, player.photoVersion)} alt={`${player.displayName}'s photo`} />
      )}
    </div>
    <div className="player-details">
      <strong>{player.displayName}</strong>
      <span><i className="player-dot" aria-hidden="true" />{player.connectionState}</span>
      {player.lifeState === "eliminated" ? <em>Eliminated</em> : null}
    </div>
  </li>
);

const GameView = ({
  lobby,
  busy,
  error,
  onStartVoting,
}: {
  lobby: PublicLobbyProjection;
  busy: boolean;
  error: string;
  onStartVoting: () => void;
}) => {
  const game = lobby.game!;
  const deadline = "deadline" in game ? game.deadline : undefined;
  const countdown = useCountdown(deadline);
  const title =
    game.phase === "night-actions" || game.phase === "night-result"
      ? "Night"
      : game.phase === "morning"
        ? "Morning"
        : game.phase === "discussion"
          ? "Discussion"
          : game.phase === "voting"
            ? "Voting"
            : game.phase === "vote-result"
              ? "Vote result"
              : "Game over";
  return (
    <div className="game-layout">
      <section className="phase-card">
        <p className="section-label">Round {game.round}</p>
        <h2>{title}</h2>
        {countdown != null ? <div className="countdown" aria-label={`${countdown} seconds remaining`}>{countdown}</div> : null}
        {game.phase === "night-actions" || game.phase === "night-result" ? (
          <p>Private actions are happening. The shared screen reveals no progress.</p>
        ) : null}
        {game.phase === "morning" || game.phase === "vote-result" ? (
          <div className="public-announcement">{outcomeText(game.outcome)}</div>
        ) : null}
        {game.phase === "discussion" ? (
          <>
            <p>Talk to the room. The discussion is intentionally untimed.</p>
            <button type="button" className="lock-button" onClick={onStartVoting} disabled={busy}>Start voting</button>
          </>
        ) : null}
        {game.phase === "voting" ? <p>Every living player votes privately. No live progress or tally is shown.</p> : null}
        {game.phase === "result" ? (
          <div className="public-announcement">
            {game.winner === "murderers" ? "The Murderers win." : "The non-Murderers win."}
          </div>
        ) : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </section>
      <section className="players-card">
        <div className="players-heading">
          <div><p className="section-label">Public roster</p><h2>Players</h2></div>
          <strong>{lobby.players.filter((player) => player.lifeState === "alive").length}</strong>
        </div>
        <ul className="player-list">{lobby.players.map((player) => <PlayerCard key={player.id} player={player} roomCode={lobby.roomCode} />)}</ul>
        {game.phase === "result" ? (
          <div className="role-reveal">
            <h3>Final roles</h3>
            {game.reveal.map((player) => (
              <p key={player.id}><strong>{player.displayName}</strong> — {roleDisplay[player.role]} · {player.lifeState}</p>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
};

export const App = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [connectionMessage, setConnectionMessage] = useState("Connecting to the room server…");
  const [lobby, setLobby] = useState<PublicLobbyProjection>();
  const [isCreating, setIsCreating] = useState(false);
  const [networkAddresses, setNetworkAddresses] = useState<LocalNetworkAddress[] | null>(null);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const readNetworkAddresses = () => hostSocket.emit(HOST_GET_NETWORK_ADDRESSES_EVENT, (result) => {
      if (!active) return;
      const addresses = result.ok ? result.addresses : [];
      setNetworkAddresses(addresses);
      setSelectedAddress((current) => addresses.some((candidate) => candidate.address === current) ? current : addresses[0]?.address ?? window.location.hostname);
    });
    const onConnect = () => { setConnectionState("connected"); setConnectionMessage("Connected to the room server"); readNetworkAddresses(); };
    const onDisconnect = () => { setConnectionState("disconnected"); setConnectionMessage("Disconnected — this room has closed"); setLobby(undefined); setBusy(false); };
    const onConnectError = (nextError: Error) => { setConnectionState("error"); setConnectionMessage(`Server unavailable: ${nextError.message}`); };
    const onLobbyState = (nextLobby: PublicLobbyProjection) => { setLobby(nextLobby); setIsCreating(false); setBusy(false); setError(""); };
    hostSocket.on("connect", onConnect);
    hostSocket.on("disconnect", onDisconnect);
    hostSocket.on("connect_error", onConnectError);
    hostSocket.on(HOST_LOBBY_STATE_EVENT, onLobbyState);
    hostSocket.connect();
    return () => {
      active = false;
      hostSocket.off("connect", onConnect);
      hostSocket.off("disconnect", onDisconnect);
      hostSocket.off("connect_error", onConnectError);
      hostSocket.off(HOST_LOBBY_STATE_EVENT, onLobbyState);
      hostSocket.disconnect();
    };
  }, []);

  const runHostCommand = (emit: (done: (result: { ok: boolean; lobby?: PublicLobbyProjection; error?: { message: string } }) => void) => void) => {
    setBusy(true);
    setError("");
    emit((result) => {
      setBusy(false);
      if (result.ok && result.lobby) setLobby(result.lobby);
      else setError(result.error?.message ?? "The host command failed.");
    });
  };
  const joinAddress = selectedAddress || window.location.hostname;
  const joinUrl = useMemo(() => lobby && networkAddresses !== null ? buildPlayerJoinUrl(joinAddress, lobby.roomCode) : "", [joinAddress, lobby, networkAddresses]);
  const usesLoopback = joinAddress === "localhost" || joinAddress === "127.0.0.1";

  const configureRole = (role: keyof RoleCounts, delta: number) => {
    if (!lobby?.roleSetup) return;
    const counts = { ...lobby.roleSetup.counts, [role]: Math.max(0, lobby.roleSetup.counts[role] + delta) };
    runHostCommand((done) => hostSocket.emit(HOST_CONFIGURE_ROLES_EVENT, { counts }, done));
  };

  return (
    <main className="host-shell">
      <header className="host-header">
        <div><p className="eyebrow">Morder · initial ruleset</p><h1>Shared room</h1></div>
        <div className={`connection connection--${connectionState}`} role="status" aria-live="polite"><span aria-hidden="true" />{connectionMessage}</div>
      </header>

      {!lobby ? (
        <section className="start-card">
          <p>Create an ephemeral room, then open the player link on phones using the same local network.</p>
          <button type="button" onClick={() => {
            setIsCreating(true); setError("");
            hostSocket.emit(HOST_CREATE_ROOM_EVENT, (result) => { setIsCreating(false); result.ok ? setLobby(result.lobby) : setError(result.error.message); });
          }} disabled={connectionState !== "connected" || isCreating}>{isCreating ? "Creating room…" : "Create room"}</button>
          {error ? <p className="error" role="alert">{error}</p> : null}
        </section>
      ) : lobby.game ? (
        <GameView lobby={lobby} busy={busy} error={error} onStartVoting={() => runHostCommand((done) => hostSocket.emit(HOST_START_VOTING_EVENT, done))} />
      ) : (
        <div className="lobby-layout">
          <section className="join-card" aria-label="Room joining information">
            <p className="section-label">Room code</p><strong className="room-code">{lobby.roomCode}</strong>
            {lobby.roomStatus === "open" ? (
              <>
                <p>Scan to join, open the link, or enter the room code manually.</p>
                {networkAddresses === null ? <p>Finding this computer on the local network…</p> : (
                  <>
                    <JoinQrCode joinUrl={joinUrl} roomCode={lobby.roomCode} />
                    <p className="qr-caption">Generated locally from the public player link only.</p>
                    {networkAddresses.length > 1 ? <label>Local network address<select value={selectedAddress} onChange={(event) => { setSelectedAddress(event.target.value); setCopyStatus(""); }}>{networkAddresses.map((candidate) => <option key={candidate.address} value={candidate.address}>{candidate.address}{candidate.isPrivate ? " — private network" : " — other"}</option>)}</select></label> : null}
                    <label>Player join URL<div className="copy-row"><input value={joinUrl} readOnly onFocus={(event) => event.currentTarget.select()} /><button type="button" onClick={() => void copyText(joinUrl).then(() => setCopyStatus("Copied")).catch(() => setCopyStatus("Select and copy the link"))}>Copy</button></div></label>
                    <span className="copy-status">{copyStatus}</span>
                    <p className={usesLoopback ? "warning" : "network-note"}>{usesLoopback ? "This loopback link works only on this computer." : "Keep the host and phones on the same trusted local network."}</p>
                  </>
                )}
              </>
            ) : lobby.roleSetup ? (
              <div className="role-setup">
                <p className="section-label">Role setup</p>
                <h2>Configure the game</h2>
                {Object.keys(roleLabels).map((key) => {
                  const role = key as keyof RoleCounts;
                  return <div className="role-control" key={role}><strong>{roleLabels[role]}</strong><div><button type="button" aria-label={`Remove ${roleLabels[role]}`} onClick={() => configureRole(role, -1)} disabled={busy || lobby.roleSetup!.counts[role] === 0}>−</button><span>{lobby.roleSetup!.counts[role]}</span><button type="button" aria-label={`Add ${roleLabels[role]}`} onClick={() => configureRole(role, 1)} disabled={busy}>+</button></div></div>;
                })}
                <p className="role-total">Assigned {lobby.roleSetup.totalAssigned} of {lobby.roleSetup.playerCount}</p>
                <p className={lobby.roleSetup.valid ? "valid" : "error"}>{lobby.roleSetup.message}</p>
                <button type="button" className="lock-button" disabled={!lobby.roleSetup.valid || busy} onClick={() => runHostCommand((done) => hostSocket.emit(HOST_START_GAME_EVENT, done))}>{busy ? "Starting…" : "Start game"}</button>
                {error ? <p className="error" role="alert">{error}</p> : null}
              </div>
            ) : null}
          </section>

          <section className="players-card" aria-labelledby="players-heading">
            <div className="players-heading"><div><p className="section-label">Live lobby</p><h2 id="players-heading">Joined players</h2></div><strong>{lobby.players.length}</strong></div>
            {lobby.players.length === 0 ? <p className="empty-state">Waiting for the first player…</p> : <ul className="player-list">{lobby.players.map((player) => <PlayerCard key={player.id} player={player} roomCode={lobby.roomCode} />)}</ul>}
            {lobby.roomStatus === "open" ? (
              <div className="roster-controls"><p>Photos are encouraged but optional. Locking fixes this roster.</p><button type="button" className="lock-button" onClick={() => runHostCommand((done) => hostSocket.emit(HOST_LOCK_ROOM_EVENT, done))} disabled={busy || lobby.players.length === 0}>{busy ? "Locking…" : "Lock roster"}</button>{error ? <p className="error">{error}</p> : null}</div>
            ) : <div className="roster-locked-status">Roster locked · configure roles to continue</div>}
          </section>
        </div>
      )}
      <footer>Room server: {serverUrl}</footer>
    </main>
  );
};
