import { validateExperiment } from "./schema.mjs";

export class CompilerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CompilerError";
    this.code = code;
  }
}

function validateQuestion(question) {
  const normalized = String(question ?? "").trim();
  if (normalized.length < 3 || normalized.length > 300) {
    throw new CompilerError("UNSUPPORTED", "问题需为 3 到 300 个字符。请描述一个可以量化的变化关系。");
  }
  return normalized;
}

export async function compileQuestion(question, options = {}) {
  const normalized = validateQuestion(question);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 8000;
  const endpoint = options.endpoint ?? "/api/compile";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: normalized }),
      signal: controller.signal,
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new CompilerError("INVALID_SPEC", "AI 返回了无法解析的实验说明书。");
    }
    if (payload?.error?.code) {
      const code = ["OFFLINE", "TIMEOUT", "UNSUPPORTED", "INVALID_SPEC"].includes(payload.error.code)
        ? payload.error.code
        : "OFFLINE";
      throw new CompilerError(code, "暂时无法生成新实验，请使用离线实验库。");
    }
    if (!response.ok) {
      const code = ["OFFLINE", "TIMEOUT", "UNSUPPORTED", "INVALID_SPEC"].includes(payload?.error?.code)
        ? payload.error.code
        : response.status === 422 ? "UNSUPPORTED" : "OFFLINE";
      throw new CompilerError(code, "暂时无法生成新实验，请使用离线实验库。");
    }
    const checked = validateExperiment(payload?.experiment);
    if (!checked.ok) {
      throw new CompilerError("INVALID_SPEC", "AI 返回的实验说明书未通过安全校验。");
    }
    return { ...checked.value, source: "ai" };
  } catch (error) {
    if (error instanceof CompilerError) throw error;
    if (error?.name === "AbortError" || controller.signal.aborted) {
      throw new CompilerError("TIMEOUT", "生成实验超时，请使用离线实验库。");
    }
    throw new CompilerError("OFFLINE", "当前无法连接 AI 编译器，请使用离线实验库。");
  } finally {
    clearTimeout(timeout);
  }
}
