# Agent Instructions

- Before substantial work, read `docs/STATUS.md`, `docs/PRODUCT.md`,
  `docs/DECISIONS.md`, and the relevant sections of `docs/ARCHITECTURE.md`.
- Inspect Git status and relevant files before editing. Preserve unrelated user
  changes.
- Implement only the requested milestone or task. Do not add later roles,
  accounts, persistence, matchmaking, deployment, or speculative frameworks.
- Keep the server's complete state private. Define and test separate public-host
  and per-player projections; never rely on a client to hide received secrets.
- Treat the shared-screen browser as public and inspectable.
- Keep room/session lifecycle, game rules, transport, shared protocol, and UI
  responsibilities distinct without creating abstractions before they are
  needed.
- Prefer copying and adapting small, proven ideas from Buzz over coupling the
  repositories through a shared package.
- Add tests for testable behavior and run the relevant validation before
  reporting completion.
- Update `docs/STATUS.md` when implementation state or the primary next task
  changes. Record only deliberately agreed choices in `docs/DECISIONS.md`.
- Never commit secrets, private photos, machine-specific addresses, local
  environment files, or captured playtest data containing personal information.
- Review the final diff for hidden-information leaks, scope growth, accidental
  changes, dead code, and documentation drift.
