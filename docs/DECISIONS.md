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
implements one Murderer with all remaining players Civilian and the smallest
complete social game loop. Doctor and Sheriff are the only planned additions
for M2. No later roles are in scope.

The Doctor's self-protection/repeated-protection behavior and the tied-vote
outcome remain hypotheses, not decisions. The recommendation to place the first
social playtest between M1 and M2 is recorded in the status and audit documents,
not as an accepted decision.

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
