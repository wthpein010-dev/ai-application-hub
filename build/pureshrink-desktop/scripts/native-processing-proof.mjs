import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { NativeRunner } = require("../native/runner.cjs");
const { runNativeProof } = require("../native/proof.cjs");

const requestedParent = process.argv[2] ? resolve(process.argv[2]) : tmpdir();
const runner = new NativeRunner();
console.log(JSON.stringify(await runNativeProof(runner, requestedParent)));
