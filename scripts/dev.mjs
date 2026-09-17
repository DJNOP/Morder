import { spawn, spawnSync } from "node:child_process";

const npmCli = process.env.npm_execpath;

if (!npmCli) {
  console.error("Run development through npm.cmd run dev (Windows) or npm run dev.");
  process.exit(1);
}

const runNpm = (args, options = {}) =>
  spawn(process.execPath, [npmCli, ...args], {
    stdio: "inherit",
    ...options,
  });

const sharedBuild = spawnSync(
  process.execPath,
  [npmCli, "run", "build", "--workspace", "@morder/shared"],
  { stdio: "inherit" },
);

if (sharedBuild.status !== 0) {
  process.exit(sharedBuild.status ?? 1);
}

const workspaceProcesses = [
  ["server", "@morder/server"],
  ["host", "@morder/host"],
  ["controller", "@morder/controller"],
].map(([label, workspace]) => ({
  label,
  process: runNpm(["run", "dev", "--workspace", workspace]),
}));

let stopping = false;

const stopAll = () => {
  if (stopping) {
    return;
  }

  stopping = true;
  for (const child of workspaceProcesses) {
    child.process.kill();
  }
};

for (const child of workspaceProcesses) {
  child.process.on("exit", (code, signal) => {
    if (stopping) {
      return;
    }

    console.error(
      `${child.label} development process stopped (${signal ?? `exit ${code ?? 1}`}).`,
    );
    process.exitCode = code ?? 1;
    stopAll();
  });
}

process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
