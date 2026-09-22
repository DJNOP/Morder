# Agent Instructions

- Before substantial work, read `docs/STATUS.md`, `docs/PRODUCT.md`,
  `docs/DECISIONS.md`, and the relevant sections of `docs/ARCHITECTURE.md`.
- Inspect the actual branch/worktree, Git status, relevant files, and nested/override
  instructions before editing. Preserve unrelated and unpublished work; isolate setup
  or documentation changes when implementation is active.
- Complete the agreed outcome as one coherent work package: inspect, implement,
  make necessary supporting changes, test, correct in-scope defects, and deliver
  reviewable evidence. Choose reversible details independently; internal milestones
  do not need repeated prompts. Research-only stays research-only. Do not add later
  roles, accounts, persistence, matchmaking, deployment, or speculative frameworks.
- Keep the server's complete state private. Define and test separate public-host
  and per-player projections; never rely on a client to hide received secrets.
- Treat the shared-screen browser as public and inspectable.
- Keep room/session lifecycle, game rules, transport, shared protocol, and UI
  responsibilities distinct without creating abstractions before they are
  needed.
- Prefer copying and adapting small, proven ideas from Buzz over coupling the
  repositories through a shared package.
- Use proportionate validation and focused regression coverage for changed behavior.
  Wording-only edits normally need a diff/link review. For UI work, follow the
  rendered, privacy, and physical acceptance distinctions in the README workflow.
- Update `docs/STATUS.md` when implementation state or the primary next task
  changes. Record only deliberately agreed choices in `docs/DECISIONS.md`.
- Never commit secrets, private photos, machine-specific addresses, local
  environment files, or captured playtest data containing personal information.
- Review the final diff for hidden-information leaks, scope growth, accidental
  changes, dead code, and documentation drift.
- For an authorised personal-repository task, branches, task-scoped commits,
  non-force feature-branch pushes, linked issue/Project updates, and draft PRs are
  included unless explicitly local-only. Nicholas retains priorities, acceptance,
  and merge/integration authority. No destructive Git, sensitive access, paid calls,
  deployment, or scope expansion is implied.
- Follow the README development workflow. Keep progress, evidence, and the next
  unfinished step resumable in `docs/STATUS.md`; distinguish validated candidates
  from accepted/Done and published changes from the normal checkout. Stop once
  the agreed outcome is delivered; continue independent work at a genuine blocker.
