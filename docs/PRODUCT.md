# Product

## Purpose

Morder is a modern digital facilitator for the familiar social deduction game
structure commonly known as Murder, Mafia, or Werewolf. It should preserve the
in-person experience of talking, lying, accusing, defending, reading people,
and voting while removing the administration normally performed by a human
game master.

The governing principle is:

> The software runs the game, but the people in the room are the game.

## Experience model

One computer or TV is the shared public screen. Players join from phone
browsers, ideally through a QR code. Each player enters a name, takes or chooses
a temporary photo, receives a secret role, and uses the phone for private
actions and voting.

The shared screen presents only public information: lobby membership, player
photos, phase and timer, announcements, remaining players, public outcomes,
the result, and the final role reveal. During discussion it should largely get
out of the way.

The intended high-level loop is:

`Scan → Join → Photo → Receive role → Night → Discussion → Vote → Repeat → Result`

## First validation goal

Build the smallest convincing playable version and test it with real friends.
The first product question is not whether a large platform can be built; it is
whether software facilitation preserves and strengthens the face-to-face social
game.

M1 implements the complete initial four-role ruleset with host-configurable
counts for Murderers, Doctors, Sheriffs, and Civilians. A real social playtest
follows M1 before any role expansion or broader platform work.

## Initial role direction

- **Murderer:** privately chooses a player to kill.
- **Doctor:** privately chooses a player to protect.
- **Sheriff:** privately investigates another player.
- **Civilian:** relies on observation, discussion, and voting.

The initial role set is not permission to add more roles. For the first
playtest, Doctors may protect themselves and repeat protection, and a tied
highest vote eliminates nobody. These are accepted initial-playtest rules, not
permanent product commitments.

Each special-role team performs one collective night action. Every living team
member must select the same valid target for the action to take effect. Night
and voting use fixed deadlines so public timing does not reveal when a team or
individual finished. During public daytime phases, every living phone uses the
same role-neutral, secret-free presentation.

## Hidden-information requirement

The server must own the authoritative complete game state. A client receives
only information that the person viewing that client is allowed to know.

In particular:

- the public host must not receive secret roles or private actions during play;
- a player may receive their own role, permitted prompts, submitted-action
  acknowledgement, and private investigation result, but not other secrets;
- frontend state, HTML, JavaScript variables, stores, and Socket.IO payloads
  must not contain hidden facts merely concealed by presentation; and
- the final reveal may expose roles only after the authoritative game reaches
  the appropriate result state.

This protects against ordinary players inspecting their browser or its network
traffic. It does not attempt to defend against a malicious server operator.

## Deliberate MVP boundaries

Do not introduce without a demonstrated current need:

- accounts, permanent profiles, or persistent photos;
- matchmaking or internet-scale room infrastructure;
- progression, cosmetics, monetisation, or analytics;
- native mobile or TV applications;
- a database, Redis, microservices, or a generic game/role plugin system; or
- roles beyond Murderer, Doctor, Sheriff, and Civilian.

All room, game, reconnect, and photo data may be ephemeral and disappear when
the server process ends.

## Product risks to test

Technical correctness is not proof of a good social game. Playtests must watch
for at least these interaction leaks:

- If only special roles touch their phones at night, body language reveals who
  has a role.
- If a phase advances immediately after the final required action, the timing
  can reveal who acted last.
- Role-specific screen brightness, tap count, layout, haptics, error messages,
  or confirmation timing can reveal private state to nearby players.
- An immediate Sheriff result can cause a visible reaction that reveals both
  the Sheriff and the investigated player.
- Public wording such as “someone was saved” may expose more about Doctor
  activity than intended.
- Disconnected, eliminated, or late players may receive visibly different phone
  flows that leak status or disrupt discussion.

The design should eventually give all living players a similar night-time
interaction cadence or another credible reason to use their phones. The exact
solution remains a playtest question, not current implementation scope.
