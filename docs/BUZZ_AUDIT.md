# Buzz Technical Audit

## Audit scope and repository state

Buzz was inspected read-only at `C:\Users\Nicho\Desktop\Buzz` on 2026-09-17.
The remote is `https://github.com/DJNOP/Party-game.git`. The source
implementation inspected is the state represented by `5638999` (the current
`main` implementation).

The audit opened on `art/signal-sprint-lighting-station-kit` at `22bf529` with
pre-existing documentation changes and one untracked documentation file. The
branch's tracked difference from `5638999` was art/design documentation only.
While this audit was in progress, another process repeatedly committed or moved
Buzz's documentation state between local branches; comparison confirmed that
the application source being audited did not change. This task made no writes
to Buzz.

## Actual repository and tooling

Buzz is a private ESM npm workspace:

```text
apps/host        React 19 + Vite 8 shared-screen application
apps/controller  React 19 + Vite 8 phone controller application
apps/server      Node HTTP + Socket.IO 4 server
packages/shared  Built TypeScript protocol and join-URL package
scripts/         Development launcher and live multiplayer smoke scenario
docs/            Product, architecture, roadmap, decisions, questions, and art records
```

- **Package manager:** npm with `package-lock.json` and native workspaces.
- **Language:** strict TypeScript with `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`.
- **Frontend:** two separate React/Vite applications.
- **Backend:** Node's HTTP server plus Socket.IO; no Express, database, or
  persistence.
- **Build:** TypeScript builds the shared/server packages; Vite builds both
  clients. A small Node script launches all three development processes.
- **Root scripts:** `dev` builds the shared package and launches all three
  watchers; `typecheck` runs workspace checks; `test` builds shared then runs
  workspace tests; `build` builds shared, server, host, and controller in
  sequence; `smoke` runs the live multi-client scenario.
- **Tests:** Vitest unit, type, component/render, room-manager, and real
  Socket.IO integration tests, plus a production-duration smoke script.
- **Lint/format:** none configured. Strict typecheck, tests, and build are the
  automated gates.
- **Deployment:** no production or cloud deployment. Services bind to all local
  interfaces on ports 5173 (host), 5174 (controller), and 3001 (Socket.IO).
  Vite 8 requires Node `^20.19.0` or `>=22.12.0`; Buzz records validation on
  Node 24.15.0/npm 11.12.1.

The root documentation system is useful: a human-readable status file points
to durable product, architecture, roadmap, decisions, open questions, and idea
records. Its art-specific branches are unnecessary for Morder now.

## Actual multiplayer architecture

### Connection and room authority

Clients declare either a host or controller connection role in the Socket.IO
handshake. The server validates that shape and authorizes event families by the
stored socket role. A host creates at most one room; a generated four-character
code uses an alphabet without ambiguous characters and retries collisions.

`RoomManager` is the authoritative in-memory membership layer. It indexes rooms
by code, rooms by host socket, players by controller socket, and players by
reconnect token. It normalizes and validates room codes and names, rejects
case-insensitive duplicate names, caps rooms at four players, assigns stable
slot numbers/accents, and accepts input only from the server-associated joined
socket. Clients do not supply trusted room/player identity with input.

Socket.IO rooms are not used. The server emits directly to the owning host and
individual controller socket IDs. This is simple and the integration tests
verify cross-room isolation.

The typed event contract includes host room creation, LAN address discovery,
and game actions; controller join, reconnect, and input; host room state,
accepted input, and game state; and controller game status and room-closed
notices. Create/join/reconnect/game commands use acknowledgements while ongoing
snapshots are server events.

### Reconnect, disconnect, and cleanup

Each player gets a random 32-byte base64url reconnect capability. Only that
controller receives it, and the browser stores it in local storage. Public room
snapshots omit it. A valid reconnect restores the same player and replaces any
old socket; a late disconnect from the replaced socket cannot disconnect the
new one.

Controller disconnect marks the player disconnected, clears active input, and
starts a 20-second expiry timer. Expiry removes the player and frees the slot.
Host disconnect closes the entire room, cancels player/game timers, invalidates
tokens, clears indexes, and notifies connected controllers. Host reconnect is
not supported. Server restart loses all state.

### Game and synchronization

Each room gets one focused `SignalSprintGame`. `RoomManager` owns membership and
input identity; the game owns its lobby/countdown/playing/results state,
participants, targets, scores, stuns, timers, and winners. Clock, randomness,
and scheduling are injectable for deterministic tests.

Room changes synchronize connection state into the game. Players joining after
a round starts wait until replay; reconnecting players retain target and score;
expired participants become inactive. Stale callbacks are guarded by phase and
round ID, and disposal cancels timers.

The owning host receives the complete Signal Sprint state, including every
player's target. Controllers receive a separate coarse status that intentionally
omits target, score, and winners. This is good recipient-specific delivery for
Buzz, where targets belong on the shared screen. It is not safe to reuse as
Morder's state model because Morder's public host must not receive live roles,
night choices, votes, or Sheriff results.

### Errors

