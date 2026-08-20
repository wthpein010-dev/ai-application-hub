import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { listenForFetch } from "./helpers/fetch-safe-listener.mjs";

class FakeServer extends EventEmitter {
  constructor(ports) {
    super();
    this.ports = [...ports];
    this.listenCount = 0;
    this.closeCount = 0;
    this.currentPort = 0;
  }

  listen() {
    this.currentPort = this.ports[this.listenCount];
    this.listenCount += 1;
    queueMicrotask(() => this.emit("listening"));
  }

  address() {
    return { port: this.currentPort };
  }

  close(callback) {
    this.closeCount += 1;
    queueMicrotask(() => callback());
  }
}

test("fetch-safe listener closes a blocked port and accepts the next portable port", async () => {
  const server = new FakeServer([1719, 45_000]);

  assert.equal(await listenForFetch(server, { maxAttempts: 3 }), "http://127.0.0.1:45000");
  assert.equal(server.listenCount, 2);
  assert.equal(server.closeCount, 1);
});

test("fetch-safe listener stops after the configured number of blocked ports", async () => {
  const server = new FakeServer([1719, 1720, 45_000]);

  await assert.rejects(
    listenForFetch(server, { maxAttempts: 2 }),
    /could not acquire a fetch-safe port after 2 attempts/,
  );
  assert.equal(server.listenCount, 2);
  assert.equal(server.closeCount, 2);
});
