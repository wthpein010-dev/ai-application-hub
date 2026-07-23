import { WorkbenchApiError } from "./static-api-client.mjs";

async function request(fetchImpl, url, options = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        accept: "application/json",
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch (error) {
    throw new WorkbenchApiError(`无法连接内网关卡服务：${error.message}`, {
      status: 503,
      code: "lan-service-unavailable",
    });
  }
  const contentType = response.headers.get("content-type") ?? "";
  let payload;
  try {
    payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const serverError = payload?.error;
    throw new WorkbenchApiError(serverError?.message ?? `请求失败（${response.status}）`, {
      status: response.status,
      code: serverError?.code ?? "lan-request-failed",
    });
  }
  return payload;
}

export function createLanApiClient({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  EventSourceImpl = globalThis.EventSource,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new WorkbenchApiError("当前浏览器不支持内网请求。", {
      code: "fetch-unavailable",
    });
  }
  return {
    runtimeMode: "lan",
    canDeleteBundled: true,
    canResetBundled: false,
    health() {
      return request(fetchImpl, "/api/health");
    },
    listLevelCatalog() {
      return request(fetchImpl, "/api/levels");
    },
    async listLevels() {
      return (await this.listLevelCatalog()).levels;
    },
    loadLevel(fileName) {
      return request(fetchImpl, `/api/levels/${encodeURIComponent(fileName)}`);
    },
    saveLevel(payload) {
      return request(fetchImpl, "/api/levels/save", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    deleteLevel(fileName, { expectedVersion = "" } = {}) {
      return request(fetchImpl, "/api/levels/delete", {
        method: "POST",
        body: JSON.stringify({ fileName, expectedVersion }),
      });
    },
    async listTrash() {
      return (await request(fetchImpl, "/api/trash")).levels;
    },
    restoreLevel(trashId) {
      return request(fetchImpl, "/api/trash/restore", {
        method: "POST",
        body: JSON.stringify({ trashId }),
      });
    },
    login(password) {
      return request(fetchImpl, "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
    },
    logout() {
      return request(fetchImpl, "/api/auth/logout", { method: "POST" });
    },
    resetLevel() {
      throw new WorkbenchApiError("内网工程关卡没有内置副本，请从回收站恢复。", {
        status: 400,
        code: "lan-reset-unavailable",
      });
    },
    blockImageUrl(type) {
      return `/api/assets/blocks/${encodeURIComponent(type)}`;
    },
    subscribeCatalog(onCatalog, onError = () => {}) {
      if (typeof EventSourceImpl !== "function") return () => {};
      const source = new EventSourceImpl("/api/events", { withCredentials: true });
      source.addEventListener("catalog", (event) => {
        try {
          onCatalog(JSON.parse(event.data));
        } catch (error) {
          onError(error);
        }
      });
      source.addEventListener?.("error", onError);
      return () => source.close();
    },
  };
}

