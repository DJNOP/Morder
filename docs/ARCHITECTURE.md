# Architecture

## Status

M0 and M1 are implemented. The repository now includes the transport, room,
projection, reconnect, local-network, QR, temporary-photo, roster-lock, focused
four-role game engine, fixed phase scheduling, and explicit public/private game
projections described here. The architecture optimizes for the first in-room
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

Internal state contains host/socket indexes, membership, reconnect
capabilities, room status, temporary photo bytes, roles, night actions, vote
choices, investigation results, timers, and win state. None of those fields
automatically become protocol types.

The protocol defines separate `PublicLobbyProjection`, `PublicLobbyPlayer`,
`PrivatePlayerIdentity`, and `PlayerSession` wire types rather than `Omit`-ing
secrets from one large shared type. Explicit construction makes a newly added
internal field private by default and forces a deliberate choice before it
crosses the network.

### Public host projection

During play, the host receives room code, public player IDs/names/photos,
connection/life state, phase, public timer, announcements, vote outcome, and
result data. It receives no completion progress, live roles, target selections,
individual votes, team consensus, or Sheriff results. The authoritative final
state deliberately includes the role reveal.

### Private player projection

A living player receives their own role, permitted action, targets, relevant
living teammates and team selections during night only, their own voting
selection, and their own Sheriff result when applicable. Daytime projections
are role-neutral and secret-free. Eliminated players receive only a generic
phase marker until the result. No player receives another team's roles,
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

The room/session manager, Socket.IO adapter, and one focused game module for
Murderer, Doctor, Sheriff, and Civilian rules are implemented. Do not turn them
into a generic role plugin system, event-sourcing layer, or generalized
state-machine framework.

## Shared protocol

`packages/shared` contains only event names, request/acknowledgement and
projection types, small runtime validators, room-code/name normalization, and
join-URL helpers. It does not export the internal authoritative state type.

The event families are deliberately small:

- host room creation and LAN-address requests;
- player join, reconnect, and own-photo upload requests;
- host roster lock, role configuration, game start, and voting-start requests;
- player target selection and confirmation requests;
- public host room/game snapshots and recipient-specific private player-state
  updates; and
- player room-closed notices.

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
- A room begins `open` and can move once to `locked`. The server owns that
  transition. Locked rooms reject new identities and photo changes but accept
  reconnect capabilities already belonging to the fixed roster.

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

M0b adds `qrcode.react` and renders that existing public URL as a high-contrast
SVG in the host browser with error-correction level M and a quiet margin. The
QR is generated locally, changes with the selected address, and contains only
the player URL and room code—not a reconnect capability or other private data.
The visible/copyable URL and manual room-code entry remain fallbacks.

A real phone has scanned the QR, opened the player page, joined over the same
Wi-Fi, and appeared in the host lobby. Other networks may still expose
firewall, VPN, guest-network, or client-isolation problems and should be treated
as environment-specific troubleshooting rather than automatically changing
machine network settings.

## Temporary player photos

The phone uses separate standard file inputs for camera capture and gallery
selection. It decodes normal phone orientation, preserves aspect ratio, limits
the long edge to 512 px, and encodes JPEG at quality 0.82. The preview is a
short-lived browser object URL; the original and normalized bytes are not
stored in browser local storage.

The normalized JPEG travels as a binary Socket.IO payload on the joined
player's authenticated socket, so a client cannot name another player as the
upload target. The server independently requires JPEG content/signature and a
maximum 400 KiB payload, copies it into the in-memory player record, and
increments `photoVersion` on replacement.

`PublicLobbyProjection` and private player state contain only the version, not
raw bytes. The host and player fetch the current image from the room/player
scoped HTTP endpoint using that version as a cache-busting query. The endpoint
contains no reconnect capability, returns 404 outside the exact live
room/player/photo scope, and serves with `Cache-Control: no-store`. Room closure,
server restart, or manager disposal removes the only stored bytes. No cloud or
filesystem storage, face processing, crop editor, profile library, or history
exists.

## Frontend structure

Keep the host and controller as separate applications because they have
different trust projections, screen constraints, and interaction goals. Within
each, use small feature components rather than importing Buzz's coupled
`App.tsx` files or visual system.

The current clients provide:

- host: connection status, create-room action, LAN-address selection, locally
  generated QR, copyable join URL, a live public photo/name lobby, and a
  one-way roster lock, role-count controls, public phase timers/outcomes,
  host-started voting, public life state, winner, and final role reveal; and
- controller: connection status, URL-prefilled/manual join form, join errors,
  private session confirmation, stored reconnect session, refresh restoration,
  camera/gallery photo preparation, own-photo upload/replacement, minimal room
  status, locked waiting UI, role-specific night controls, private Sheriff
  result, role-neutral daytime screens, voting, generic eliminated state,
  result, and room-closed handling.

There is no shared frontend or design-system package; introduce a shared helper
only after real duplication.

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

The repository currently has 54 automated tests across controller photo
preparation, host QR rendering, shared URL behavior, room/session behavior,
Socket.IO routing, role validation/assignment, legal targets, consensus,
protection, investigation, voting, ties, abstention, elimination, win checks,
timers, reconnect, and serialized projection boundaries. The game module uses
injected clocks, randomness, and scheduling so fixed-duration behavior is
tested without real delays.

The live smoke starts from the real HTTP/Socket.IO surfaces and runs M0 plus a
production-timed five-player four-role game through final reveal. Independent
browser checks completed a four-player game across isolated origins, including
the advertised LAN address. The earlier same-Wi-Fi physical-phone check covers
QR join and camera-photo upload; the next social playtest must cover the full
game on physical phones.

## Deployment assumptions

There is no production deployment recommendation yet. The first stack runs on
one computer and a trusted local network. CORS, transport security, internet
exposure, durable storage, abuse controls, and remote host authentication must
be revisited before any internet deployment; they should not be smuggled into
M0 as speculative infrastructure.
