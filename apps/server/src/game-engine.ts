import {
  GAME_ROLES,
  MORNING_DURATION_MS,
  NIGHT_ACTION_DURATION_MS,
  NIGHT_RESULT_DURATION_MS,
  VOTE_RESULT_DURATION_MS,
  VOTING_DURATION_MS,
  type FinalRoleReveal,
  type GameCommandErrorCode,
  type GameRole,
  type InvestigationResultProjection,
  type PlayerGameProjection,
  type PublicGamePhase,
  type PublicGameProjection,
  type PublicOutcome,
  type PublicPlayerIdentity,
  type RoleCounts,
  type RoleSetupProjection,
  type WinnerSide,
} from "@morder/shared";

export interface GamePlayerSource extends PublicPlayerIdentity {}

export interface InternalGamePlayer extends GamePlayerSource {
  role: GameRole;
  alive: boolean;
  selection: string | null;
  confirmed: boolean;
}

export interface InternalNightResult {
  murderedPlayerId: string | null;
  sheriffResult: InvestigationResultProjection | null;
}

export interface GameState {
  phase: PublicGamePhase;
  round: number;
  deadline: number | null;
  players: Map<string, InternalGamePlayer>;
  nightResult: InternalNightResult | null;
  publicOutcome: PublicOutcome | null;
  pendingWinner: WinnerSide | null;
  winner: WinnerSide | null;
}

export type GameCommandOutcome =
  | { ok: true }
  | { ok: false; error: { code: GameCommandErrorCode; message: string } };

const publicIdentity = (player: GamePlayerSource): PublicPlayerIdentity => ({
  id: player.id,
  displayName: player.displayName,
  photoVersion: player.photoVersion,
});

export const totalRoles = (counts: RoleCounts) =>
  counts.civilian + counts.murderer + counts.doctor + counts.sheriff;

export const validateRoleCounts = (
  counts: RoleCounts,
  playerCount: number,
): RoleSetupProjection => {
  const totalAssigned = totalRoles(counts);
  const values = Object.values(counts);
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    return {
      counts,
      totalAssigned,
      playerCount,
      valid: false,
      message: "Role counts must be whole numbers of zero or more.",
    };
  }
  if (totalAssigned !== playerCount) {
    return {
      counts,
      totalAssigned,
      playerCount,
      valid: false,
      message: `Assign exactly ${playerCount} roles to match the locked roster.`,
    };
  }
  if (counts.murderer < 1) {
    return {
      counts,
      totalAssigned,
      playerCount,
      valid: false,
      message: "At least one Murderer is required.",
    };
  }
  const nonMurderers = playerCount - counts.murderer;
  if (nonMurderers < 1) {
    return {
      counts,
      totalAssigned,
      playerCount,
      valid: false,
      message: "At least one non-Murderer is required.",
    };
  }
  if (counts.murderer > nonMurderers) {
    return {
      counts,
      totalAssigned,
      playerCount,
      valid: false,
      message: "Murderers cannot already outnumber all other players.",
    };
  }
  return {
    counts,
    totalAssigned,
    playerCount,
    valid: true,
    message: "Role configuration is ready.",
  };
};

const shuffled = <T>(items: T[], random: () => number) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
};

export const createGame = (
  sources: GamePlayerSource[],
  counts: RoleCounts,
  now: number,
  random: () => number = Math.random,
) => {
  const validation = validateRoleCounts(counts, sources.length);
  if (!validation.valid) {
    return { ok: false as const, validation };
  }
  const roles: GameRole[] = [
    ...Array<GameRole>(counts.murderer).fill(GAME_ROLES.murderer),
    ...Array<GameRole>(counts.doctor).fill(GAME_ROLES.doctor),
    ...Array<GameRole>(counts.sheriff).fill(GAME_ROLES.sheriff),
    ...Array<GameRole>(counts.civilian).fill(GAME_ROLES.civilian),
  ];
  const assignedSources = shuffled(sources, random);
  const players = new Map<string, InternalGamePlayer>();
  assignedSources.forEach((source, index) => {
    players.set(source.id, {
      ...source,
      role: roles[index]!,
      alive: true,
      selection: null,
      confirmed: false,
    });
  });
  const game: GameState = {
    phase: "night-actions",
    round: 1,
    deadline: now + NIGHT_ACTION_DURATION_MS,
    players,
    nightResult: null,
    publicOutcome: null,
    pendingWinner: null,
    winner: null,
  };
  return { ok: true as const, game };
};

const living = (game: GameState) =>
  [...game.players.values()].filter((player) => player.alive);

export const determineWinner = (game: GameState): WinnerSide | null => {
  const livingPlayers = living(game);
  const murderers = livingPlayers.filter(
    (player) => player.role === GAME_ROLES.murderer,
  ).length;
  const nonMurderers = livingPlayers.length - murderers;
  if (murderers === 0) {
    return "non-murderers";
  }
  return murderers > nonMurderers ? "murderers" : null;
};

