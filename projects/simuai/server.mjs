import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { validateExperiment } from "./core/schema.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 8192;
const DEFAULT_API_URL = "https://api.openai.com/v1/responses";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const systemPrompt = `你是 SimuAI 的结构化模型编译器。只返回 JSON，不要 Markdown，不要解释。
允许的 modelType 只有 linear、compound、decay、funnel、inventory、payback。
实验必须含 version=1、id、title、category、question、modelType、3到5个 parameters、1到4个 metrics、chart、explanation、keywords、source="ai"。
parameters 每项必须含 id、label、unit、min、max、step、default；metrics 只能引用对应模型的已知输出。
不得输出 JavaScript、HTML、表达式、外部 URL、医疗诊断、投资承诺、法律结论或安全操作指令。
所有实验必须注明假设、适用边界和“互动估算，不构成专业建议。”`;

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

async function readJson(request) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw Object.assign(new Error("Payload too large"), { code: "TOO_LARGE" });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function extractOutput(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const text = payload?.output
    ?.flatMap(item => item.content ?? [])
    ?.find(item => item.type === "output_text")
    ?.text;
  return typeof text === "string" ? text : null;
}

async function compile(request, response, options) {
  let payload;
  try {
    payload = await readJson(request);
  } catch (error) {
    json(response, error.code === "TOO_LARGE" ? 413 : 400, { error: { code: "UNSUPPORTED" } });
    return;
  }
  const question = String(payload?.question ?? "").trim();
  if (question.length < 3 || question.length > 300) {
    json(response, 422, { error: { code: "UNSUPPORTED" } });
    return;
  }
  if (!options.apiKey) {
    json(response, 503, { error: { code: "OFFLINE" } });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const upstream = await options.fetchImpl(options.apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        input: `${systemPrompt}\n\n用户问题：${question}`,
        max_output_tokens: 1800,
      }),
      signal: controller.signal,
    });
    if (!upstream.ok) {
      json(response, 502, { error: { code: "OFFLINE" } });
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(extractOutput(await upstream.json()));
    } catch {
      json(response, 502, { error: { code: "INVALID_SPEC" } });
      return;
    }
    const checked = validateExperiment(parsed);
    if (!checked.ok) {
      json(response, 502, { error: { code: "INVALID_SPEC" } });
      return;
    }
    json(response, 200, { experiment: { ...checked.value, source: "ai" } });
  } catch (error) {
    json(response, error?.name === "AbortError" ? 504 : 502, {
      error: { code: error?.name === "AbortError" ? "TIMEOUT" : "OFFLINE" },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function serveStatic(request, response) {
  const requestPath = new URL(request.url, "http://localhost").pathname;
  const relative = requestPath === "/" ? "index.html" : decodeURIComponent(requestPath).replace(/^\/+/, "");
  const safePath = normalize(relative).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(ROOT, safePath);
  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403).end();
    return;
  }
  try {
    await access(filePath);
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, "index.html");
    const fileStat = await stat(filePath);
    response.writeHead(200, {
      "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
      "content-length": fileStat.size,
      "cache-control": "no-cache",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

export function createSimuAiServer(options = {}) {
  const config = {
    apiKey: options.apiKey ?? process.env.SIMUAI_API_KEY ?? "",
    apiUrl: options.apiUrl ?? process.env.SIMUAI_API_URL ?? DEFAULT_API_URL,
    model: options.model ?? process.env.SIMUAI_MODEL ?? "gpt-5-mini",
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
    timeoutMs: options.timeoutMs ?? 8000,
  };
  return createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/api/compile") {
      await compile(request, response, config);
      return;
    }
    if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response);
      return;
    }
    response.writeHead(405, { allow: "GET, HEAD, POST" }).end();
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const port = Number(process.env.PORT) || 4177;
  createSimuAiServer().listen(port, "127.0.0.1", () => {
    process.stdout.write(`SimuAI ready at http://127.0.0.1:${port}\n`);
  });
}
