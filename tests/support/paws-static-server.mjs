import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
]);

export class StaticPathError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "StaticPathError";
    this.status = status;
  }
}

function isWithin(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (!isAbsolute(pathFromRoot) &&
      pathFromRoot !== ".." &&
      !pathFromRoot.startsWith(`..${sep}`))
  );
}

async function checkedRealpath(realRoot, candidate) {
  if (!isWithin(realRoot, candidate)) {
    throw new StaticPathError("Forbidden", 403);
  }
  let realCandidate;
  try {
    realCandidate = await realpath(candidate);
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "EINVAL"].includes(error.code)) {
      throw new StaticPathError("Not found", 404);
    }
    throw error;
  }
  if (!isWithin(realRoot, realCandidate)) {
    throw new StaticPathError("Forbidden", 403);
  }
  return realCandidate;
}

export async function resolveStaticAsset(root, pathname) {
  const realRoot = await realpath(resolve(root));
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    throw new StaticPathError("Not found", 404);
  }
  const candidate = resolve(realRoot, `.${decodedPath === "/" ? "/index.html" : decodedPath}`);
  let filePath = await checkedRealpath(realRoot, candidate);
  const details = await stat(filePath);
  if (details.isDirectory()) {
    filePath = await checkedRealpath(realRoot, resolve(filePath, "index.html"));
  }
  const fileDetails = await stat(filePath);
  if (!fileDetails.isFile()) {
    throw new StaticPathError("Not found", 404);
  }
  return {
    filePath,
    contentType: mimeTypes.get(extname(filePath).toLowerCase()) ?? "application/octet-stream",
  };
}

export function startStaticServer({ root }) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://127.0.0.1").pathname;
      const asset = await resolveStaticAsset(root, pathname);
      const body = await readFile(asset.filePath);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": asset.contentType,
      });
      response.end(body);
    } catch (error) {
      const status = error instanceof StaticPathError ? error.status : 404;
      response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
      response.end(status === 403 ? "Forbidden" : "Not found");
    }
  });
  return new Promise((resolveStarted, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolveStarted({
        address,
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolveClosed, rejectClose) => {
          server.close((error) => error ? rejectClose(error) : resolveClosed());
        }),
      });
    });
  });
}
