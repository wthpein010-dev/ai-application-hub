export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";
    const allowedOrigin = env.ALLOWED_ORIGIN || origin;
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "GET") {
      return handleAdminList(request, env, corsHeaders);
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "method_not_allowed" }, 405, corsHeaders);
    }

    const required = ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"];
    const missing = required.filter(key => !env[key]);
    if (missing.length) {
      return json({ ok: false, error: "missing_env", missing }, 500, corsHeaders);
    }

    const payload = await request.json();
    const safeDate = String(payload.date || new Date().toISOString().slice(0, 10)).replace(/[^0-9-]/g, "");
    const safeId = String(payload.id || crypto.randomUUID()).replace(/[^a-zA-Z0-9._-]/g, "_");
    const branch = env.GITHUB_BRANCH || "main";
    const path = `data/planner-daily-quiz/submissions/${safeDate}/${safeId}.json`;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))));

    const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "planner-daily-quiz-worker"
      },
      body: JSON.stringify({
        message: `Add planner quiz submission ${safeDate}`,
        content,
        branch
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json({ ok: false, error: "github_write_failed", detail: result }, response.status, corsHeaders);
    }

    return json({ ok: true, path, commit: result.commit?.sha || "" }, 200, corsHeaders);
  }
};

async function handleAdminList(request, env, corsHeaders) {
  const url = new URL(request.url);
  if (url.searchParams.get("password") !== "admin") {
    return json({ ok: false, error: "unauthorized" }, 401, corsHeaders);
  }

  const required = ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"];
  const missing = required.filter(key => !env[key]);
  if (missing.length) {
    return json({ ok: false, error: "missing_env", missing }, 500, corsHeaders);
  }

  const branch = env.GITHUB_BRANCH || "main";
  const treeUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/trees/${branch}?recursive=1`;
  const treeResponse = await fetch(treeUrl, {
    headers: githubHeaders(env)
  });
  const tree = await treeResponse.json().catch(() => ({}));
  if (!treeResponse.ok) {
    return json({ ok: false, error: "github_tree_failed", detail: tree }, treeResponse.status, corsHeaders);
  }

  const files = (tree.tree || [])
    .filter(item => item.type === "blob" && /^data\/planner-daily-quiz\/submissions\/.+\.json$/.test(item.path))
    .slice(-200);

  const records = [];
  for (const file of files) {
    const rawUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${file.path}?ref=${branch}`;
    const fileResponse = await fetch(rawUrl, {
      headers: { ...githubHeaders(env), "Accept": "application/vnd.github.raw+json" }
    });
    if (!fileResponse.ok) continue;
    try {
      records.push(await fileResponse.json());
    } catch {
      // Ignore malformed historical records.
    }
  }

  return json({ ok: true, records }, 200, corsHeaders);
}

function githubHeaders(env) {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
    "User-Agent": "planner-daily-quiz-worker"
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
  });
}
