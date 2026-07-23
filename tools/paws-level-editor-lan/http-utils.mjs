import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".vtt", "text/vtt; charset=utf-8"],
]);

export class HttpError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(`${JSON.stringify(value)}\n`);
}

export function sendError(response, error) {
  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : "internal-error";
  const message = error instanceof HttpError ? error.message : "内网工作台服务发生错误。";
  sendJson(response, status, {
    error: {
      code,
      message,
      ...(error instanceof HttpError && error.details ? { details: error.details } : {}),
    },
  });
}

export function assertSameOrigin(request) {
  const origin = request.headers.origin;
  const expected = `http://${request.headers.host ?? ""}`;
  if (typeof origin !== "string" || origin !== expected) {
    throw new HttpError(403, "origin-rejected", "写入请求必须来自当前内网工作台页面。");
  }
}

export async function readJson(request, { maxBytes = 5 * 1024 * 1024 } = {}) {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, "request-too-large", "请求体超过 5 MiB 限制。");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new HttpError(413, "request-too-large", "请求体超过 5 MiB 限制。");
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid-json-body", "请求 JSON 无法解析。");
  }
}

function isWithin(root, candidate) {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === ""
    || (!isAbsolute(fromRoot) && fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`))
  );
}

export async function resolveStaticAsset(root, pathname) {
  const realRoot = await realpath(resolve(root));
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(404, "not-found", "资源不存在。");
  }
  const candidate = resolve(realRoot, `.${decoded === "/" ? "/index.html" : decoded}`);
  if (!isWithin(realRoot, candidate)) {
    throw new HttpError(404, "not-found", "资源不存在。");
  }
  let realCandidate;
  try {
    realCandidate = await realpath(candidate);
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "EINVAL"].includes(error.code)) {
      throw new HttpError(404, "not-found", "资源不存在。");
    }
    throw error;
  }
  if (!isWithin(realRoot, realCandidate) || !(await stat(realCandidate)).isFile()) {
    throw new HttpError(404, "not-found", "资源不存在。");
  }
  return realCandidate;
}

export async function sendFile(response, filePath, { cache = "no-store" } = {}) {
  let body;
  try {
    body = await readFile(filePath);
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code)) {
      throw new HttpError(404, "not-found", "资源不存在。");
    }
    throw error;
  }
  response.writeHead(200, {
    "cache-control": cache,
    "content-length": body.length,
    "content-type": MIME_TYPES.get(extname(filePath).toLowerCase()) ?? "application/octet-stream",
  });
  response.end(body);
}
