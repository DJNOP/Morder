# Project Dashboard

- **Updated:** 2026-09-17
- **Phase:** First real social playtest
- **Implementation state:** M1 implemented and technically verified

## Current objective

Run the implemented four-role game with real people and learn whether it
creates useful face-to-face discussion without unacceptable interaction leaks,
confusion, timing friction, or local-network problems.

## Milestones

| Milestone | Goal | Status |
| --- | --- | --- |
| Foundation | Audit Buzz, define project records and architecture | Complete |
| M0a — Room and join foundation | Runnable host/player/server, rooms, names, lobby sync, reconnect | Complete |
| M0b — QR joining and LAN acceptance | Local QR, manual fallback, and real-phone same-Wi-Fi join | Complete |
| M0 — Multiplayer skeleton | Name, temporary photo, public lobby, reconnect, start/lock | Complete |
| M1 — Complete initial playable ruleset | Configurable Murderers, Doctors, Sheriffs, and Civilians through a complete game | Complete |
| First real social playtest | Test social behavior, leakage, usability, and desire for another round | Next |

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
- After lock, the host configures exact counts of Murderers, Doctors, Sheriffs,
  and Civilians. The server rejects totals that do not match the roster, games
  without both sides, and configurations where Murderers already outnumber all
  non-Murderers.
- A focused server game engine owns random exact role assignment, legal
  targets, full living-team consensus, Doctor protection, Sheriff
  investigation, private voting, elimination, round progression, and strict
  win checks. Clocks, randomness, and scheduling are injected for deterministic
  tests without introducing a generic role or state-machine framework.
- The complete loop is implemented: night actions → private Sheriff result →
  public morning outcome → untimed discussion → host-started private voting →
  public vote outcome → next night or final result.
- Night and voting last 30 seconds. Sheriff result, morning, and vote result
  each last 6 seconds. Phases never advance early when everyone acts.
- Current unconfirmed selections count at the deadline; confirming locks the
  choice. Missing/disagreeing special-role selections produce no team action,
  no vote is an abstention, and tied highest votes eliminate nobody.
- Public host and recipient-specific phone projections are constructed
  separately. Active host payloads contain no roles, targets, consensus,
  Sheriff results, or ballots. Living daytime phone projections are identical
  and secret-free; eliminated phones receive no later team/action information.
  Final roles are exposed only by the authoritative result projection.
- Game reconnects preserve identity and the currently authorized view,
  including that player's active selection/confirmation state.
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
- The [Morder Development GitHub Project](https://github.com/users/DJNOP/projects/3)
  provides a concise `Done` / `Now` / `Next` / `Later` visual roadmap linked to
  this repository. This document remains the detailed source of truth.

## Verification status

| Check | Result |
| --- | --- |
| Dependency install | `npm.cmd install` completed; 91 packages audited, 0 vulnerabilities reported. |
| Type safety | `npm.cmd run typecheck` passed for all four workspaces. |
| Automated tests | `npm.cmd test` passed: 3 controller tests, 1 host test, 44 server/domain/integration tests, and 6 shared tests (54 total). |
| Production build | `npm.cmd run build` passed for shared, server, host, and controller. |
| Root development command | `npm.cmd run dev` launched server, host, and player services on the documented ports. |
| Windows launcher lifecycle | Verified stopped → Start → duplicate Start → Stop → harmless Stop → Start again. The host opened at `http://localhost:5183/`, all three endpoints responded, session metadata was cleaned, all Morder ports were released, and an unrelated Node process remained running. |
| Live smoke | `npm.cmd run smoke` passed against the running local services: M0 onboarding plus the production-timed four-role loop, private Sheriff result, public secret absence, night resolution, daytime, private voting, mid-vote reconnect, elimination, winner, and final reveal. |
| Browser flow | Independently completed a four-player game across isolated browser origins, including the advertised LAN URL. A second two-player run verified invalid setup feedback, active-night reconnect, tied unconfirmed selections returning to a new round without elimination, unique unconfirmed votes counting at the deadline, elimination, and final result. |
| Physical phone/LAN | The earlier M0 physical check remains valid: a real phone scanned the QR, joined over Wi-Fi, uploaded a camera photo, and appeared on the host. The complete M1 game has not yet been played on physical phones; that is part of the next social playtest. |

## Next task

### First real social playtest

**Purpose:** Find out whether the technically complete game works socially with
real people in one room.

**Scope:**

- play at least one complete game with real people using the shared screen and
  physical phones;
- observe comprehension, local-network reliability, camera/photo friction,
  timing, discussion quality, voting flow, and desire for another round;
- specifically watch whether phone use, screen brightness, tap count, reactions,
  or eliminated-player behavior reveals roles; and
- record evidence and concrete follow-up decisions without expanding roles
  during the playtest task.

**Constraints:**

- no new roles, generalized rules system, accounts, persistence, matchmaking,
  deployment, or speculative polish;
- use the actual local repository and physical devices on the same network;
  and
- treat observations as evidence, not automatic feature commitments.

**Acceptance checks:**

- at least one complete physical-device game reaches a final result;
- notable confusion, friction, leaks, and social reactions are recorded;
- participants' willingness to play another round is captured; and
- the next concrete task is chosen from playtest evidence.

**Stop condition:** Stop after recording the playtest findings and selecting
one evidence-backed next task. Do not implement fixes or add roles in the same
task.

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
- M1 uses host-configurable Murderer, Doctor, Sheriff, and Civilian counts and
  is followed immediately by the first real social playtest.

## Open questions

- What practical minimum and maximum player counts work socially for this
  configurable ruleset?
- When should a host be allowed to remove an abandoned lobby identity?
- Should host refresh close the room initially, or is host recovery required
  before the first social playtest?
- Is the current 512 px / 400 KiB photo treatment and initial fallback
  sufficient across the phones used in the first social playtest?
- Does the shared fixed night shell sufficiently limit role leakage, or do
  Civilians need a more active neutral interaction?
- Are Doctor self-protection, repeated protection, full-team consensus, and no
  elimination on a tied vote good social rules in practice?
- Should disconnected or absent living players continue to block team
  consensus and remain eligible voters, as they do in the current prototype?

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
