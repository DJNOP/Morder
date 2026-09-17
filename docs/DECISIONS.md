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
