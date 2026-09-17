import { describe, expect, it } from "vitest";
import {
  NIGHT_ACTION_DURATION_MS,
  NIGHT_RESULT_DURATION_MS,
  VOTE_RESULT_DURATION_MS,
  VOTING_DURATION_MS,
  type RoleCounts,
} from "@morder/shared";
import {
  advanceTimedPhase,
  confirmSelection,
  createGame,
  determineWinner,
  resolveTeamConsensus,
  resolveVote,
  selectTarget,
  startVoting,
  toPlayerGameProjection,
  toPublicGameProjection,
  validateRoleCounts,
  type GameState,
} from "../src/game-engine.js";

const sources = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    displayName: `Player ${index + 1}`,
    photoVersion: index + 1,
  }));

const gameWith = (counts: RoleCounts, now = 1_000) => {
  const created = createGame(sources(Object.values(counts).reduce((a, b) => a + b, 0)), counts, now, () => 0.999);
  if (!created.ok) throw new Error(created.validation.message);
  return created.game;
};

const counts = (civilian: number, murderer: number, doctor = 0, sheriff = 0): RoleCounts => ({ civilian, murderer, doctor, sheriff });

describe("initial game rules", () => {
  it("assigns the configured role counts exactly with injectable randomness", () => {
    const game = gameWith(counts(2, 2, 1, 1));
    const assigned = [...game.players.values()].map((player) => player.role);
    expect(assigned.filter((role) => role === "murderer")).toHaveLength(2);
    expect(assigned.filter((role) => role === "doctor")).toHaveLength(1);
    expect(assigned.filter((role) => role === "sheriff")).toHaveLength(1);
    expect(assigned.filter((role) => role === "civilian")).toHaveLength(2);
  });

  it("rejects invalid totals, missing sides, and a starting Murderer majority", () => {
    expect(validateRoleCounts(counts(2, 1), 4).valid).toBe(false);
    expect(validateRoleCounts(counts(3, 0), 3).valid).toBe(false);
    expect(validateRoleCounts(counts(0, 3), 3).valid).toBe(false);
    expect(validateRoleCounts(counts(1, 2), 3).valid).toBe(false);
    expect(validateRoleCounts(counts(2, 2), 4).valid).toBe(true);
  });

  it("resolves a Murderer team kill only with full living-team consensus", () => {
    const game = gameWith(counts(2, 2));
    expect(selectTarget(game, "p1", "p3").ok).toBe(true);
    expect(selectTarget(game, "p2", "p3").ok).toBe(true);
    expect(resolveTeamConsensus(game, "murderer")).toBe("p3");
    advanceTimedPhase(game, game.deadline!);
    expect(game.nightResult?.murderedPlayerId).toBe("p3");
  });

  it("turns Murderer disagreement or a missing selection into no kill", () => {
    const disagreement = gameWith(counts(2, 2));
    selectTarget(disagreement, "p1", "p3");
    selectTarget(disagreement, "p2", "p4");
    advanceTimedPhase(disagreement, disagreement.deadline!);
    expect(disagreement.nightResult?.murderedPlayerId).toBeNull();

    const missing = gameWith(counts(2, 2));
    selectTarget(missing, "p1", "p3");
    advanceTimedPhase(missing, missing.deadline!);
    expect(missing.nightResult?.murderedPlayerId).toBeNull();
  });

  it("supports Doctor consensus, disagreement, self-protection, and protection cancelling a kill", () => {
    const protectedGame = gameWith(counts(1, 1, 1));
    selectTarget(protectedGame, "p1", "p3");
    selectTarget(protectedGame, "p2", "p3");
    expect(resolveTeamConsensus(protectedGame, "doctor")).toBe("p3");
    advanceTimedPhase(protectedGame, protectedGame.deadline!);
    expect(protectedGame.nightResult?.murderedPlayerId).toBeNull();

    const selfProtection = gameWith(counts(1, 1, 1));
    expect(selectTarget(selfProtection, "p2", "p2").ok).toBe(true);

    const disagreement = gameWith(counts(1, 1, 2));
    selectTarget(disagreement, "p2", "p2");
    selectTarget(disagreement, "p3", "p4");
    expect(resolveTeamConsensus(disagreement, "doctor")).toBeNull();
  });

  it("reveals an exact Sheriff result only after consensus", () => {
    const game = gameWith(counts(1, 1, 0, 1));
    selectTarget(game, "p2", "p1");
    advanceTimedPhase(game, game.deadline!);
    expect(game.nightResult?.sheriffResult).toMatchObject({
      player: { id: "p1" },
      role: "murderer",
    });

    const disagreement = gameWith(counts(1, 1, 0, 2));
    selectTarget(disagreement, "p2", "p1");
    selectTarget(disagreement, "p3", "p4");
    advanceTimedPhase(disagreement, disagreement.deadline!);
    expect(disagreement.nightResult?.sheriffResult).toBeNull();
  });

  it("excludes eliminated team members from consensus", () => {
    const game = gameWith(counts(2, 2));
    game.players.get("p2")!.alive = false;
    selectTarget(game, "p1", "p3");
    expect(resolveTeamConsensus(game, "murderer")).toBe("p3");
  });

  it("counts a current unconfirmed vote, treats no selection as abstention, and eliminates a unique leader", () => {
    const game = gameWith(counts(2, 1));
    game.phase = "discussion";
    game.deadline = null;
    startVoting(game, 5_000);
    expect(game.deadline).toBe(5_000 + VOTING_DURATION_MS);
    selectTarget(game, "p1", "p3");
    selectTarget(game, "p2", "p3");
    expect(game.players.get("p1")!.confirmed).toBe(false);
    const outcome = resolveVote(game);
    expect(outcome).toMatchObject({ kind: "eliminated", player: { id: "p3" } });
    expect(game.players.get("p3")!.alive).toBe(false);
  });

  it("eliminates nobody for tied highest votes or all abstentions", () => {
    const tied = gameWith(counts(3, 1));
    tied.phase = "voting";
    selectTarget(tied, "p1", "p3");
    selectTarget(tied, "p2", "p4");
    expect(resolveVote(tied)).toEqual({ kind: "tie" });
    expect([...tied.players.values()].every((player) => player.alive)).toBe(true);

    const abstained = gameWith(counts(2, 1));
    abstained.phase = "voting";
    expect(resolveVote(abstained)).toEqual({ kind: "no-votes" });
  });

  it("locks a confirmed choice against later changes", () => {
    const game = gameWith(counts(2, 1));
    game.phase = "voting";
    expect(selectTarget(game, "p1", "p2").ok).toBe(true);
    expect(confirmSelection(game, "p1").ok).toBe(true);
    expect(selectTarget(game, "p1", "p3")).toMatchObject({ ok: false, error: { code: "selection_confirmed" } });
    expect(game.players.get("p1")!.selection).toBe("p2");
  });

  it("uses the chosen strict win conditions", () => {
    const noMurderers = gameWith(counts(2, 1));
    noMurderers.players.get("p1")!.alive = false;
    expect(determineWinner(noMurderers)).toBe("non-murderers");

    const majority = gameWith(counts(2, 2));
    majority.players.get("p4")!.alive = false;
    expect(determineWinner(majority)).toBe("murderers");

    const equality = gameWith(counts(2, 2));
    expect(determineWinner(equality)).toBeNull();

    const continuing = gameWith(counts(3, 1));
    expect(determineWinner(continuing)).toBeNull();
  });
});