export const validTargetsFor = (
  game: GameState,
  player: InternalGamePlayer,
) => {
  const livingPlayers = living(game);
  if (game.phase === "voting") {
    return livingPlayers;
  }
  if (game.phase !== "night-actions") {
    return [];
  }
  if (player.role === GAME_ROLES.murderer) {
    return livingPlayers.filter(
      (candidate) => candidate.role !== GAME_ROLES.murderer,
    );
  }
  if (player.role === GAME_ROLES.doctor) {
    return livingPlayers;
  }
  if (player.role === GAME_ROLES.sheriff) {
    return livingPlayers.filter((candidate) => candidate.id !== player.id);
  }
  return [];
};

export const selectTarget = (
  game: GameState,
  playerId: string,
  targetPlayerId: string,
): GameCommandOutcome => {
  const player = game.players.get(playerId);
  if (!player) {
    return { ok: false, error: { code: "not_joined", message: "This player is not part of the game." } };
  }
  if (!player.alive) {
    return { ok: false, error: { code: "player_eliminated", message: "Eliminated players cannot make selections." } };
  }
  if (game.phase !== "night-actions" && game.phase !== "voting") {
    return { ok: false, error: { code: "invalid_phase", message: "Selections are not open in this phase." } };
  }
  if (game.phase === "night-actions" && player.role === GAME_ROLES.civilian) {
    return { ok: false, error: { code: "action_not_available", message: "Civilians have no night target." } };
  }
  if (player.confirmed) {
    return { ok: false, error: { code: "selection_confirmed", message: "This selection is already confirmed." } };
  }
  if (!validTargetsFor(game, player).some((target) => target.id === targetPlayerId)) {
    return { ok: false, error: { code: "invalid_target", message: "That player is not a valid target." } };
  }
  player.selection = targetPlayerId;
  return { ok: true };
};

export const confirmSelection = (
  game: GameState,
  playerId: string,
): GameCommandOutcome => {
  const player = game.players.get(playerId);
  if (!player) {
    return { ok: false, error: { code: "not_joined", message: "This player is not part of the game." } };
  }
  if (!player.alive) {
    return { ok: false, error: { code: "player_eliminated", message: "Eliminated players cannot confirm selections." } };
  }
  if (game.phase !== "night-actions" && game.phase !== "voting") {
    return { ok: false, error: { code: "invalid_phase", message: "There is no active selection to confirm." } };
  }
  if (game.phase === "night-actions" && player.role === GAME_ROLES.civilian) {
    return { ok: false, error: { code: "action_not_available", message: "Civilians have no night target." } };
  }
  if (!player.selection) {
    return { ok: false, error: { code: "selection_required", message: "Select a player before confirming." } };
  }
  player.confirmed = true;
  return { ok: true };
};

export const resolveTeamConsensus = (
  game: GameState,
  role: "murderer" | "doctor" | "sheriff",
) => {
  const team = living(game).filter((player) => player.role === role);
  if (team.length === 0 || team.some((player) => !player.selection)) {
    return null;
  }
  const target = team[0]!.selection;
  return team.every((player) => player.selection === target) ? target : null;
};

export const resolveVote = (game: GameState): PublicOutcome => {
  const counts = new Map<string, number>();
  for (const voter of living(game)) {
    if (voter.selection && game.players.get(voter.selection)?.alive) {
      counts.set(voter.selection, (counts.get(voter.selection) ?? 0) + 1);
    }
  }
  if (counts.size === 0) {
    return { kind: "no-votes" };
  }
  const highest = Math.max(...counts.values());
  const leaders = [...counts.entries()].filter(([, count]) => count === highest);
  if (leaders.length !== 1) {
    return { kind: "tie" };
  }
  const eliminated = game.players.get(leaders[0]![0])!;
  eliminated.alive = false;
  return { kind: "eliminated", player: publicIdentity(eliminated) };
};

const resetSelections = (game: GameState) => {
  for (const player of game.players.values()) {
    player.selection = null;
    player.confirmed = false;
  }
};

export const startVoting = (game: GameState, now: number): GameCommandOutcome => {
  if (game.phase !== "discussion") {
    return { ok: false, error: { code: "invalid_phase", message: "Voting can start only during discussion." } };
  }
  resetSelections(game);
  game.phase = "voting";
  game.deadline = now + VOTING_DURATION_MS;
  game.publicOutcome = null;
  return { ok: true };
};

