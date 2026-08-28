import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const WORKBENCH_PATH = "build/codex-thread-workbench";
const defaultRepoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export async function verifyWorkbenchSourceTree({
  repoRoot = defaultRepoRoot,
  commit,
  expectedTree,
}) {
  if (!commit) throw new TypeError("commit is required");
  if (!/^[0-9a-f]{40}$/i.test(expectedTree || "")) {
    throw new TypeError("expectedTree must be a 40-character Git object ID");
  }
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", `${commit}:${WORKBENCH_PATH}`],
    { cwd: repoRoot, windowsHide: true },
  );
  const actualTree = stdout.trim().toLowerCase();
  const requiredTree = expectedTree.toLowerCase();
  if (actualTree !== requiredTree) {
    throw new Error(
      `Workbench source tree ${actualTree} does not match expected tree ${requiredTree}.`,
    );
  }
  return actualTree;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [commit, expectedTree] = process.argv.slice(2);
  try {
    const tree = await verifyWorkbenchSourceTree({ commit, expectedTree });
    console.log(`Verified immutable Workbench source tree ${tree}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
