#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

export const root = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));

export function readPayload() {
  try {
    const payload = JSON.parse(readFileSync(0, "utf8"));
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

export function coveredFiles(files, cwd = root) {
  const result = new Set();
  for (const file of files) {
    if (typeof file !== "string" || !/\.(?:[cm]?js|jsx|ts|tsx|astro)$/.test(file)) continue;
    try {
      const absolute = realpathSync(path.resolve(cwd, file));
      const relative = path.relative(root, absolute);
      if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) continue;
      if (statSync(absolute).isFile()) result.add(relative);
    } catch {
      // Deleted, nonexistent, and inaccessible paths have nothing to lint.
    }
  }
  return [...result];
}

export function runCheck(binary, args, timeout) {
  const result = spawnSync(process.execPath, [path.join(root, "node_modules", binary), ...args], {
    cwd: root,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    encoding: "utf8",
    timeout,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status === 0) return "";
  return (
    `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? `\n${result.error.message}` : ""}`.trim() ||
    `Check exited with status ${result.status ?? result.signal ?? "unknown"}.`
  );
}

export function lint(files) {
  if (!files.length) return "";
  return runCheck("eslint/bin/eslint.js", ["--no-warn-ignored", "--", ...files], 25000);
}

export function feedback(message) {
  // Codex forwards stderr on exit 2. Bound the report before the model-output cap.
  process.stderr.write(`${message.slice(0, 10000)}\n`);
  process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const payload = readPayload();
  if (payload && (!payload.tool_name || payload.tool_name === "apply_patch")) {
    const patch = payload.tool_input?.command;
    if (typeof patch === "string") {
      const paths = [...patch.matchAll(/^\*\*\* (?:Update File|Add File|Move to): (.+)\r?$/gm)].map((match) =>
        match[1].replace(/\r$/, ""),
      );
      const files = coveredFiles(paths, typeof payload.cwd === "string" ? payload.cwd : process.cwd());
      const output = lint(files);
      if (output) feedback(`ESLint failed in edited files (${files.join(", ")}):\n${output}`);
    }
  }
}
