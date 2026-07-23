import { watch } from "node:fs";
import path from "node:path";

export function createCatalogChangeHub({ levelDir, watchImpl = watch } = {}) {
  const clients = new Set();
  const watchers = [];
  let revision = 0;
  let debounceTimer = null;

  function eventPayload(reason, detail = null) {
    revision += 1;
    return { revision, reason, detail, at: new Date().toISOString() };
  }

  function write(response, payload) {
    response.write(`event: catalog\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  function notify(reason, detail = null) {
    const payload = eventPayload(reason, detail);
    for (const response of clients) write(response, payload);
    return payload;
  }

  function subscribe(request, response) {
    response.writeHead(200, {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    });
    response.flushHeaders?.();
    clients.add(response);
    write(response, eventPayload("connected"));
    const remove = () => clients.delete(response);
    request.once("close", remove);
    response.once("close", remove);
  }

  function scheduleFilesystemChange() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => notify("filesystem-change"), 80);
    debounceTimer.unref?.();
  }

  for (const directory of [path.resolve(levelDir), path.resolve(levelDir, "_Trash")]) {
    try {
      const watcher = watchImpl(directory, { persistent: false }, scheduleFilesystemChange);
      watcher.on?.("error", () => {});
      watchers.push(watcher);
    } catch {
      // The root watch and direct mutation notifications still cover a missing _Trash directory.
    }
  }

  const heartbeat = setInterval(() => {
    for (const response of clients) response.write(": keep-alive\n\n");
  }, 15000);
  heartbeat.unref?.();

  function close() {
    clearInterval(heartbeat);
    clearTimeout(debounceTimer);
    for (const watcher of watchers) watcher.close?.();
    for (const response of clients) response.end();
    clients.clear();
  }

  return { notify, subscribe, close };
}
