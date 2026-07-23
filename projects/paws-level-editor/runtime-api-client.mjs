import { createLanApiClient } from "./lan-api-client.mjs";
import { createApiClient as createStaticApiClient } from "./static-api-client.mjs";

export async function createRuntimeApiClient({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  storage = globalThis.localStorage,
  now,
  EventSourceImpl = globalThis.EventSource,
  probeTimeoutMs = 800,
} = {}) {
  if (typeof fetchImpl === "function") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), probeTimeoutMs);
    try {
      const response = await fetchImpl("./api/health.json", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (response.ok && contentType.includes("application/json")) {
        const health = await response.json();
        if (health?.mode === "lan") {
          return createLanApiClient({ fetchImpl, EventSourceImpl });
        }
      }
    } catch {
      // GitHub Pages has no LAN endpoint; static browser storage is the safe fallback.
    } finally {
      clearTimeout(timeout);
    }
  }
  return createStaticApiClient({ fetchImpl, storage, ...(now ? { now } : {}) });
}
