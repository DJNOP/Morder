# Morder

Morder is a local, browser-based social deduction game for people gathered in
the same room. A computer or TV shows the public game while each player uses a
phone for private information and actions.

> The software runs the game, but the people in the room are the game.

The project is currently in foundation planning. No game or multiplayer
application has been implemented yet.

## Product shape

- The shared screen owns the public lobby, phase, timer, announcements, living
  players, voting outcomes, result, and final reveal.
- Phones are private controllers for joining, a temporary photo, secret role
  information, night actions, investigations, and voting.
- The server will own the complete authoritative state. Every client will
  receive a deliberately limited projection of that state.
- The first target is a small local-network prototype for a real playtest with
  friends—not accounts, matchmaking, persistence, monetisation, or native apps.

## Planned validation sequence

1. **M0 — Multiplayer skeleton:** room, QR join, name, temporary photo, public
   lobby, and host start/lock action.
2. **M1 — Minimal playable Murder:** one Murderer, remaining players Civilian,
   server-resolved night, discussion, private vote, elimination, and result.
3. **First real social playtest:** test whether the basic loop creates useful
   conversation, suspicion, and desire for another round.
4. **M2 — Doctor + Sheriff:** add the initial special roles only after the M1
   playtest provides evidence to continue.

## Repository guide

- [Product](docs/PRODUCT.md) — durable purpose, experience principles, and scope.
- [Status dashboard](docs/STATUS.md) — current state, milestones, one next task,
  decisions, and open questions.
- [Decisions](docs/DECISIONS.md) — choices actually made by the project brief.
- [Architecture recommendation](docs/ARCHITECTURE.md) — proposed starting
  technical design; not implemented yet.
- [Buzz audit](docs/BUZZ_AUDIT.md) — evidence and explicit reuse classification.
- [Ideas](docs/IDEAS.md) — hypotheses and later possibilities that are not
  committed work.
- [Agent guidance](AGENTS.md) — working rules for future repository sessions.

## Development

There is no application toolchain to install or run yet. The recommended first
implementation task is defined in [Status](docs/STATUS.md#next-task).