export const advanceTimedPhase = (game: GameState, now: number) => {
  if (game.deadline == null || now < game.deadline) {
    return false;
  }
  if (game.phase === "night-actions") {
    const murderTarget = resolveTeamConsensus(game, GAME_ROLES.murderer);
    const protectionTarget = resolveTeamConsensus(game, GAME_ROLES.doctor);
    const sheriffTarget = resolveTeamConsensus(game, GAME_ROLES.sheriff);
    const investigated = sheriffTarget ? game.players.get(sheriffTarget) : undefined;
    game.nightResult = {
      murderedPlayerId:
        murderTarget && murderTarget !== protectionTarget ? murderTarget : null,
      sheriffResult: investigated
        ? { player: publicIdentity(investigated), role: investigated.role }
        : null,
    };
    resetSelections(game);
    game.phase = "night-result";
    game.deadline = now + NIGHT_RESULT_DURATION_MS;
    return true;
  }
  if (game.phase === "night-result") {
    const eliminated = game.nightResult?.murderedPlayerId
      ? game.players.get(game.nightResult.murderedPlayerId)
      : undefined;
    if (eliminated) {
      eliminated.alive = false;
      game.publicOutcome = { kind: "eliminated", player: publicIdentity(eliminated) };
    } else {
      game.publicOutcome = { kind: "no-death" };
    }
    game.pendingWinner = determineWinner(game);
    game.phase = "morning";
    game.deadline = now + MORNING_DURATION_MS;
    return true;
  }
  if (game.phase === "morning") {
    if (game.pendingWinner) {
      game.winner = game.pendingWinner;
      game.phase = "result";
      game.deadline = null;
    } else {
      game.phase = "discussion";
      game.deadline = null;
      game.nightResult = null;
      game.publicOutcome = null;
    }
    return true;
  }
  if (game.phase === "voting") {
    game.publicOutcome = resolveVote(game);
    game.pendingWinner = determineWinner(game);
    resetSelections(game);
    game.phase = "vote-result";
    game.deadline = now + VOTE_RESULT_DURATION_MS;
    return true;
  }
  if (game.phase === "vote-result") {
    if (game.pendingWinner) {
      game.winner = game.pendingWinner;
      game.phase = "result";
      game.deadline = null;
    } else {
      game.round += 1;
      game.phase = "night-actions";
      game.deadline = now + NIGHT_ACTION_DURATION_MS;
      game.nightResult = null;
      game.publicOutcome = null;
      game.pendingWinner = null;
      resetSelections(game);
    }
    return true;
  }
  return false;
};

export const toPublicGameProjection = (game: GameState): PublicGameProjection => {
  const deadline = game.deadline ?? 0;
  switch (game.phase) {
    case "night-actions":
    case "night-result":
    case "voting":
      return { phase: game.phase, round: game.round, deadline };
    case "morning":
    case "vote-result":
      return {
        phase: game.phase,
        round: game.round,
        deadline,
        outcome: game.publicOutcome!,
      };
    case "discussion":
      return { phase: "discussion", round: game.round };
    case "result":
      return {
        phase: "result",
        round: game.round,
        winner: game.winner!,
        reveal: [...game.players.values()].map<FinalRoleReveal>((player) => ({
          ...publicIdentity(player),
          role: player.role,
          lifeState: player.alive ? "alive" : "eliminated",
        })),
      };
  }
};

export const toPlayerGameProjection = (
  game: GameState,
  playerId: string,
): PlayerGameProjection => {
  const player = game.players.get(playerId)!;
  if (game.phase === "result") {
    return { phase: "result", round: game.round, winner: game.winner! };
  }
  if (!player.alive) {
    return { phase: "eliminated", publicPhase: game.phase, round: game.round };
  }
  const deadline = game.deadline ?? 0;
  if (game.phase === "night-actions") {
    if (player.role === GAME_ROLES.civilian) {
      return { phase: "night-actions", round: game.round, deadline, role: "civilian" };
    }
    const team = living(game).filter((candidate) => candidate.role === player.role);
    return {
      phase: "night-actions",
      round: game.round,
      deadline,
      role: player.role,
      teammates: team.filter((teammate) => teammate.id !== player.id).map(publicIdentity),
      candidates: validTargetsFor(game, player).map(publicIdentity),
      teamSelections: team.map((teammate) => ({
        player: publicIdentity(teammate),
        targetPlayerId: teammate.selection,
        confirmed: teammate.confirmed,
      })),
      ownSelection: player.selection,
      confirmed: player.confirmed,
    };
  }
  if (game.phase === "night-result") {
    if (player.role === GAME_ROLES.sheriff && game.nightResult?.sheriffResult) {
      return {
        phase: "night-result",
        round: game.round,
        deadline,
        investigation: game.nightResult.sheriffResult,
      };
    }
    return { phase: "night-result", round: game.round, deadline };
  }
  if (game.phase === "morning") {
    return { phase: "morning", round: game.round, deadline, outcome: game.publicOutcome! };
  }
  if (game.phase === "discussion") {
    return { phase: "discussion", round: game.round };
  }
  if (game.phase === "voting") {
    return {
      phase: "voting",
      round: game.round,
      deadline,
      candidates: living(game).map(publicIdentity),
      ownSelection: player.selection,
      confirmed: player.confirmed,
    };
  }
  return { phase: "vote-result", round: game.round, deadline, outcome: game.publicOutcome! };
};
