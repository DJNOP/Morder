# Decisions

This log contains choices actually established by the project brief. Technical
recommendations and rule hypotheses stay out of this file until deliberately
accepted.

## D-001 — Shared public screen and private phone controllers

- **Date:** 2026-09-17
- **Status:** Accepted product direction

Morder is played by people gathered together. A computer or television is the
shared public display. Each player uses a phone browser for joining, temporary
photo capture/selection, private role information, private actions, and voting.
Phones support the face-to-face game rather than becoming its main social
surface.

## D-002 — Server-authoritative hidden information

- **Date:** 2026-09-17
- **Status:** Accepted, non-negotiable

The server owns the complete room and game state. It sends a separate public
projection to the shared host and a recipient-specific private projection to
each player. A client must never receive another player's secret role or
private action merely to hide it in the interface. The public host is also an
inspectable client and receives no live secrets.

The threat model covers ordinary players inspecting browser state, HTML,
JavaScript variables, frontend stores, and traffic intended for their client.
It does not attempt to protect secrets from the server operator.

## D-003 — Small ephemeral browser prototype

- **Date:** 2026-09-17
- **Status:** Accepted product constraint

The first target is browser-based local multiplayer for friends in one room.
Room, reconnect, game, and player-photo data may live only in server memory and
disappear on server restart. The initial project excludes accounts, permanent
profiles/photos, matchmaking, progression, cosmetics, monetisation, native
apps, and large backend infrastructure.

## D-004 — Initial role scope

- **Date:** 2026-09-17
- **Status:** Accepted scope

M0 proves joining and the public/private device shape without role logic. M1
implements the complete initial ruleset with host-configurable counts of
Murderers, Doctors, Sheriffs, and Civilians. No additional roles are in scope.
The first real social playtest follows M1 before any role expansion.

This entry supersedes the earlier one-Murderer/Civilian-first sequence.

## D-005 — M0a web architecture

- **Date:** 2026-09-17
- **Status:** Provisional, implemented for M0

Morder starts as native npm workspaces with separate React/Vite host and phone
applications, a Node HTTP/Socket.IO server, and a small shared TypeScript
protocol package. The server is the in-memory authority. Public lobby and
private player/session payloads are constructed as distinct wire types. Vitest
covers shared and server behavior. The local defaults are ports 5183 for the
host, 5184 for the phone, and 3101 for the server so Morder can run alongside
Buzz's development stack.

This is a practical starting architecture, not a commitment to a monorepo
framework, deployment platform, database, or generic game engine.

## D-006 — Room-lifetime reconnect identity

- **Date:** 2026-09-17
- **Status:** Provisional, implemented for M0

A joined phone receives a random reconnect capability stored in that browser's
Morder-specific local storage. The server alone maps it to the player and room.
A reconnect restores that same lobby identity and replaces an earlier socket;
disconnected players remain reserved until the room closes. Host disconnect or
server restart closes the room and invalidates the capability.

This is ephemeral room identity, not an account or permanent profile. Player
removal, reconnect expiry, and host recovery remain open design questions.

## D-007 — Local public join QR

- **Date:** 2026-09-17
- **Status:** Provisional, implemented for M0

The host renders a high-contrast SVG QR locally with `qrcode.react`. Its value
is exactly the public room-specific player URL, so it contains the room code
but never a reconnect capability or other private session data. Morder does not
send join data to an external QR service.

The visible room code, copyable URL, address selector when needed, and manual
code entry remain available as fallbacks. This is a focused M0 implementation,
not a commitment to a general QR abstraction or visual component library.

## D-008 — Temporary room-scoped player photos

- **Date:** 2026-09-17
- **Status:** Provisional, implemented for M0

Player photos are optional public room information for the initial prototype.
The phone normalizes and compresses an image before binary upload, and the
server independently validates its type, signature, and hard byte limit. Bytes
belong to the server-side player record only for the in-memory room lifetime;
they are never written to durable storage.

Ordinary lobby and private-state projections carry only a lightweight photo
version. Clients fetch bytes separately from a room/player-scoped temporary
endpoint, so routine state broadcasts do not resend every image. This is not a
profile, permanent avatar, photo library, or commitment to the current exact
resolution and JPEG settings.

## D-009 — Server-authoritative one-way roster lock

- **Date:** 2026-09-17
- **Status:** Provisional, implemented for M0

The server owns the room's `open` or `locked` status. The host can make the
one-way transition after at least one player joins; photos remain optional.
Once locked, the roster cannot gain new identities and player photos cannot be
changed, while valid room-lifetime reconnect capabilities continue to restore
existing players without duplication.

M0 provides no unlock/reset flow and does not treat locking as gameplay start.
A host creates a fresh room when onboarding must restart.

## D-010 — Initial playtest game rules and privacy cadence

- **Date:** 2026-09-17
- **Status:** Accepted for the first playtest

Each special-role team performs one collective action per night. An action
exists only when every living member of that team selected the same valid
target by the fixed deadline; missing or disagreeing selections produce no
effect or result. A current selection counts at the deadline even without
confirmation, while confirmation locks that player's choice.

Doctors may protect any living player, including themselves, and may repeat a
target on later nights. Sheriffs receive an exact-role result only inside a
short private night-result window. Eliminated roles remain secret until the
game ends. Voting treats no selection as abstention and eliminates nobody when
the highest count is tied.

Non-Murderers win when no living Murderers remain. Murderers win only when
living Murderers are strictly greater than all living non-Murderers combined;
equality does not win automatically.

Night and voting use fixed durations and never end early because players have
acted. The host exposes no completion progress, consensus, selections, or
ballots. During daytime phases all living phones use the same secret-free
presentation; eliminated players receive no new team or action information.
These rules are deliberately provisional until the first social playtest.
