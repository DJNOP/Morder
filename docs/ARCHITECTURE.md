# Architecture

## Status

The M0a room-and-join foundation implements the repository, transport, room,
projection, reconnect, local-network, and testing boundaries described here.
Game, role, voting, and photo sections remain forward constraints rather than
implemented functionality. The architecture optimizes for the first in-room
playtest, not theoretical scale.

## Repository and runtime shape

The repository uses native npm workspaces with the same coarse boundaries that
worked in Buzz:

```text
apps/
  host/         React + Vite public shared-screen client
  controller/   React + Vite private phone client
  server/       Node HTTP + Socket.IO authority
packages/
  shared/       TypeScript wire contracts, validation, and URL utilities
```

It uses strict TypeScript, React, Vite, Socket.IO, and Vitest. A small
repository-owned launcher builds shared contracts and starts the three runtime
workspaces without a monorepo framework. Morder uses fixed local ports 5183
(host), 5184 (phone/player), and 3101 (server), distinct from Buzz's active
development ports. Both clients derive the Socket.IO hostname from the page
host, with an optional `VITE_SERVER_URL` override.

Do not make Morder depend on Buzz. Copy the small proven pieces that remain
appropriate, rename them, remove game-specific fields, and add Morder tests.
The amount of reusable infrastructure is too small to justify a cross-project
package and shared release lifecycle.

## Authority boundaries

The server maintains one internal authoritative state per room:

```text
Internal room/game state
  ├─ publicHostProjection(room)       → shared TV/computer
  └─ playerProjection(room, playerId) → only that player's socket
```

M0a internal state contains host/socket indexes, membership, and reconnect
capabilities. Future internal state may add roles, night actions, vote choices,
investigation results, timers, and win state. None of those fields should
automatically become protocol types.

M0a defines separate `PublicLobbyProjection`, `PublicLobbyPlayer`,
`PrivatePlayerIdentity`, and `PlayerSession` wire types rather than `Omit`-ing
secrets from one large shared type. Explicit construction makes a newly added
internal field private by default and forces a deliberate choice before it
crosses the network.

### Public host projection

During play, the host may receive room code, public player IDs/names/photos,
connection/public life state, phase, public timer, submitted/not-submitted
progress only when safe, public announcements, vote outcome, and result data.
It must not receive live roles, target selections, individual votes if voting
is secret, or Sheriff results. The authoritative final state may deliberately
include the role reveal.

### Private player projection

A player may receive their own stable ID, own role, current permitted action,
valid public targets, own submission acknowledgement, own Sheriff result, and
the same public facts they need. They must not receive other roles, private
actions, votes, or investigation results.

Route every private update to the socket associated on the server with that
player. Do not accept a client-supplied trusted player ID, room ID, role, phase,
target validity, vote count, or resolution result.

## Server structure

Keep three focused layers:

1. **Room/session manager:** room codes, host socket, membership, display names,
   photo references, reconnect capabilities, socket indexes, and cleanup.
2. **Game engine:** phases, role assignment, legal actions, deadlines,
   resolution, elimination, votes, and win conditions. It receives trusted
   player commands from the transport and exposes projection functions.
3. **Socket/HTTP adapter:** validates wire payload shape, derives trusted
   identity from the socket, invokes room/game operations, and emits only the
   correct projection.

M0a implements the room/session manager and Socket.IO adapter. There is no game
engine or placeholder game state. Add the focused Murder game module in M1. Do
not build a generic role plugin system, event-sourcing layer, or state-machine
framework.

## Shared protocol

`packages/shared` contains only event names, request/acknowledgement and
projection types, small runtime validators, room-code/name normalization, and
join-URL helpers. It does not export the internal authoritative state type.

The current event families are deliberately small:

- host room creation and LAN-address requests;
- player join and reconnect requests;
- public host lobby snapshots; and
- player room-closed notices.

Future start, game, photo, action, and vote events should extend these recipient
boundaries rather than broadening the current lobby payload.

Use integration/type tests to prove event routing and serialized secret
absence. A test should fail if a Civilian or public host payload contains role
maps, private targets, votes, reconnect tokens, or another player's result.

## Room lifecycle and identity

- The server generates a short non-ambiguous room code and retries collisions.
- Rooms exist only in server memory. A server restart ends them.
- Each joined player receives a cryptographically random reconnect capability.
  The phone stores it under the Morder-specific local-storage key
  `morder:player-session:v1`; the host and other players never receive it.
- The server associates every current socket with its room/player identity.
  Clients do not submit a trusted player ID for lobby operations.
- Reconnect restores the same player and replaces an earlier socket. A late
  disconnect from the replaced socket cannot mark the new connection offline.
- A disconnected lobby player remains reserved for the room lifetime. There is
  no copied Buzz-style short seat expiry and no fixed four-player capacity.
