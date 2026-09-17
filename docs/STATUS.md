# Project Dashboard

- **Updated:** 2026-09-17
- **Phase:** M0 — Multiplayer skeleton
- **Implementation state:** M0a room-and-join foundation implemented and verified

## Current objective

Complete M0 through small, testable slices. The room, join, LAN URL, realtime
lobby, and reconnect foundation now works; the next slice should prove QR-based
joining on a real phone without adding photos or gameplay.

## Milestones

| Milestone | Goal | Status |
| --- | --- | --- |
| Foundation | Audit Buzz, define project records and architecture | Complete |
| M0a — Room and join foundation | Runnable host/player/server, rooms, names, lobby sync, reconnect | Complete |
| M0 — Multiplayer skeleton | QR join, name, temporary photo, public lobby, start/lock | In progress |
| M1 — Minimal playable Murder | Murderer + Civilians through night, discussion, vote, elimination, and result | Not started |
| First real social playtest | Test social behavior, leakage, usability, and desire for another round | Not started |
| M2 — Doctor + Sheriff | Add the initial special-role actions and resolution rules | Not started; gated by M1 playtest |

## Current status

- Native npm workspaces now contain separate React/Vite host and phone clients,
  a Node/Socket.IO server, and a built shared TypeScript protocol package.
- `npm.cmd run dev` launches all three services after building shared contracts.
- Hosts create one ephemeral room with a random four-character code. Several
  rooms can coexist, and updates route only to the owning host.
- Players join by a validated room code and unique display name. The lobby has
  no fixed player capacity or four-slot presentation assumption.
- The host receives an explicitly constructed `PublicLobbyProjection`. A player
  receives only a private self/session response containing their reconnect
  capability. Internal room records are not shared protocol types.
- Reconnect capabilities live in the player browser's local storage. A refresh
  or brief interruption restores the same player, and a second use replaces the
  prior socket. Disconnected players remain reserved for the room lifetime;
  there is intentionally no short expiry policy yet.
- Host disconnect closes the room, invalidates reconnect capabilities, and
  notifies connected players. Server restart also loses all rooms.
- The server discovers usable LAN IPv4 candidates. The host shows a selectable
  room-specific URL using `?room=<code>`; the player app prefills that code but
  still requires a display name. Manual code entry remains available.
- Morder uses ports 5183 (host), 5184 (player), and 3101 (server), avoiding the
  active Buzz development stack on 5173/5174/3001.
- QR rendering, player photos, lobby start/lock, and all gameplay remain
  unimplemented.
- [Issue #1](https://github.com/DJNOP/Morder/issues/1) tracks the exact M0b task
  below. The
  [Morder Development GitHub Project](https://github.com/users/DJNOP/projects/3)
  provides a concise `Done` / `Now` / `Next` / `Later` visual roadmap linked to
  this repository. This document remains the detailed source of truth.

## Verification status

| Check | Result |
| --- | --- |
| Dependency install | `npm.cmd install` completed; 90 packages audited, 0 vulnerabilities reported. |
| Type safety | `npm.cmd run typecheck` passed for all four workspaces. |
| Automated tests | `npm.cmd test` passed: 20 server/domain/integration tests and 5 shared URL tests. |
| Production build | `npm.cmd run build` passed for shared, server, host, and controller. |
| Root development command | `npm.cmd run dev` launched server, host, and player services on the documented ports. |
| Live smoke | `npm.cmd run smoke` passed against running services: both pages, two isolated rooms, five-player lobby, invalid-room rejection, disconnect, and identity-preserving reconnect. |
| Browser flow | Manually verified room creation, LAN join URL, URL-prefilled join, realtime host update, player confirmation, refresh recovery, and no duplicate lobby entry. |
| Physical phone/LAN | Not verified. The LAN address and all-interface bindings were mechanically observed, but no separate physical device was available. |

## Next task

### [M0b — Add QR joining and run the physical LAN acceptance check][m0b-issue]

**Purpose:** Remove manual link entry and prove that a real phone can reach the
existing Morder room over the local network.

**Scope:**

- render a local high-contrast QR code for the existing selected player join
  URL using the focused Buzz-proven approach;
- keep the visible room code, copyable URL, address selector, and manual code
  entry as fallbacks;
- add focused tests for QR input/link behavior where useful;
- scan the QR with at least one real phone on the same LAN;
- join, refresh, briefly interrupt the connection, and confirm the host lobby
  reflects the same player identity; and
- record actual firewall, VPN, guest-network, or camera issues encountered.

**Constraints:**

- no player photos, camera upload, game start, roles, phases, voting, or visual
  identity work;
- the QR contains only the public player URL and room code, never a reconnect
  capability; and
- do not alter firewall/network settings automatically.

**Acceptance checks:**

- a real phone camera opens the correct `http://<local-ip>:5184/?room=<code>`
  URL;
- the room code is prefilled and the player joins without manually entering it;
- the host updates without refresh;
- manual joining still works when QR scanning is unavailable; and
- typecheck, tests, build, live smoke, and the documented physical check pass.

**Stop condition:** Stop after QR joining and real-device LAN reachability are
verified and documented. Do not continue into the photo flow.

## Decisions

Only deliberate decisions are summarized here. Full records are in
[Decisions](DECISIONS.md).

- Morder is an in-person shared-screen game with browser phones as private
  controllers.
- The server is authoritative, and clients receive least-information
  projections.
- The first target is ephemeral local multiplayer without accounts or long-term
  photo storage.
- The M0a foundation uses separate React/Vite host and phone clients, a
  Node/Socket.IO authority, strict TypeScript, native npm workspaces, and
  Vitest.
- Lobby reconnect identities last for the in-memory room lifetime and replace
  an earlier socket; they are not permanent users.
- M1 uses one Murderer and otherwise Civilians; M2 is limited to Doctor and
  Sheriff additions.

## Open questions

- What minimum and maximum player counts should M0 and M1 support?
- When should a host be allowed to remove an abandoned lobby identity?
- Should host refresh close the room initially, or is host recovery required
  before the first social playtest?
- What minimum photo crop, resolution, byte limit, and fallback avatar are
  sufficient on real phones?
- What neutral night interaction should Civilians perform so phone use does not
  reveal special roles?
- Should night phases use a fixed timer, a hidden completion delay, or another
  cadence that does not reveal the final actor?
- Are Doctor self-protection, repeated protection, and no elimination on a tied
  vote the right initial rules?
- How should disconnected or absent players affect actions, voting, and win
  conditions once gameplay exists?

## Ideas / later

- Internet-hosted rooms and remote play.
- Permanent profiles or avatars.
- Additional roles and configurable rule sets.
- Matchmaking, progression, cosmetics, monetisation, or analytics.
- Native mobile/TV apps and production deployment.

These are deliberately not current scope and are not GitHub work items.

## Lightweight GitHub workflow

Use GitHub issues only for the one or few concrete tasks currently ready to be
worked. Each issue should contain purpose, context, scope, constraints,
acceptance checks, and a stop condition. Keep hypotheses in `docs/IDEAS.md` and
promote one only after a decision or playtest makes it actionable. Use the
[Morder Development project](https://github.com/users/DJNOP/projects/3) as the
lightweight visual overview; `docs/STATUS.md` remains the detailed source of
truth.

[m0b-issue]: https://github.com/DJNOP/Morder/issues/1