Join/create/reconnect/game actions use typed acknowledgement unions with stable
error codes and human messages. Malformed payloads, wrong socket roles,
unjoined input, duplicate button-downs, invalid phases, missing rooms, duplicate
names, room capacity, and expired reconnect tokens are rejected or ignored
safely. Optional LAN discovery failure falls back to manual joining.

There is no durable logging/observability layer, rate limiting, host recovery,
or production authentication. The handshake role is self-declared, but a
self-declared host can only create/control its own server-associated room; it
does not grant access to another room's state.

## Actual joining flow

- The server reads OS network interfaces, keeps usable non-internal IPv4
  addresses, excludes loopback/link-local/reserved ranges, de-duplicates them,
  and deterministically prefers common private ranges.
- The host requests those addresses, lets the user select among multiple
  candidates, and builds `http://<address>:5174/?room=<code>`.
- `qrcode.react` renders a local, high-contrast SVG QR code with a quiet margin;
  no external QR service is contacted.
- The controller strictly parses one `room` query value, normalizes and prefills
  it, still requires a name, and removes the consumed query after successful
  join/recovery.
- Manual room-code entry remains available.
- The host receives authoritative lobby snapshots after joins, disconnects,
  reconnects, and expiry.

Buzz has no player-photo flow.

## Explicit reuse classification

“Reuse” means copy/adapt into Morder with its own names and tests. It does not
mean import from Buzz or create a shared cross-project package.

| Buzz subsystem | Classification | Reasoning for Morder |
| --- | --- | --- |
| Native npm workspace layout | **REUSE DIRECTLY** | Four coarse packages are easy to understand and need no orchestration framework. |
| Strict TypeScript base configuration | **REUSE DIRECTLY** | The safety settings are small, generic, and already exercised across browser/server code. |
| React + Vite host/controller split | **REUSE DIRECTLY** | The two surfaces have different layouts and trust projections; separate apps make that boundary visible. |
| Node HTTP + Socket.IO stack | **REUSE DIRECTLY** | It is proven on a real phone/LAN and sufficient for small ephemeral rooms. |
| Vitest and Socket.IO integration-test shape | **REUSE DIRECTLY** | Deterministic unit tests plus real transport tests match Morder's highest risks. |
| Root development launcher | **REUSE WITH MODIFICATION** | The small script is useful, but workspace names, startup assumptions, and future photo HTTP handling must be Morder-specific. |
| Room-code generator and format | **REUSE DIRECTLY** | Short non-ambiguous codes, crypto randomness, normalization, and collision retry fit Morder. |
| Display-name normalization/validation | **REUSE WITH MODIFICATION** | The approach is sound; length/character/user-facing rules should be confirmed for Morder. |
| LAN IPv4 discovery | **REUSE DIRECTLY** | It is generic, injected for tests, and avoids brittle adapter-name matching. |
| Join URL/query utilities | **REUSE WITH MODIFICATION** | The safe parsing pattern fits; ports, routes, package names, and tests must be renamed. |
| Local QR rendering and address selector | **REUSE WITH MODIFICATION** | The behavior is appropriate, but the component is embedded in Buzz's large themed `App.tsx`; extract only the behavior and build a Morder UI. |
| `RoomManager` maps and server-derived identity | **REUSE WITH MODIFICATION** | The authority/index design is strong. Remove four-player accents/input counters, add photo references, and define Morder-specific lifecycle policy. |
| Four-player capacity and fixed numbered accents | **REIMPLEMENT FOR MORDER** | Morder's player range is unresolved and should not inherit Buzz's four workstation slots. |
| Token-based controller reconnect | **REUSE WITH MODIFICATION** | Capability restoration is appropriate, but the storage key, grace periods, active-game retention, and private-state restoration need Morder semantics. |
| Twenty-second expiry during play | **REIMPLEMENT FOR MORDER** | Removing a seat is tolerable in a short arcade round; it can destroy a secret role and corrupt a social-deduction game. |
| Host-disconnect closes room | **REUSE DIRECTLY** for the first prototype | It is simple and deterministic. Host recovery can remain an explicit later decision. |
| Typed acknowledgement/error unions | **REUSE WITH MODIFICATION** | The pattern is useful; Morder needs role/action/vote/photo errors and must avoid role-revealing messages. |
| Direct per-socket emission and room isolation | **REUSE WITH MODIFICATION** | Direct recipient routing is easy to audit. Add explicit projection builders and privacy tests before game state exists. |
| Controller session local storage | **REUSE WITH MODIFICATION** | The defensive storage wrapper is useful; use a Morder key and clear/restore private state carefully. |
| Complete game state sent to host | **REIMPLEMENT FOR MORDER** | Buzz's host needs all arcade targets. Morder's host is public and must receive only a public projection until final reveal. |
| Controller coarse-status projection | **REUSE WITH MODIFICATION** | It proves recipient-specific events. Morder needs richer own-role/action/result projections while excluding other secrets. |
| Signal Sprint game module/state machine | **NOT RELEVANT** | Targets, scoring, stuns, early-win logic, and replay semantics are a different game. Reuse testing techniques, not the model. |
| Five-button paired input tracker/protocol | **NOT RELEVANT** | Morder uses deliberate target selection and voting, not arcade down/up controls. |
| Signal Sprint smoke scenario | **REIMPLEMENT FOR MORDER** | Keep the idea of a real multi-client smoke test, but write it around joins, privacy, actions, voting, and lifecycle. |
| Controller join form | **REUSE WITH MODIFICATION** | Query prefilling, validation, recovery, and status handling are useful; `App.tsx` is monolithic and the Morder flow adds photo capture. |
| Connection-status UI behavior | **REUSE WITH MODIFICATION** | The states and accessibility pattern are generic, but styles/copy are Buzz-specific and not a reusable component today. |
| Lobby player cards | **REIMPLEMENT FOR MORDER** | Buzz cards assume four robot workstations, fixed colors/shapes, and no photos. |
| Responsive controller shell | **REIMPLEMENT FOR MORDER** | It is optimized for five arcade buttons. Morder needs role/action/vote/photo screens with discreet, consistent interaction. |
| Generic modal/dialog system | **NOT RELEVANT** | None exists to reuse. |
| Buzz typography/design tokens and venue layout | **NOT RELEVANT** | Styling is tightly coupled to Event Rescue and Signal Sprint rather than a neutral system. |
| Robot/station components and PixelLab assets | **NOT RELEVANT** | These are Buzz-specific presentation and provenance work. |
| Player-input acknowledgement/presentation modules | **NOT RELEVANT** | They model arcade feedback and can create behavioral leakage if transferred to hidden night actions. |
| `PROJECT_STATUS` + durable docs discipline | **REUSE WITH MODIFICATION** | The separation is valuable; Morder uses fewer files and keeps status, decisions, ideas, product, architecture, and the audit distinct. |

