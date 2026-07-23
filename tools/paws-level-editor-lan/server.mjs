import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createSessionAuth } from "./auth.mjs";
import { createCatalogChangeHub } from "./change-stream.mjs";
import {
  assertSameOrigin,
  HttpError,
  readJson,
  resolveStaticAsset,
  sendError,
  sendFile,
  sendJson,
} from "./http-utils.mjs";
import { createLanLevelStore } from "./level-store.mjs";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(MODULE_DIR, "..", "..");
const DEFAULT_LEVEL_DIR = "E:\\Mahjong\\PawsHomeClient\\Assets\\GameRes\\Resources\\Config\\Gameplay\\EditorLevels";
const DEFAULT_BLOCK_DIR = "E:\\Mahjong\\PawsHomeClient\\Assets\\SheepLevelEditor\\Resources\\SheepLevelEditor\\Blocks";
const DEFAULT_FILE_NAME = "level_0021_r2_第二关模板12.json";

function requireAuthentication(request, auth) {
  if (!auth.enabled) {
    throw new HttpError(503, "write-disabled", "服务启动时未设置写入口令。");
  }
  if (!auth.authenticate(request.headers.cookie ?? "")) {
    throw new HttpError(401, "authentication-required", "写回工程前需要输入当前工作台口令。");
  }
}
function supportedBlockType(type) {
  return (type >= 1 && type <= 32) || (type >= 1001 && type <= 1006);
}

export function createPawsLanServer({
  levelDir = DEFAULT_LEVEL_DIR,
  blockAssetDir = DEFAULT_BLOCK_DIR,
  webRoot = path.join(REPOSITORY_ROOT, "projects", "paws-level-editor"),
  password = process.env.WORKBENCH_PASSWORD ?? "",
  defaultFileName = process.env.PAWS_DEFAULT_LEVEL ?? DEFAULT_FILE_NAME,
} = {}) {
  const store = createLanLevelStore({ levelDir });
  const auth = createSessionAuth({ password });
  const changes = createCatalogChangeHub({ levelDir });
  const resolvedBlockDir = path.resolve(blockAssetDir);
  const resolvedWebRoot = path.resolve(webRoot);

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
      const { pathname } = url;

      if (request.method === "GET" && pathname === "/api/health") {
        let directoryError = null;
        try {
          await store.listLevelCatalog({ defaultFileName });
        } catch (error) {
          directoryError = error.message;
        }
        return sendJson(response, 200, {
          mode: "lan",
          runtimeMode: "lan",
          online: !directoryError,
          ok: !directoryError,
          writable: !directoryError && auth.enabled,
          authenticated: auth.authenticate(request.headers.cookie ?? ""),
          canDeleteBundled: true,
          directoryError,
        });
      }

      if (request.method === "GET" && pathname === "/api/levels") {
        return sendJson(response, 200, await store.listLevelCatalog({ defaultFileName }));
      }

      if (request.method === "GET" && pathname === "/api/trash") {
        return sendJson(response, 200, { levels: await store.listTrash() });
      }

      if (request.method === "GET" && pathname === "/api/events") {
        changes.subscribe(request, response);
        return;
      }

      if (request.method === "POST" && pathname === "/api/auth/login") {
        assertSameOrigin(request);
        const body = await readJson(request);
        const sessionId = auth.login(body.password);
        if (!sessionId) {
          throw new HttpError(401, "invalid-password", "口令不正确。");
        }
        return sendJson(response, 200, { authenticated: true }, {
          "set-cookie": auth.loginCookie(sessionId),
        });
      }

      if (request.method === "POST" && pathname === "/api/auth/logout") {
        assertSameOrigin(request);
        auth.logout(request.headers.cookie ?? "");
        return sendJson(response, 200, { authenticated: false }, {
          "set-cookie": auth.logoutCookie(),
        });
      }

      if (request.method === "POST" && pathname === "/api/levels/save") {
        assertSameOrigin(request);
        requireAuthentication(request, auth);
        const saved = await store.saveLevel(await readJson(request));
        changes.notify("level-saved", { fileName: saved.fileName });
        return sendJson(response, 200, saved);
      }

      if (request.method === "POST" && pathname === "/api/levels/delete") {
        assertSameOrigin(request);
        requireAuthentication(request, auth);
        const deleted = await store.deleteLevel(await readJson(request));
        changes.notify("level-deleted", {
          fileName: deleted.fileName,
          trashId: deleted.trashId,
        });
        return sendJson(response, 200, deleted);
      }

      if (request.method === "POST" && pathname === "/api/trash/restore") {
        assertSameOrigin(request);
        requireAuthentication(request, auth);
        const restored = await store.restoreLevel(await readJson(request));
        changes.notify("level-restored", { fileName: restored.fileName });
        return sendJson(response, 200, restored);
      }

      if (request.method === "GET" && pathname.startsWith("/api/levels/")) {
        const fileName = decodeURIComponent(pathname.slice("/api/levels/".length));
        return sendJson(response, 200, await store.readLevel(fileName));
      }

      if (request.method === "GET" && pathname.startsWith("/api/assets/blocks/")) {
        const rawType = pathname.slice("/api/assets/blocks/".length);
        if (!/^\d+$/u.test(rawType) || !supportedBlockType(Number(rawType))) {
          throw new HttpError(404, "block-asset-not-found", "砖块图片不存在。");
        }
        return sendFile(response, path.join(resolvedBlockDir, `block_${rawType}.png`), {
          cache: "no-cache",
        });
      }

      if (request.method === "GET" && !pathname.startsWith("/api/")) {
        return sendFile(response, await resolveStaticAsset(resolvedWebRoot, pathname), {
          cache: "no-cache",
        });
      }

      throw new HttpError(404, "not-found", "接口不存在。");
    } catch (error) {
      sendError(response, error);
    }
  });

  server.once("close", () => changes.close());
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.WORKBENCH_HOST || "0.0.0.0";
  const port = Number.parseInt(process.env.WORKBENCH_PORT || "8090", 10);
  const server = createPawsLanServer({
    levelDir: process.env.PAWS_LEVEL_DIR || DEFAULT_LEVEL_DIR,
    blockAssetDir: process.env.PAWS_BLOCK_ASSET_DIR || DEFAULT_BLOCK_DIR,
  });
  server.listen(port, host, () => {
    console.log(`Paws LAN Level Workbench: http://${host}:${port}`);
  });
}
