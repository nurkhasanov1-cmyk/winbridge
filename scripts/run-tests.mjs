import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["apps", "packages"];
const vitestBin = join(process.cwd(), "node_modules", "vitest", "vitest.mjs");
const testFiles = roots.flatMap((root) => findTestFiles(root)).sort();

if (testFiles.length === 0) {
  console.error("No test files found.");
  process.exit(1);
}

for (const testFile of testFiles) {
  const pool = testFile === "apps/agent-shell/src/runtime.integration.test.ts" ? "threads" : "forks";
  const result = spawnSync(
    process.execPath,
    [
      vitestBin,
      "run",
      testFile,
      "--pool",
      pool,
      "--maxWorkers",
      "1",
      "--minWorkers",
      "1",
      "--no-file-parallelism",
      "--no-isolate",
      "--reporter",
      "dot"
    ],
    { stdio: "inherit" }
  );

  if (result.error) {
    console.error(`Failed to start Vitest for ${testFile}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`Vitest failed for ${testFile}.`);
    process.exit(result.status ?? 1);
  }
}

function findTestFiles(root) {
  const entries = readdirSync(root);
  const files = [];

  for (const entry of entries) {
    const path = join(root, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      files.push(...findTestFiles(path));
      continue;
    }

    if (stats.isFile() && path.endsWith(".test.ts")) {
      files.push(relative(process.cwd(), path).replaceAll("\\", "/"));
    }
  }

  return files;
}