- Host disconnect closes the room, invalidates its reconnect capabilities, and
  notifies connected players. Whether host refresh should recover a room is an
  explicit open question.

M0a tests cover room isolation, host authority, reconnect replacement, late
disconnect safety, public token absence, and disposal. A deliberate player
removal/expiry policy is still needed before one is implemented.

## Joining and local-network play

M0a implements the reusable parts of Buzz's local-network approach:

- bind the server and both Vite development servers to `0.0.0.0`;
- discover usable local IPv4 addresses on the server without depending on
  adapter names;
- let the host select among plausible addresses and display a copyable
  room-specific player URL;
- prefill but do not auto-submit the room join; and
- preserve manual room-code entry as the reliable fallback.

M0b should render that existing public URL as a high-contrast QR code locally
in the host browser. The QR must contain only the player URL and room code, not
a reconnect capability. Local all-interface binding and browser behavior have
been verified, but real-phone reachability has not. The physical acceptance
pass should cover a real camera, reload, brief network loss, and any firewall,
VPN, guest-network, or client-isolation problems actually encountered.

## Temporary player photos

Use the phone's standard file input with `accept="image/*"` and the `capture`
hint, allowing either camera capture or an existing image. Before upload, the
controller should orient/crop to a simple square, resize to a modest resolution
(a starting experiment around 320–512 px), and encode at a bounded quality.

Upload once, validate a strict byte limit and supported media type on the
server (including basic file-signature checking rather than trusting the
client's MIME label), and keep the bytes only in memory. Store an opaque photo
ID/revision in room state. Serve the photo from the same local server (or emit a
bounded binary payload) and let clients use an object/HTTP URL; do not embed
repeated base64 images in every room snapshot. Remove bytes on player removal,
room closure, or server restart. Serve photo responses with `Cache-Control:
no-store`, and revoke client object URLs when replaced or unmounted so temporary
images are not retained longer than the prototype needs them.

The exact crop, resolution, format, byte cap, and fallback avatar should be
measured on real iOS/Android browsers during M0 rather than treated as a
permanent design. No cloud storage, face processing, profile library, or image
history is needed.

## Frontend structure

Keep the host and controller as separate applications because they have
different trust projections, screen constraints, and interaction goals. Within
each, use small feature components rather than importing Buzz's coupled
`App.tsx` files or visual system.

M0a currently provides:

- host: connection status, create-room action, LAN-address selection, copyable
  join URL, and a live public lobby with connected/disconnected state; and
- controller: connection status, URL-prefilled/manual join form, join errors,
  private session confirmation, stored reconnect session, refresh restoration,
  and room-closed handling.

QR, photo, and start/lock components do not exist yet. Add them as focused
feature components when their M0 slice begins. There is no shared frontend or
design-system package; introduce a shared helper only after real duplication.

Private phone state must be cleared or replaced when reconnect restoration
fails or the room closes. Avoid logging protocol payloads containing role or
action data.

## Testing strategy

Use the proven Buzz test shape, adapted to hidden information:

- **Pure unit tests:** normalization, room codes, role allocation, legal target
  rules, night resolution, vote ties, win conditions, and projection builders.
- **Room-manager tests:** capacity policy, duplicate names, disconnect,
  reconnect replacement, cleanup, and token absence from public data.
- **Socket integration tests:** multiple rooms/clients, unauthorized/malformed
  events, private routing, no cross-room leakage, and serialized payload checks
  for every recipient class.
- **Frontend tests:** join-query handling, photo preparation errors, phase
  rendering, and absence of secret data dependencies in public components.
- **Live smoke test:** start the real stack and exercise room creation, joins,
  projection isolation, reconnect, and host closure.
- **Physical checks:** QR scan, camera/file chooser, photo performance, several
  real phones, television readability, network friction, and interaction
  leakage. Automated tests cannot replace this evidence.

M0a currently has 25 automated tests across shared URL behavior, room codes,
network-address filtering, room/session behavior, Socket.IO routing, malformed
and unauthorized events, room isolation, more than four players, public token
absence, and reconnect replacement. The repository smoke test starts from the
real HTTP/Socket.IO surfaces and checks two rooms, five joins, invalid-room
rejection, disconnect, and identity-preserving reconnect. The host/player flow
was also exercised in real browser UIs; a physical phone remains unverified.

Inject clocks, randomness, schedulers, and role allocation into the M1 game
module so night, discussion, vote, and tie behavior can be tested without real
delays.

## Deployment assumptions

There is no production deployment recommendation yet. The first stack runs on
one computer and a trusted local network. CORS, transport security, internet
exposure, durable storage, abuse controls, and remote host authentication must
be revisited before any internet deployment; they should not be smuggled into
M0 as speculative infrastructure.
