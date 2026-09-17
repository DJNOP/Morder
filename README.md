# Morder

Morder is a local, browser-based social deduction game for people gathered in
the same room. A computer or TV shows the public game while each player uses a
phone for private information and actions.

> The software runs the game, but the people in the room are the game.

## Current state

M1, the complete initial four-role ruleset, is implemented and technically
verified:

- one command starts the host, phone/player client, and Socket.IO server;
- Windows launchers start the stack, open the host when it is ready, and stop
  only the tracked Morder process tree;
- a host creates an ephemeral room with a short non-ambiguous code;
- the host shows a locally generated QR code, room-specific LAN join URL, and
  live public lobby;
- players join with a validated display name;
- a phone can take or choose a photo, preview a browser-normalized JPEG, upload
  it through its authenticated Socket.IO session, and replace it while the
  lobby is open;
- the host shows temporary player photos separately from lightweight lobby
  projections, with an initial fallback when no photo exists;
- joins and connection changes appear on the host without a refresh;
- a private reconnect capability restores the same player after refresh or a
  brief connection loss instead of creating a duplicate;
- multiple rooms are isolated, and the lobby has no four-player assumption;
- the host receives an explicit public projection while each phone receives
  only its own private session; and
- the host can authoritatively lock the roster; new joins and photo changes are
  then rejected while existing players may reconnect;
- the host configures exact counts of Murderers, Doctors, Sheriffs, and
  Civilians before starting;
- the server assigns roles, validates targets, resolves full living-team
  consensus, applies protection, runs Sheriff investigations, counts private
  votes, eliminates players, and determines the winner;
- fixed server-owned timers run night, Sheriff result, morning, voting, and
  vote result phases without advancing early;
- the shared screen receives no live roles, targets, consensus, Sheriff result,
  or ballots; living daytime phones receive the same role-neutral projection;
- current unconfirmed choices count at the deadline, confirmation locks a
  choice, abstentions count as no vote, and a tied highest vote eliminates
  nobody;
- reconnect restores the current authorized game view and any current personal
  selection; final roles are revealed on the shared screen only at game end;
  and
- host disconnect or server restart closes the ephemeral room and deletes its
  in-memory photos.

The single next task is the first real social playtest. There is still no
persistent storage, account system, matchmaking, deployment platform, or role
system beyond the four initial roles.

## Repository layout

```text
apps/
  host/         React/Vite public shared-screen lobby
  controller/   React/Vite private phone join and session confirmation
  server/       Node HTTP + Socket.IO room authority and LAN discovery
packages/
  shared/       Typed wire protocol, validation, and join-URL utilities
scripts/
  dev.mjs             Minimal multi-process development launcher
  morder-session.ps1  Windows session tracking and safe start/stop helper
  smoke-lobby.mjs     Live room/join/reconnect smoke scenario
START_MORDER.cmd       Double-click Windows launcher
STOP_MORDER.cmd        Project-specific Windows shutdown
```

The repository uses native npm workspaces without a monorepo framework.

## Start and stop Morder on Windows

The simplest local workflow is:

1. Double-click `START_MORDER.cmd` in the repository root.
2. Wait for the shared host to open automatically at
   [http://localhost:5183](http://localhost:5183).
3. Select **Create room**, then let phones scan the displayed QR code.
4. Each player enters a name, joins, and uses **Take photo** or **Choose photo**.
5. The player previews and saves the photo; the host lobby updates immediately.
6. When everyone is present, the host selects **Lock roster**, configures the
   four role counts, and selects **Start game**.
7. Follow the phase instructions on the shared screen and phones.
8. Double-click `STOP_MORDER.cmd` when finished.

Start uses the existing `npm.cmd run dev` stack and waits until the server,
host, and phone app are listening before opening the browser. Starting again
does not create a duplicate stack; it reopens the host for the existing tracked
session.

Stop terminates only the exact process tree recorded for the Morder launcher.
It never kills Node or npm processes by image name, so Buzz and unrelated
projects are left alone. Temporary session metadata lives in the ignored
`.morder-runtime/` directory. Running Stop when Morder is already stopped is
safe.

## Install and validate

The current toolchain requires Node.js `^20.19.0` or `>=22.12.0`. It was
implemented and validated with Node.js `v24.15.0` and npm `11.12.1`.

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

On Windows, `npm.cmd` avoids execution-policy problems that may block
`npm.ps1`. There is no formatter or linter yet; the current automated gates are
strict TypeScript, Vitest tests, production builds, and the live smoke scenario.

## Command-line development and local-network play

1. Connect the computer and player phones to the same trusted local network.
2. Either use `START_MORDER.cmd`, or start all three processes from a terminal
   in the repository root:

   ```powershell
   npm.cmd run dev
   ```

3. If using the terminal command, open the host at
   [http://localhost:5183](http://localhost:5183). The Windows launcher opens it
   automatically.
4. Select **Create room**.
5. Scan the displayed QR code with a phone camera, or open the displayed player
   join URL. It uses the form
   `http://<local-ip>:5184/?room=<room-code>` and prefills the room code.
6. Enter a display name and join. The player should appear immediately on the
   host.
7. Take or choose a photo, check the preview, and save it. A player can replace
   it until the host locks the roster.
8. Select **Lock roster** on the host when onboarding is complete. Configure
   the exact role counts, start the game, and follow the phase prompts.
   Existing players can refresh/reconnect afterward, but new players and photo
   changes are rejected.

The Socket.IO server listens on `0.0.0.0:3101`; the host and player Vite servers
listen on `0.0.0.0:5183` and `0.0.0.0:5184`. These Morder-specific ports avoid
colliding with the local Buzz development stack.

The SVG QR is generated in the host browser from that public join URL; no
external QR service or private reconnect capability is involved. If several
local addresses exist, the host allows choosing one and updates the QR. If none
is detected, it shows a browser-hostname fallback and warns when that is
loopback. Same-Wi-Fi phone joining has been physically verified. Guest-network
client isolation, VPN adapters, or a firewall can still prevent access on a
different network.

## Live smoke check

With `npm.cmd run dev` running in one terminal, run in another:

```powershell
npm.cmd run smoke
```

The smoke scenario checks both pages, isolated rooms, five-player onboarding,
photo upload/replacement, reconnect, roster locking, the complete timed
four-role loop, private Sheriff result, public projection secrecy, a mid-vote
reconnect, elimination, winner resolution, and final role reveal. It takes
about 80 seconds because it uses the production timers.

## Validation sequence

1. **M0 — Multiplayer skeleton:** complete.
2. **M1 — Complete initial playable ruleset:** implemented and technically
   verified with Murderer, Doctor, Sheriff, and Civilian.
3. **First real social playtest:** next; test social energy, interaction
   leakage, comprehension, timing, network friction, and desire for another
   round before expanding scope.

## Project records

- [Product](docs/PRODUCT.md) — durable purpose, experience principles, and scope.
- [Status dashboard](docs/STATUS.md) — verified state, milestones, and one next task.
- [GitHub Project: Morder Development](https://github.com/users/DJNOP/projects/3)
  — lightweight `Done` / `Now` / `Next` / `Later` roadmap.
- [Decisions](docs/DECISIONS.md) — deliberately accepted choices.
- [Architecture](docs/ARCHITECTURE.md) — implemented boundaries and future constraints.
- [Buzz audit](docs/BUZZ_AUDIT.md) — evidence and explicit reuse classification.
- [Ideas](docs/IDEAS.md) — hypotheses that are not committed work.
- [Agent guidance](AGENTS.md) — working rules for future repository sessions.
