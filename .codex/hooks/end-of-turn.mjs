#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { coveredFiles, feedback, lint, readPayload, root, runCheck } from "./lint-edited-file.mjs";

const payload = readPayload();
if (!payload || payload.stop_hook_active === true) {
  process.stdout.write("{}\n");
} else {
  const changes = spawnSync("git", ["diff", "--name-only", "--diff-filter=ACMRT", "-z", "HEAD", "--"], {
    cwd: root,
    encoding: "utf8",
  });
  const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  if (changes.status !== 0 || untracked.status !== 0) {
    feedback("Quality gates could not list changed files. Check the repository's Git state.");
  } else {
    const changed = [...new Set(`${changes.stdout}${untracked.stdout}`.split("\0").filter(Boolean))];
    if (changed.length) {
      const failures = [];
      const lintOutput = lint(coveredFiles(changed));
      if (lintOutput) failures.push(`ESLint failed in changed files:\n${lintOutput}`);
      // Astro check generates framework types itself, including on a fresh checkout.
      const typeOutput = runCheck("astro/bin/astro.mjs", ["check"], 85000);
      if (typeOutput) failures.push(`Astro typecheck failed:\n${typeOutput}`);
      if (failures.length) feedback(`Fix these before finishing:\n${failures.join("\n\n")}`);
    }
    if (!process.exitCode) process.stdout.write("{}\n");
  }
}
