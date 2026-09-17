# Project Dashboard

- **Updated:** 2026-09-17
- **Phase:** Repository foundation
- **Implementation state:** Documentation only; no application code exists

## Current objective

Prepare a clean, evidence-based foundation for Morder and define the first
focused implementation task without beginning the game.

## Milestones

| Milestone | Goal | Status |
| --- | --- | --- |
| Foundation | Audit Buzz, define product records and architecture recommendation | Complete |
| M0 — Multiplayer skeleton | Host room, QR join, name, temporary photo, public lobby, start/lock | Not started |
| M1 — Minimal playable Murder | Murderer + Civilians through night, discussion, vote, elimination, and result | Not started |
| First real social playtest | Test social behavior, leakage, usability, and desire for another round | Not started |
| M2 — Doctor + Sheriff | Add the initial special-role actions and resolution rules | Not started; gated by M1 playtest |

The sequence differs slightly from the initial proposal: the first real social
playtest is an explicit gate after M1 and before M2. M1 is already the smallest
playable product test; adding two roles before observing it would increase rule
and privacy complexity without answering the core product question sooner.

## Current status

- The empty GitHub repository has been cloned locally and initialized with
  lightweight project records and working guidance.
- Buzz's source implementation was inspected at the code state represented by
  `5638999` (the current `main` implementation). The audit opened on
  `art/signal-sprint-lighting-station-kit` at `22bf529`, whose additional
  tracked content was art/design documentation. Another process moved and
  committed Buzz documentation while this audit ran; no application source
  changed, and this task made no Buzz writes.
- Buzz validates the proposed TypeScript, React/Vite, Node, Socket.IO, npm
  workspace, Vitest, local-network, QR join, and token-reconnect direction.
- Buzz also demonstrates the boundary Morder must strengthen: the public host
  must receive a public projection, not a complete game snapshot containing
  secrets.
- No package skeleton or dependency lockfile has been created. The stack is a
  recommendation awaiting implementation, and pinning dependencies now would
  create files with no runnable behavior to validate.

## Next task

### M0a — Implement the runnable room and join foundation

**Purpose:** Establish the smallest server-authoritative vertical slice on
which the M0 photo lobby can be built.

**Context:** Buzz proves the basic stack and room mechanics. Morder should copy
and adapt those ideas, not depend on Buzz or inherit its four-player game
assumptions.

**Scope:**

- create npm workspaces for `apps/host`, `apps/controller`, `apps/server`, and
  `packages/shared`;
- add strict TypeScript, React/Vite host and controller entry points, Node with
  Socket.IO, Vitest, and one root development command;
- let a host create one ephemeral room with a short code;
- let several phone/browser clients join with unique validated display names;
- show the authoritative public roster on the host;
- issue a private random reconnect capability to each joined player and restore
  the same identity after a brief browser/network interruption;
- define distinct internal room state, public-host projection, and private
  player-session/projection types even though roles do not exist yet; and
- cover room isolation, invalid joins, reconnect-token privacy, replacement
  socket behavior, and host-disconnect cleanup with automated tests.

**Constraints:**

- no game phases, roles, night actions, voting, QR UI, or photo upload yet;
- no Buzz package dependency or cross-repository shared package;
- no hard-coded four-player capacity or four-slot visual identity model;
- no secret or reconnect capability in the public-host projection;
- no database, accounts, deployment, or production styling; and
- do not treat a client-supplied room ID, player ID, or role as authoritative.

**Acceptance checks:**

- a root command starts the server and both browser surfaces on the local
  machine;
- one host can create a room and at least three independent clients can join;
- joins in one room never update another room;
- the host roster reflects join, disconnect, and successful reconnect;
- serialized host events never contain reconnect capabilities or a placeholder
  for future private game state;
- malformed and unauthorized events fail safely; and
- typecheck, tests, and production builds pass.

**Stop condition:** Stop when this tested room/join slice works. Do not continue
into QR generation, photos, lobby design, role assignment, or gameplay in the
same task.

## Decisions

Only decisions established by the project brief are summarized here. Full
records are in [Decisions](DECISIONS.md).

- Morder is an in-person shared-screen game with browser phones as private
  controllers.
- The server is authoritative, and clients receive least-information
  projections.
- The first target is ephemeral local multiplayer without accounts or long-term
  photo storage.
- M1 uses one Murderer and otherwise Civilians; M2 is limited to Doctor and
  Sheriff additions.

The recommended web stack and exact reconnect/photo policies are not yet logged
as accepted decisions.

## Open questions

- What minimum and maximum player counts should M0 and M1 support?
- Is local-network-only operation acceptable for the first playtest, including
  router client-isolation and firewall friction?
- How long should a player identity remain reconnectable in the lobby and
  during an active game?
- Should host refresh close the room initially, or is host recovery required
  before the first playtest?
- What neutral night interaction should Civilians perform so phone use does not
  reveal special roles?
- Should night phases use a fixed timer, a hidden completion delay, or another
  cadence that does not reveal the final actor?
- Should target lists include eliminated players, self, or only currently valid
  targets for each action?
- What minimum photo crop, resolution, byte limit, and fallback avatar are
  sufficient on real phones?
- Are Doctor self-protection, repeated protection, and no elimination on a tied
  vote the right initial rules?
- What public announcement should follow a prevented murder?
- How should disconnected or absent players affect night resolution, voting,
  and win conditions?

## Ideas / later

- Internet-hosted rooms and remote play.
- Permanent profiles or avatars.
- Additional roles and configurable rule sets.
- Matchmaking, progression, cosmetics, monetisation, or analytics.
- Native mobile/TV apps and production deployment.

These are deliberately not current scope and are not GitHub work items.

## Lightweight GitHub workflow

Use GitHub issues only for the one or few concrete tasks currently ready to be
worked. Copy the `Next task` specification above into the first implementation
issue when work begins. Each issue should contain purpose, context, scope,
constraints, acceptance checks, and a stop condition.

Keep hypotheses and possibilities in `docs/IDEAS.md`; promote one to an issue
only after a decision or playtest makes it actionable. Use milestone labels
such as `M0`, `M1`, and `M2`, plus a simple status label if useful. Do not add a
Projects board until simultaneous work makes the repository and issue list
insufficient.
