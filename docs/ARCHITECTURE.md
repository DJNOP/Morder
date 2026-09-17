# Starting Architecture Recommendation

## Status

This is the recommended architecture derived from the Buzz audit. It is not
implemented and is not an accepted permanent stack decision. The recommendation
optimizes for the first in-room playtest, not theoretical scale.

## Repository and runtime shape

Use native npm workspaces with the same coarse boundaries that worked in Buzz:

```text
apps/
  host/         React + Vite public shared-screen client
  controller/   React + Vite private phone client
  server/       Node HTTP + Socket.IO authority
packages/
  shared/       TypeScript wire contracts, validation, and URL utilities
```

Use strict TypeScript, React, Vite, Socket.IO, and Vitest. Retain a small
repository-owned development launcher rather than adding a monorepo framework.
Keep fixed local development ports initially and derive the Socket.IO server
hostname from the page host, with an optional environment override.

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

The internal state may contain membership, reconnect capabilities, roles,
night actions, vote choices, investigation results, timers, and win state.
None of those fields should automatically become protocol types.

Define separate wire types rather than `Omit`-ing secrets from one large shared
type. Explicit construction makes a newly added internal field private by
default and forces a deliberate choice before it crosses the network.

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

M0 needs only the first and third layers plus empty projection boundaries. Add
the focused Murder game module in M1. Do not build a generic role plugin system,
event-sourcing layer, or state-machine framework.

## Shared protocol

`packages/shared` should contain event names, request/acknowledgement and
projection types, small runtime validators, room-code/name normalization, and
join-URL helpers. It must not export the internal authoritative state type.

Prefer explicit event families, for example:

- host create/start requests and public room/game snapshots;
- player join/reconnect/photo/action/vote requests;
- recipient-specific player snapshots; and
- public room-closed or recoverable-error notices.

Use integration/type tests to prove event routing and serialized secret
absence. A test should fail if a Civilian or public host payload contains role
maps, private targets, votes, reconnect tokens, or another player's result.

## Room lifecycle and identity

- Generate a short, non-ambiguous room code with collision handling.
- Keep rooms in memory for the first prototype.
- Issue each joined player a cryptographically random reconnect capability and
  store it in that phone browser's local storage under a Morder-specific key.
- Associate all commands with the server-side socket-to-player index.
- A successful reconnect replaces the old socket and restores the same player,
  role, life state, and pending/submitted action state.
- Closing the room when the host disconnects is acceptable initially; host
  recovery remains an explicit open question.
- Do not copy Buzz's hard-coded four-player capacity or 20-second in-game seat
  expiry. Morder's player count is unresolved, and an active game's role must
  not disappear because a phone was offline briefly. A lobby cleanup grace and
  active-game retention policy should be chosen deliberately.
- Server restart may end all rooms in the prototype.

Room isolation, host authority, reconnect replacement, expiry behavior, stale
timer safety, and disposal must be covered by deterministic tests.

## Joining and local-network play

Reuse Buzz's approach:

- bind the server and both Vite development servers to `0.0.0.0`;
- discover usable local IPv4 addresses on the server without depending on
  adapter names;
- let the host select among plausible addresses;
- render a high-contrast QR code locally in the host browser;
- put only the controller URL and room code in the QR—not a player capability;
- prefill but do not auto-submit the room join; and
- preserve manual room-code entry as the reliable fallback.

The first physical acceptance pass must cover a real camera, several phones,
guest-network/client-isolation behavior, VPN adapters, Windows firewall prompts,
reload, brief network loss, and host closure.

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

Useful initial boundaries are:

- host: connection status, create-room action, join/QR card, public lobby,
  player/photo card, and start/lock action;
- controller: connection status, join form, photo capture/preview/submit,
  private session shell, and later phase/action screens; and
- shared frontend helpers only when duplication becomes real. Do not create a
  design-system package for M0.

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

Inject clocks, randomness, schedulers, and role allocation into the M1 game
module so night, discussion, vote, and tie behavior can be tested without real
delays.

## Deployment assumptions

There is no production deployment recommendation yet. The first stack runs on
one computer and a trusted local network. CORS, transport security, internet
exposure, durable storage, abuse controls, and remote host authentication must
be revisited before any internet deployment; they should not be smuggled into
M0 as speculative infrastructure.
