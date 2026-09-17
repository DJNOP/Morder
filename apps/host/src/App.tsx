import { useEffect, useMemo, useState } from "react";
import {
  HOST_CREATE_ROOM_EVENT,
  HOST_GET_NETWORK_ADDRESSES_EVENT,
  HOST_LOBBY_STATE_EVENT,
  buildPlayerJoinUrl,
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
    };
    const onConnectError = (error: Error) => {
      setConnectionState("error");
      setConnectionMessage(`Server unavailable: ${error.message}`);
    };
    const onLobbyState = (nextLobby: PublicLobbyProjection) => {
      setLobby(nextLobby);
      setCreateError("");
      setIsCreating(false);
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
            <p>Scan to join, open the link, or enter the room code manually.</p>

            {networkAddresses === null ? (
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
                    <span className="player-dot" aria-hidden="true" />
                    <strong>{player.displayName}</strong>
                    <span>{player.connectionState}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <footer>Room server: {serverUrl}</footer>
    </main>
  );
};
