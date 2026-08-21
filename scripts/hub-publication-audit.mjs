import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDefaultAppsFromRuntime } from "../tests/helpers/default-apps.mjs";

const NATIVE_PROJECTS = new Set([
  "codex-quota-bar",
  "codex-confirmation-bar",
  "clickflow",
  "pureshrink",
  "gamespec-relay",
]);
const EXTENSION_PROJECTS = new Set(["feishu-downloader"]);
const PLATFORM_KEYS = ["windows", "mac"];
const TEXT_EXTENSIONS = new Set([".html", ".md", ".txt", ".json"]);

function platformHref(value) {
  return typeof value === "string" ? value : value?.href || "";
}

function stripTargetSuffix(value) {
  return String(value || "").split(/[?#]/, 1)[0];
}

function isExternalTarget(value) {
  return /^(?:https?:)?\/\//i.test(String(value || ""));
}

function decodeTarget(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveLocalTarget(root, value) {
  const clean = decodeTarget(stripTargetSuffix(value)).replaceAll("/", sep);
  if (!clean || isExternalTarget(clean) || /^[a-z][a-z\d+.-]*:/i.test(clean)) {
    return null;
  }

  const target = resolve(root, clean.replace(/^\.([\\/])/, ""));
  const fromRoot = relative(resolve(root), target);
  if (isAbsolute(fromRoot) || fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
    return null;
  }
  return target;
}

export function expectedCatalogSection(app) {
  if (app.status === "game") return "games";
  if (app.status === "ai" || app.status === "engineering") return "engineering";
  return "apps";
}

function relativeHomeHref(root, pagePath, section) {
  const rootFromPage = relative(dirname(pagePath), root).replaceAll(sep, "/") || ".";
  return `${rootFromPage}/index.html#${section}`;
}

function anchorHrefByClass(html, className) {
  const anchors = html.match(/<a\b[^>]*>/gi) || [];
  const anchor = anchors.find((tag) => {
    const classValue = /\bclass=["']([^"']*)["']/i.exec(tag)?.[1] || "";
    return classValue.split(/\s+/).includes(className);
  });
  return anchor ? /\bhref=["']([^"']+)["']/i.exec(anchor)?.[1] || "" : "";
}

function finding(rule, projectId, path, message, severity = "important") {
  return { severity, rule, projectId, path, message };
}

export async function readZipEntryNames(filePath) {
  const buffer = await readFile(filePath);
  const eocdSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const minimumOffset = Math.max(0, buffer.length - 65_557);
  let eocdOffset = -1;

  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("ZIP end-of-central-directory record was not found");

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  const names = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== centralSignature) {
      throw new Error(`ZIP central directory is invalid at entry ${index + 1}`);
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    names.push(buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

export function classifyZipEntries(names) {
  const normalized = names.map((name) => name.replaceAll("\\", "/"));
  const has = (pattern) => normalized.some((name) => pattern.test(name));
  const kinds = [];

  if (has(/(?:^|\/)Assets\//i) || has(/\.unitypackage$/i)) kinds.push("unity-project");
  if (has(/(?:\.wasm|\.data(?:\.(?:br|gz))?|\.framework\.js(?:\.(?:br|gz))?)$/i)) kinds.push("webgl-build");
  if (has(/(?:^|\/)manifest\.json$/i) && has(/(?:background|service[_-]?worker|content)[^/]*\.js$/i)) {
    kinds.push("browser-extension");
  }
  if (has(/\.exe$/i)) kinds.push("windows-native");
  if (has(/\.app\//i)) kinds.push("mac-native");
  if (has(/(?:^|\/)(?:src|source)\//i) || has(/\.(?:csproj|sln|xcodeproj)$/i)) kinds.push("source");
  return kinds.length ? kinds : ["generic-archive"];
}

function projectDirectoryFromTarget(value) {
  if (!value || isExternalTarget(value)) return "";
  const normalized = decodeTarget(stripTargetSuffix(value)).replaceAll("\\", "/").replace(/^\.\//, "");
  const match = /^projects\/([^/]+)/.exec(normalized);
  return match?.[1] || "";
}

async function collectTextSample(directory, remaining = { files: 20, bytes: 512_000 }) {
  let text = "";
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (remaining.files <= 0 || remaining.bytes <= 0) break;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      text += await collectTextSample(fullPath, remaining);
      continue;
    }
    if (!entry.isFile() || !TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
    const content = await readFile(fullPath, "utf8");
    remaining.files -= 1;
    remaining.bytes -= content.length;
    text += `\n${content.slice(0, Math.max(0, remaining.bytes))}`;
  }
  return text;
}

async function inspectOrphanPlaceholders(root, apps) {
  const projectsRoot = join(root, "projects");
  const referenced = new Set();
  for (const app of apps) {
    for (const value of [app.folder, app.entry, app.video, platformHref(app.platforms?.web)]) {
      const projectDirectory = projectDirectoryFromTarget(value);
      if (projectDirectory) referenced.add(projectDirectory.toLocaleLowerCase("zh-CN"));
    }
  }

  const results = [];
  for (const entry of await readdir(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || referenced.has(entry.name.toLocaleLowerCase("zh-CN"))) continue;
    const text = await collectTextSample(join(projectsRoot, entry.name));
    if (/(?:占位|当前为方案型工具|视频资源总览|备选应用工具创意库)/.test(text)) {
      results.push(
        finding(
          "orphan-placeholder",
          "",
          `projects/${entry.name}`,
          "Unlisted public project contains proposal or placeholder material.",
          "normal",
        ),
      );
    }
  }
  return results;
}

async function inspectLocalArtifact(root, href) {
  const path = resolveLocalTarget(root, href);
  if (!path || !existsSync(path) || extname(path).toLowerCase() !== ".zip") return null;
  const entries = await readZipEntryNames(path);
  return {
    path: relative(root, path).replaceAll(sep, "/"),
    entryCount: entries.length,
    kinds: classifyZipEntries(entries),
    sample: entries.slice(0, 12),
  };
}

async function fetchOnlineTarget(url, fetchImpl) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      let response = await fetchImpl(url, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 403 || response.status === 405) {
        response = await fetchImpl(url, {
          method: "GET",
          redirect: "follow",
          headers: { Range: "bytes=0-0" },
          signal: AbortSignal.timeout(15_000),
        });
      }
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function inspectOnlineTargets(report, onlineBaseUrl = "", fetchImpl = fetch) {
  const checked = new Set();
  const base = onlineBaseUrl
    ? new URL(onlineBaseUrl.endsWith("/") ? onlineBaseUrl : `${onlineBaseUrl}/`)
    : null;
  for (const project of report.projects) {
    for (const action of project.actions) {
      const external = isExternalTarget(action.href);
      if (!external && !base) continue;
      const url = external
        ? new URL(action.href, "https://localhost/")
        : new URL(action.href.replace(/^\.\//, ""), base);
      if (checked.has(url.href)) continue;
      checked.add(url.href);
      try {
        const response = await fetchOnlineTarget(url, fetchImpl);
        if (!response.ok && response.status !== 206) {
          report.findings.push(finding("online-target", project.id, url.href, `Public target returned HTTP ${response.status}.`));
        }
      } catch (error) {
        report.findings.push(finding("online-target", project.id, url.href, `Public target failed: ${error.message}`));
      }
    }
  }
}

export async function auditCatalog({
  root,
  runtime,
  onlineBaseUrl = "",
  checkExternalTargets = false,
  fetchImpl = fetch,
}) {
  if (!root) throw new TypeError("auditCatalog requires root");
  if (!runtime) throw new TypeError("auditCatalog requires runtime source");

  const apps = loadDefaultAppsFromRuntime(runtime);
  const findings = [];
  const projects = [];

  for (const app of apps) {
    const section = expectedCatalogSection(app);
    const actions = [
      ["web", platformHref(app.platforms?.web) || app.entry || ""],
      ["video", app.video || ""],
      ["windows", platformHref(app.platforms?.windows) || ""],
      ["mac", platformHref(app.platforms?.mac) || ""],
    ].filter(([, href]) => href).map(([type, href]) => ({ type, href }));
    const artifacts = {};

    for (const action of actions) {
      if (isExternalTarget(action.href)) continue;
      const target = resolveLocalTarget(root, action.href);
      if (!target) {
        findings.push(finding("local-target", app.id, action.href, "Local target escapes the repository or uses an unsupported scheme."));
      } else if (!existsSync(target)) {
        findings.push(finding("local-target", app.id, action.href, "Local target does not exist."));
      }
    }

    const native = NATIVE_PROJECTS.has(app.id);
    const extension = EXTENSION_PROJECTS.has(app.id);
    for (const platform of PLATFORM_KEYS) {
      const href = platformHref(app.platforms?.[platform]);
      if (!href) {
        if (native || extension) {
          findings.push(finding("platform-artifact", app.id, platform, `Verified ${native ? "native" : "extension"} project is missing its ${platform} action.`));
        }
        continue;
      }

      if (!native && !extension) {
        findings.push(
          finding(
            "platform-artifact",
            app.id,
            href,
            `${platform} action is not backed by a verified native product; keep the cross-platform web experience instead.`,
          ),
        );
      }

      if (!isExternalTarget(href)) {
        try {
          artifacts[platform] = await inspectLocalArtifact(root, href);
        } catch (error) {
          findings.push(finding("platform-artifact", app.id, href, `Archive cannot be inspected: ${error.message}`));
        }
      }
    }

    if (!native && !extension && app.package) {
      findings.push(
        finding(
          "platform-artifact",
          app.id,
          app.package,
          "Package fallback would expose a non-native archive as a Windows download.",
        ),
      );
    }

    if (extension) {
      const windowsHref = platformHref(app.platforms?.windows);
      const macHref = platformHref(app.platforms?.mac);
      if (windowsHref && macHref && windowsHref !== macHref) {
        findings.push(finding("platform-artifact", app.id, macHref, "Cross-platform browser extension should point both systems to the same tested extension archive."));
      }
      const kinds = artifacts.windows?.kinds || artifacts.mac?.kinds || [];
      if (kinds.length && !kinds.includes("browser-extension")) {
        findings.push(finding("platform-artifact", app.id, windowsHref || macHref, "Extension archive does not contain recognizable browser-extension files."));
      }
    }

    if (app.video && !isExternalTarget(app.video)) {
      const pagePath = resolveLocalTarget(root, app.video);
      if (pagePath && existsSync(pagePath)) {
        const html = await readFile(pagePath, "utf8");
        const actualHomeHref = anchorHrefByClass(html, "hub-video-home");
        const expectedHomeHref = relativeHomeHref(root, pagePath, section);
        if (actualHomeHref !== expectedHomeHref) {
          findings.push(
            finding(
              "video-home-target",
              app.id,
              relative(root, pagePath).replaceAll(sep, "/"),
              `Video home target is ${actualHomeHref || "missing"}; expected ${expectedHomeHref}.`,
            ),
          );
        }
      }
    }

    projects.push({ id: app.id, name: app.name, status: app.status, section, actions, artifacts });
  }

  findings.push(...await inspectOrphanPlaceholders(root, apps));
  const report = { summary: {}, projects, findings };
  if (onlineBaseUrl || checkExternalTargets) {
    await inspectOnlineTargets(report, onlineBaseUrl, fetchImpl);
  }

  report.findings.sort((left, right) =>
    `${left.rule}:${left.projectId}:${left.path}`.localeCompare(`${right.rule}:${right.projectId}:${right.path}`),
  );
  report.summary = {
    projects: projects.length,
    actions: projects.reduce((total, project) => total + project.actions.length, 0),
    findings: report.findings.length,
    important: report.findings.filter((item) => item.severity === "important").length,
    normal: report.findings.filter((item) => item.severity === "normal").length,
  };
  return report;
}

export function formatAuditMarkdown(report) {
  const lines = [
    "# AI Application Hub Publication Audit",
    "",
    `- Projects: ${report.summary.projects}`,
    `- Actions: ${report.summary.actions}`,
    `- Findings: ${report.summary.findings}`,
    `- Important: ${report.summary.important}`,
    `- Normal: ${report.summary.normal}`,
    "",
    "## Findings",
    "",
  ];
  if (!report.findings.length) lines.push("No findings.");
  for (const item of report.findings) {
    lines.push(`- [${item.severity}] \`${item.rule}\` ${item.projectId || "repository"} - \`${item.path}\`: ${item.message}`);
  }
  lines.push("", "## Projects", "");
  for (const project of report.projects) {
    lines.push(`- \`${project.id}\` ${project.name} -> \`#${project.section}\` (${project.actions.map((action) => action.type).join(", ")})`);
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const scriptPath = fileURLToPath(import.meta.url);
  const root = dirname(dirname(scriptPath));
  const formatIndex = process.argv.indexOf("--format");
  const onlineIndex = process.argv.indexOf("--online-base");
  const format = formatIndex >= 0 ? process.argv[formatIndex + 1] : "json";
  const onlineBaseUrl = onlineIndex >= 0 ? process.argv[onlineIndex + 1] : "";
  const checkExternalTargets = process.argv.includes("--check-external");
  const runtime = await readFile(join(root, "app-20260706-restore-games.js"), "utf8");
  const report = await auditCatalog({ root, runtime, onlineBaseUrl, checkExternalTargets });
  process.stdout.write(format === "markdown" ? formatAuditMarkdown(report) : `${JSON.stringify(report, null, 2)}\n`);
  if (report.summary.important > 0) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
