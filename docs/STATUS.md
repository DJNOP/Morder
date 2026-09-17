# Project Dashboard

- **Updated:** 2026-09-17
- **Phase:** M0 — Multiplayer skeleton
- **Implementation state:** M0b verified; Windows start/stop workflow implemented

## Current objective

Complete the remaining M0 onboarding without adding gameplay. Room creation,
QR joining, LAN reachability, names, realtime lobby updates, and reconnect now
work; the next slice should add temporary photos and an explicit host
start/lock action.

## Milestones

| Milestone | Goal | Status |
| --- | --- | --- |
| Foundation | Audit Buzz, define project records and architecture | Complete |
| M0a — Room and join foundation | Runnable host/player/server, rooms, names, lobby sync, reconnect | Complete |
| M0b — QR joining and LAN acceptance | Local QR, manual fallback, and real-phone same-Wi-Fi join | Complete |
| M0 — Multiplayer skeleton | Name, temporary photo, public lobby, start/lock | In progress |
| M1 — Minimal playable Murder | Murderer + Civilians through night, discussion, vote, elimination, and result | Not started |
| First real social playtest | Test social behavior, leakage, usability, and desire for another round | Not started |
| M2 — Doctor + Sheriff | Add the initial special-role actions and resolution rules | Not started; gated by M1 playtest |

## Current status

- Native npm workspaces now contain separate React/Vite host and phone clients,
  a Node/Socket.IO server, and a built shared TypeScript protocol package.
- `npm.cmd run dev` launches all three services after building shared contracts.
- `START_MORDER.cmd` launches that canonical development command in a dedicated
  window, waits for ports 3101/5183/5184 and the host page, then opens the host
  automatically. `STOP_MORDER.cmd` stops only the recorded Morder process tree.
  Repeated Start reuses the tracked session, and repeated Stop is harmless.
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
  room-specific URL using `?room=<code>` and a high-contrast SVG QR generated
  locally from that public URL. The player app prefills the code but still
  requires a display name. Manual URL and code entry remain available.
- A real phone successfully scanned the QR, reached the locally running player
  app over the same Wi-Fi, joined the room, and appeared in the host lobby.
  No address, room code, player name, or captured playtest data is retained.
- Morder uses ports 5183 (host), 5184 (player), and 3101 (server), avoiding the
  active Buzz development stack on 5173/5174/3001.
- Player photos, lobby start/lock, and all gameplay remain unimplemented.
- The [Morder Development GitHub Project](https://github.com/users/DJNOP/projects/3)
  provides a concise `Done` / `Now` / `Next` / `Later` visual roadmap linked to
  this repository. This document remains the detailed source of truth.

## Verification status

| Check | Result |
| --- | --- |
| Dependency install | `npm.cmd install` completed; 91 packages audited, 0 vulnerabilities reported. |
| Type safety | `npm.cmd run typecheck` passed for all four workspaces. |
| Automated tests | `npm.cmd test` passed: 1 host QR test, 20 server/domain/integration tests, and 5 shared URL tests. |
| Production build | `npm.cmd run build` passed for shared, server, host, and controller. |
| Root development command | `npm.cmd run dev` launched server, host, and player services on the documented ports. |
| Windows launcher lifecycle | Verified stopped → Start → duplicate Start → Stop → harmless Stop → Start again. The host opened at `http://localhost:5183/`, all three endpoints responded, session metadata was cleaned, all Morder ports were released, and an unrelated Node process remained running. |
| Live smoke | `npm.cmd run smoke` passed against running services: both pages, two isolated rooms, five-player lobby, invalid-room rejection, disconnect, and identity-preserving reconnect. |
| Browser flow | Manually verified room creation, local QR rendering, LAN join URL, URL-prefilled join, realtime host update, player confirmation, refresh recovery, and no duplicate lobby entry. |
| Physical phone/LAN | Verified from the uncommitted local working copy: a real phone scanned the QR, opened the prefilled player page over the same Wi-Fi, joined, and appeared on the host without refresh. |

## Next task

### M0c — Complete photo onboarding and host start/lock

**Purpose:** Finish the smallest M0 onboarding loop so a host can recognize the
people in the room and deliberately close the lobby before future game logic.

**Scope:**

- let a joining player take or choose one photo with the phone's standard file
  input;
- normalize it to a modest square image with a strict size bound;
- validate it on the server, retain it only for the in-memory room lifetime,
  and show it on the public lobby card;
- add an explicit host start/lock action that closes joining and confirms M0
  onboarding is complete, without assigning roles or entering a game phase;
- retain useful name/connection states and joining fallbacks; and
- add focused protocol, server, and UI tests plus a real-phone check.

**Constraints:**

- no roles, phase engine, night actions, voting, win conditions, persistent
  profiles, cloud storage, or general-purpose image pipeline;
- photo bytes and metadata must not create a hidden-information path or outlive
  the ephemeral room; and
- define the smallest clear behavior for attempted joins after the host locks
  the lobby.

**Acceptance checks:**

- a real phone can take or choose a photo and join without cumbersome editing;
- the host shows each joined player's bounded temporary photo and name;
- invalid or oversized image data is rejected safely;
- photos disappear with the room and are not written to durable storage;
- the host can start/lock the lobby and further join attempts receive a clear
  result; and
- typecheck, tests, build, live smoke, and a documented physical check pass.

**Stop condition:** Stop after photo onboarding and the lobby start/lock
boundary are verified. Do not assign roles or implement gameplay.

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
- The host generates its QR locally from the public player URL and keeps manual
  URL/code entry as a fallback.
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
