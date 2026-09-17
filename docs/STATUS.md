# Project Dashboard

- **Updated:** 2026-09-17
- **Phase:** M0 complete; M1 ready
- **Implementation state:** Multiplayer onboarding and roster lock verified

## Current objective

Begin M1 as one focused implementation task: the smallest complete Murder game
with one Murderer and otherwise Civilians. Preserve M0's server authority and
recipient-specific projections; do not add Doctor or Sheriff yet.

## Milestones

| Milestone | Goal | Status |
| --- | --- | --- |
| Foundation | Audit Buzz, define project records and architecture | Complete |
| M0a — Room and join foundation | Runnable host/player/server, rooms, names, lobby sync, reconnect | Complete |
| M0b — QR joining and LAN acceptance | Local QR, manual fallback, and real-phone same-Wi-Fi join | Complete |
| M0 — Multiplayer skeleton | Name, temporary photo, public lobby, reconnect, start/lock | Complete |
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
- A joined phone can take or choose an image, preview a normalized JPEG, upload
  it over its own authenticated Socket.IO session, and replace it while the
  lobby is open. Normalization preserves aspect ratio, limits the long edge to
  512 px, and encodes JPEG at quality 0.82. The server independently requires
  JPEG data with a valid signature and a maximum payload of 400 KiB.
- Photo bytes live only in the authoritative in-memory room/player record. The
  public lobby contains only `photoVersion`; the host loads bytes from a scoped,
  versioned HTTP endpoint. Room closure or server restart deletes the bytes.
- The host can make the one-way server-authoritative `open` → `locked`
  transition. Photos remain optional. Locking rejects new joins and photo
  changes, keeps the roster fixed, and still permits valid existing-player
  reconnects without duplication. Phones receive only their own minimal state
  and the room status.
- A physical phone camera photo was uploaded from the uncommitted local build,
  appeared correctly oriented on the host, and remained visible when the host
  locked the roster. Independent browser checks verified pre-lock refresh,
  connected-player lock notification, post-lock refresh/reconnect, rejection
  of a separate new-browser join, and an unchanged one-player roster. The live
  smoke scenario verified binary photo replacement and photo-preserving
  reconnect; those two behaviors were not separately observed on the physical
  phone.
- Morder uses ports 5183 (host), 5184 (player), and 3101 (server), avoiding the
  active Buzz development stack on 5173/5174/3001.
- All gameplay remains unimplemented.
- The [Morder Development GitHub Project](https://github.com/users/DJNOP/projects/3)
  provides a concise `Done` / `Now` / `Next` / `Later` visual roadmap linked to
  this repository. This document remains the detailed source of truth.

## Verification status

| Check | Result |
| --- | --- |
| Dependency install | `npm.cmd install` completed; 91 packages audited, 0 vulnerabilities reported. |
| Type safety | `npm.cmd run typecheck` passed for all four workspaces. |
| Automated tests | `npm.cmd test` passed: 3 controller photo tests, 1 host QR test, 25 server/domain/integration tests, and 6 shared tests (35 total). |
| Production build | `npm.cmd run build` passed for shared, server, host, and controller. |
| Root development command | `npm.cmd run dev` launched server, host, and player services on the documented ports. |
| Windows launcher lifecycle | Verified stopped → Start → duplicate Start → Stop → harmless Stop → Start again. The host opened at `http://localhost:5183/`, all three endpoints responded, session metadata was cleaned, all Morder ports were released, and an unrelated Node process remained running. |
| Live smoke | `npm.cmd run smoke` passed against running services: both pages, two isolated rooms, five-player lobby, photo upload/replacement, photo-preserving reconnect, roster lock, rejected new join, and rejected post-lock photo change. |
| Browser flow | Independently verified join, pre-lock refresh without duplication, live lock notification, post-lock refresh/reconnect, locked waiting UI, and clear rejection of a separate new-browser join. |
| Physical phone/LAN | Verified from the uncommitted local working copy: a real phone scanned the QR, joined over Wi-Fi, captured/uploaded a correctly oriented camera photo, appeared with that photo on the host, and remained present when the roster was locked. |

## Next task

### M1 — Minimal playable Murder

**Purpose:** Test whether Morder's smallest complete Murder loop creates the
intended face-to-face social experience.

**Scope:**

- assign exactly one Murderer and make all remaining players Civilians;
- privately reveal each player's own role;
- run server-authoritative night selection and resolution, public discussion,
  private voting, elimination, win checks, and repeat/result transitions;
- eliminate nobody on a tied vote for this first implementation; and
- keep every secret out of the public host and unauthorized player payloads.

**Constraints:**

- no Doctor, Sheriff, later roles, accounts, persistence, matchmaking, timers,
  role plugins, or generalized game platform;
- server owns complete state and emits explicit public-host and per-player
  projections; and
- stop once the minimal loop is ready for the first real social playtest.

**Acceptance checks:**

- the locked roster can start one complete game;
- each player receives only their own role/action state;
- only the Murderer can submit a valid night target;
- the host receives only public phase/outcome information;
- private votes resolve correctly, including no elimination on a tie;
- elimination and win conditions end or continue the game correctly; and
- focused domain, projection, integration, and browser checks pass.

**Stop condition:** Stop after the one-Murderer/Civilian loop is verified and
ready for the first social playtest. Do not add Doctor or Sheriff.

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
- Temporary photos are optional, normalized on the phone, bounded again by the
  server, kept only in room memory, and fetched separately from lobby state.
- Roster lock is a one-way server-owned transition that rejects new joins and
  photo changes while preserving valid reconnects.
- M1 uses one Murderer and otherwise Civilians; M2 is limited to Doctor and
  Sheriff additions.

## Open questions

- What minimum and maximum player counts should M1 support?
- When should a host be allowed to remove an abandoned lobby identity?
- Should host refresh close the room initially, or is host recovery required
  before the first social playtest?
- Is the current 512 px / 400 KiB photo treatment and initial fallback
  sufficient across the phones used in the first social playtest?
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
