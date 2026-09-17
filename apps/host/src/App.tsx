import { useEffect, useMemo, useState } from "react";
import {
  HOST_CREATE_ROOM_EVENT,
  HOST_GET_NETWORK_ADDRESSES_EVENT,
  HOST_LOCK_ROOM_EVENT,
  HOST_LOBBY_STATE_EVENT,
  buildPlayerJoinUrl,
  buildPlayerPhotoUrl,
  type LocalNetworkAddress,
  type PublicLobbyProjection,
} from "@morder/shared";
import { JoinQrCode } from "./JoinQrCode";
import { hostSocket, serverUrl } from "./socket";

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

const copyText = async (value: string) => {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard API unavailable.");
  }
  await navigator.clipboard.writeText(value);
};

export const App = () => {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [connectionMessage, setConnectionMessage] = useState(
    "Connecting to the room server…",
  );
  const [lobby, setLobby] = useState<PublicLobbyProjection>();
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [networkAddresses, setNetworkAddresses] = useState<
    LocalNetworkAddress[] | null
  >(null);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [isLocking, setIsLocking] = useState(false);
  const [lockError, setLockError] = useState("");

  useEffect(() => {
    let active = true;

    const readNetworkAddresses = () => {
      hostSocket.emit(HOST_GET_NETWORK_ADDRESSES_EVENT, (result) => {
        if (!active) {
          return;
        }
        const addresses = result.ok ? result.addresses : [];
        setNetworkAddresses(addresses);
        setSelectedAddress((current) => {
          if (addresses.some((candidate) => candidate.address === current)) {
            return current;
          }
          return addresses[0]?.address ?? window.location.hostname;
        });
      });
    };

    const onConnect = () => {
      setConnectionState("connected");
      setConnectionMessage("Connected to the room server");
      readNetworkAddresses();
    };
    const onDisconnect = () => {
      setConnectionState("disconnected");
      setConnectionMessage("Disconnected — this room has closed");
      setLobby(undefined);
      setIsCreating(false);
      setIsLocking(false);
    };
    const onConnectError = (error: Error) => {
      setConnectionState("error");
      setConnectionMessage(`Server unavailable: ${error.message}`);
    };
    const onLobbyState = (nextLobby: PublicLobbyProjection) => {
      setLobby(nextLobby);
      setCreateError("");
      setIsCreating(false);
      setIsLocking(false);
      setLockError("");
    };

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

  const createRoom = () => {
    setIsCreating(true);
    setCreateError("");
    hostSocket.emit(HOST_CREATE_ROOM_EVENT, (result) => {
      setIsCreating(false);
      if (result.ok) {
        setLobby(result.lobby);
        return;
      }
      setCreateError(result.error.message);
    });
  };

  const joinAddress = selectedAddress || window.location.hostname;
  const joinUrl = useMemo(
    () =>
      lobby && networkAddresses !== null
        ? buildPlayerJoinUrl(joinAddress, lobby.roomCode)
        : "",
    [joinAddress, lobby, networkAddresses],
  );
  const usesLoopback = joinAddress === "localhost" || joinAddress === "127.0.0.1";

  const lockRoster = () => {
    if (!lobby || lobby.roomStatus !== "open" || isLocking) {
      return;
    }
    setIsLocking(true);
    setLockError("");
    hostSocket.emit(HOST_LOCK_ROOM_EVENT, (result) => {
      setIsLocking(false);
      if (result.ok) {
        setLobby(result.lobby);
        return;
      }
      setLockError(result.error.message);
    });
  };

  return (
    <main className="host-shell">
      <header className="host-header">
        <div>
          <p className="eyebrow">Morder · multiplayer foundation</p>
          <h1>Shared room</h1>
        </div>
        <div
          className={`connection connection--${connectionState}`}
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true" />
          {connectionMessage}
        </div>
      </header>

      {!lobby ? (
        <section className="start-card">
          <p>
            Create an ephemeral room, then open the player link on phones using
            the same local network.
          </p>
          <button
            type="button"
            onClick={createRoom}
            disabled={connectionState !== "connected" || isCreating}
          >
            {isCreating ? "Creating room…" : "Create room"}
          </button>
          {createError ? <p className="error" role="alert">{createError}</p> : null}
        </section>
      ) : (
        <div className="lobby-layout">
          <section className="join-card" aria-label="Room joining information">
            <p className="section-label">Room code</p>
            <strong className="room-code">{lobby.roomCode}</strong>
            <p>
              {lobby.roomStatus === "open"
                ? "Scan to join, open the link, or enter the room code manually."
                : "The roster is locked. Existing players can still reconnect."}
            </p>

            {lobby.roomStatus === "locked" ? (
              <div className="locked-notice">
                <strong>Roster locked</strong>
                <span>No new players or photo changes are accepted.</span>
              </div>
            ) : networkAddresses === null ? (
              <p className="network-message" role="status">
                Finding this computer on the local network…
              </p>
            ) : (
              <>
                <JoinQrCode joinUrl={joinUrl} roomCode={lobby.roomCode} />
                <p className="qr-caption">
                  Generated locally from the public player link only.
                </p>

                {networkAddresses.length > 1 ? (
                  <label>
                    Local network address
                    <select
                      value={selectedAddress}
                      onChange={(event) => {
                        setSelectedAddress(event.target.value);
                        setCopyStatus("");
                      }}
                    >
                      {networkAddresses.map((candidate) => (
                        <option key={candidate.address} value={candidate.address}>
                          {candidate.address}
                          {candidate.isPrivate
                            ? " — private network"
                            : " — other"}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label>
                  Player join URL
                  <div className="copy-row">
                    <input
                      value={joinUrl}
                      readOnly
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void copyText(joinUrl)
                          .then(() => setCopyStatus("Copied"))
                          .catch(() =>
                            setCopyStatus("Select and copy the link"),
                          );
                      }}
                    >
                      Copy
                    </button>
                  </div>
                </label>
                <span className="copy-status" role="status">
                  {copyStatus}
                </span>

                {usesLoopback ? (
                  <p className="warning">
                    No LAN address was detected. This loopback link works only
                    on this computer; manual network configuration may be
                    required.
                  </p>
                ) : (
                  <p className="network-note">
                    Keep the host and phones on the same trusted local network.
                  </p>
                )}
              </>
            )}
          </section>

          <section className="players-card" aria-labelledby="players-heading">
            <div className="players-heading">
              <div>
                <p className="section-label">Live lobby</p>
                <h2 id="players-heading">Joined players</h2>
              </div>
              <strong>{lobby.players.length}</strong>
            </div>

            {lobby.players.length === 0 ? (
              <p className="empty-state">Waiting for the first player…</p>
            ) : (
              <ul className="player-list">
                {lobby.players.map((player) => (
                  <li key={player.id} className={`player player--${player.connectionState}`}>
                    <div className="player-photo">
                      {player.photoVersion == null ? (
                        <span aria-hidden="true">
                          {player.displayName.slice(0, 1).toUpperCase()}
                        </span>
                      ) : (
                        <img
                          src={buildPlayerPhotoUrl(
                            serverUrl,
                            lobby.roomCode,
                            player.id,
                            player.photoVersion,
                          )}
                          alt={`${player.displayName}'s photo`}
                        />
                      )}
                    </div>
                    <div className="player-details">
                      <strong>{player.displayName}</strong>
                      <span>
                        <i className="player-dot" aria-hidden="true" />
                        {player.connectionState}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {lobby.roomStatus === "open" ? (
              <div className="roster-controls">
                <p>
                  Photos are encouraged but optional. Locking fixes this roster
                  for the next development step.
                </p>
                <button
                  type="button"
                  className="lock-button"
                  onClick={lockRoster}
                  disabled={
                    connectionState !== "connected" ||
                    isLocking ||
                    lobby.players.length === 0
                  }
                >
                  {isLocking ? "Locking…" : "Lock roster"}
                </button>
                {lockError ? <p className="error" role="alert">{lockError}</p> : null}
              </div>
            ) : (
              <div className="roster-locked-status" role="status">
                Roster locked · waiting for gameplay development
              </div>
            )}
          </section>
        </div>
      )}

      <footer>Room server: {serverUrl}</footer>
    </main>
  );
};