describe("timing and information projections", () => {
  it("does not transition early and uses fixed night/result deadlines", () => {
    const game = gameWith(counts(2, 1), 10_000);
    selectTarget(game, "p1", "p2");
    confirmSelection(game, "p1");
    expect(advanceTimedPhase(game, game.deadline! - 1)).toBe(false);
    const nightDeadline = game.deadline!;
    expect(nightDeadline).toBe(10_000 + NIGHT_ACTION_DURATION_MS);
    expect(advanceTimedPhase(game, nightDeadline)).toBe(true);
    expect(game.phase).toBe("night-result");
    expect(game.deadline).toBe(nightDeadline + NIGHT_RESULT_DURATION_MS);
  });

  it("holds voting to its deadline and automatically starts the next round after the result window", () => {
    const game = gameWith(counts(3, 1));
    game.phase = "discussion";
    game.deadline = null;
    expect(startVoting(game, 20_000).ok).toBe(true);
    expect(game.deadline).toBe(20_000 + VOTING_DURATION_MS);
    selectTarget(game, "p1", "p4");
    expect(advanceTimedPhase(game, game.deadline! - 1)).toBe(false);

    const votingDeadline = game.deadline!;
    expect(advanceTimedPhase(game, votingDeadline)).toBe(true);
    expect(game.phase).toBe("vote-result");
    expect(game.deadline).toBe(votingDeadline + VOTE_RESULT_DURATION_MS);

    const resultDeadline = game.deadline!;
    expect(advanceTimedPhase(game, resultDeadline)).toBe(true);
    expect(game).toMatchObject({
      phase: "night-actions",
      round: 2,
      deadline: resultDeadline + NIGHT_ACTION_DURATION_MS,
    });
  });

  it("keeps the active host projection free of roles, selections, ballots, consensus, and Sheriff results", () => {
    const game = gameWith(counts(1, 1, 1, 1));
    selectTarget(game, "p1", "p4");
    selectTarget(game, "p3", "p1");
    const serialized = JSON.stringify(toPublicGameProjection(game));
    expect(serialized).not.toContain("role");
    expect(serialized).not.toContain("selection");
    expect(serialized).not.toContain("target");
    expect(serialized).not.toContain("sheriff");
    expect(serialized).not.toContain("consensus");

    game.phase = "voting";
    game.deadline = 40_000;
    selectTarget(game, "p1", "p4");
    const votingProjection = JSON.stringify(toPublicGameProjection(game));
    expect(votingProjection).not.toMatch(/role|selection|target|ballot|investigation/i);
  });

  it("gives each night role only its own team's authorized information", () => {
    const game = gameWith(counts(1, 1, 1, 1));
    const murderer = toPlayerGameProjection(game, "p1");
    const doctor = toPlayerGameProjection(game, "p2");
    const sheriff = toPlayerGameProjection(game, "p3");
    const civilian = toPlayerGameProjection(game, "p4");
    expect(murderer).toMatchObject({ phase: "night-actions", role: "murderer", teammates: [] });
    expect(doctor).toMatchObject({ phase: "night-actions", role: "doctor", teammates: [] });
    expect(sheriff).toMatchObject({ phase: "night-actions", role: "sheriff", teammates: [] });
    expect(civilian).toEqual({ phase: "night-actions", round: 1, deadline: game.deadline, role: "civilian" });
    expect(JSON.stringify(civilian)).not.toContain("teammates");
    expect(JSON.stringify(murderer)).not.toContain("doctor");
    expect(JSON.stringify(doctor)).not.toContain("sheriff");
  });

  it("limits multi-member night team knowledge to that player's own role team", () => {
    const game = gameWith(counts(2, 2, 2, 2));
    const murderer = toPlayerGameProjection(game, "p1");
    const doctor = toPlayerGameProjection(game, "p3");
    const sheriff = toPlayerGameProjection(game, "p5");

    expect(murderer).toMatchObject({
      role: "murderer",
      teammates: [{ id: "p2" }],
      teamSelections: [{ player: { id: "p1" } }, { player: { id: "p2" } }],
    });
    expect(doctor).toMatchObject({
      role: "doctor",
      teammates: [{ id: "p4" }],
      teamSelections: [{ player: { id: "p3" } }, { player: { id: "p4" } }],
    });
    expect(sheriff).toMatchObject({
      role: "sheriff",
      teammates: [{ id: "p6" }],
      teamSelections: [{ player: { id: "p5" } }, { player: { id: "p6" } }],
    });
    expect(
      murderer.phase === "night-actions" && murderer.role === "murderer"
        ? murderer.candidates.map((candidate) => candidate.id)
        : [],
    ).not.toContain("p2");
  });

  it("routes Sheriff results only to living Sheriffs during the result window", () => {
    const game = gameWith(counts(1, 1, 0, 1));
    selectTarget(game, "p2", "p1");
    advanceTimedPhase(game, game.deadline!);
    expect(toPlayerGameProjection(game, "p2")).toMatchObject({
      phase: "night-result",
      investigation: { player: { id: "p1" }, role: "murderer" },
    });
    const murderer = toPlayerGameProjection(game, "p1");
    const civilian = toPlayerGameProjection(game, "p3");
    expect(murderer).toEqual({ phase: "night-result", round: 1, deadline: game.deadline });
    expect(civilian).toEqual(murderer);
  });

  it("makes living daytime projections role-neutral and gives eliminated players no team secrets", () => {
    const game = gameWith(counts(2, 2));
    game.phase = "discussion";
    game.deadline = null;
    const murderer = toPlayerGameProjection(game, "p1");
    const civilian = toPlayerGameProjection(game, "p3");
    expect(murderer).toEqual({ phase: "discussion", round: 1 });
    expect(civilian).toEqual(murderer);
    expect(JSON.stringify(murderer)).not.toContain("role");

    game.players.get("p2")!.alive = false;
    game.phase = "night-actions";
    game.deadline = 50_000;
    const eliminated = toPlayerGameProjection(game, "p2");
    expect(eliminated).toEqual({ phase: "eliminated", publicPhase: "night-actions", round: 1 });
    expect(JSON.stringify(eliminated)).not.toContain("team");
  });
});