## Game-specific coupling to avoid

Buzz's host `App.tsx` combines room creation, QR joining, four-slot lobby,
Signal Sprint phase rendering, timer display, robot acknowledgement animation,
venue theming, and result controls. Its controller `App.tsx` similarly combines
join/recovery with a fixed five-button arcade surface and game-status copy.
Copying either component would import the wrong product model.

`PublicPlayer` also contains Buzz diagnostics such as valid input count/latest
input and a four-value accent. `RoomManager` assigns the first free number from
1–4. `SignalSprintState` deliberately exposes all targets to the host. The art,
station, score, stun, button, and participant abstractions are all specific to
Buzz.

The clean path is to copy roughly scoped utilities and patterns—room-code
generation, network discovery, URL parsing, reconnect indexing, and test
fixtures—then reshape them under Morder types. Extracting a shared Buzz/Morder
package would create versioning and coupling work around a small amount of code
while making privacy-critical Morder changes harder to audit.

## Evaluation of the proposed implementation sequence

### M0 — Keep, with a sharper stop condition

The QR/name/photo lobby is the correct first milestone. Buzz has already reduced
networking uncertainty, while photos and a non-four-player lobby are new risks.
“Start” in M0 should only prove an authoritative lobby lock/readiness transition
and recipient-specific snapshot plumbing; it should not add placeholder roles
or a fake game.

Implement M0 in focused slices. The first is M0a in `docs/STATUS.md`. Follow it
with QR/LAN joining, then bounded temporary photo handling and the public lobby.
Finish with a real multi-phone/camera connectivity rehearsal.

### M1 — Keep as the first playable game

One Murderer and otherwise Civilians is the right minimum. Build explicit game
phases and projection functions immediately. Implement role reveal, Murderer
selection, authoritative resolution, public announcement, discussion timer or
host advance, private vote, tied-vote behavior as a still-open rule choice,
elimination, and win checks. Do not prepare Doctor/Sheriff abstractions beyond
clean focused game rules.

### Insert the first social playtest after M1

This is the important sequencing change. M1 can already answer whether the
software stays out of the way and whether discussion, accusation, and voting
feel good. Playtest before adding Doctor and Sheriff. Record interaction
leakage, QR/photo friction, phase timing, public-screen readability, vote
clarity, disconnect behavior, and desire for another round.

### M2 — Keep, gated by evidence

Add only Doctor and Sheriff. Resolve Doctor/Murderer interaction on the server
and deliver Sheriff results only to the Sheriff. Decide self-protection,
repeated protection, announcement wording, valid targets, and timing from
explicit rules/playtest evidence. Do not expand the role system.

## Audit conclusion

Buzz is a strong technical reference, not a codebase to fork wholesale. Its
stack, small workspace layout, LAN/QR flow, room authority, reconnect capability,
direct recipient routing, injected test dependencies, and lifecycle coverage
substantially reduce Morder's technical risk.

The major architectural change is non-negotiable: Morder must model internal
state separately from public-host and per-player projections. Its player-count,
photo, reconnect-during-game, phase, role, and interaction-leakage needs also
make the Buzz game/UI abstractions inappropriate. A small clean Morder
implementation, informed by selected Buzz code, is simpler than extraction or
forking.
