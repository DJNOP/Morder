# Morder

Morder is a local, browser-based social deduction game for people gathered in
the same room. A computer or TV shows the public game while each player uses a
phone for private information and actions.

> The software runs the game, but the people in the room are the game.

## Current state

M0a and M0b, the runnable room-and-join foundation plus QR-based LAN joining,
are implemented:

- one command starts the host, phone/player client, and Socket.IO server;
- a host creates an ephemeral room with a short non-ambiguous code;
- the host shows a locally generated QR code, room-specific LAN join URL, and
  live public lobby;
- players join with a validated display name;
- joins and connection changes appear on the host without a refresh;
- a private reconnect capability restores the same player after refresh or a
  brief connection loss instead of creating a duplicate;
- multiple rooms are isolated, and the lobby has no four-player assumption;
- the host receives an explicit public projection while each phone receives
  only its own private session; and
- host disconnect or server restart closes the ephemeral room.

There is no photo flow, lobby start/lock action, gameplay, role, voting, or
persistent storage yet.

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
  smoke-lobby.mjs     Live room/join/reconnect smoke scenario
```

The repository uses native npm workspaces without a monorepo framework.

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

## Run on the local network

1. Connect the computer and player phones to the same trusted local network.
2. Start all three processes from the repository root:

   ```powershell
   npm.cmd run dev
   ```

3. Open the host at [http://localhost:5183](http://localhost:5183).
4. Select **Create room**.
5. Scan the displayed QR code with a phone camera, or open the displayed player
   join URL. It uses the form
   `http://<local-ip>:5184/?room=<room-code>` and prefills the room code.
6. Enter a display name and join. The player should appear immediately on the
   host.

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

The smoke scenario checks that both pages respond, two rooms remain isolated,
five players can join one lobby, invalid rooms are rejected, and a disconnected
player can reconnect without creating a duplicate.

## Planned validation sequence

1. **M0 — Multiplayer skeleton:** room, QR join, name, temporary photo, public
   lobby, and host start/lock action.
2. **M1 — Minimal playable Murder:** one Murderer, remaining players Civilian,
   server-resolved night, discussion, private vote, elimination, and result.
3. **First real social playtest:** test whether the basic loop creates useful
   conversation, suspicion, and desire for another round.
4. **M2 — Doctor + Sheriff:** add the initial special roles only after the M1
   playtest provides evidence to continue.

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
