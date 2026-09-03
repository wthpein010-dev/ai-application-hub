import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const CAPTURE_PREFIX = "loop-bgm-lab-video-capture-";
const TEMP_ROOT = resolve(tmpdir());

function validatedCaptureRoot(candidate) {
  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new TypeError("A non-empty capture root is required.");
  }
  const root = resolve(candidate);
  const relativePath = relative(TEMP_ROOT, root);
  const leaf = basename(root);
  const escapesTemp = relativePath === ""
    || relativePath === ".."
    || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath);
  if (escapesTemp
    || dirname(root) !== TEMP_ROOT
    || !leaf.startsWith(CAPTURE_PREFIX)
    || leaf.length === CAPTURE_PREFIX.length) {
    throw new TypeError("Capture root must be a dedicated capture directory created in the system temp directory.");
  }
  return root;
}

export async function createCaptureWorkspace() {
  return mkdtemp(join(TEMP_ROOT, CAPTURE_PREFIX));
}

export function captureWorkspacePaths(candidate) {
  const root = validatedCaptureRoot(candidate);
  return {
    root,
    rawPath: join(root, "loop-bgm-lab-demo.webm"),
    metadataPath: join(root, "recording.json"),
  };
}

export function parseCaptureWorkspaceArgument(argv = process.argv.slice(2)) {
  if (!Array.isArray(argv) || argv.length !== 2 || argv[0] !== "--capture-root") {
    throw new TypeError("Usage: node scripts/build-loop-bgm-lab-video.mjs --capture-root <recorder-output-directory>");
  }
  return captureWorkspacePaths(argv[1]);
}
