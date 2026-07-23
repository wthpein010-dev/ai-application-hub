import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtime = readFileSync(resolve(root, "app-20260706-restore-games.js"), "utf8");

function loadDefaultApps() {
  const start = runtime.indexOf("const defaultApps = [");
  const closing = /\r?\n\];\r?\n\r?\nlet apps/.exec(runtime.slice(start));

  if (start === -1 || !closing) {
    throw new Error("Unable to find the defaultApps declaration.");
  }

  const end = start + closing.index + 3;
  const source = runtime
    .slice(start, end + 3)
    .replace("const defaultApps =", "globalThis.defaultApps =")
    .replace(/\bHUB_BRIEF\b/g, '""');
  const context = { globalThis: {} };

  vm.runInNewContext(source, context);
  return context.globalThis.defaultApps;
}

function htmlEntities(value) {
  return Array.from(String(value), (character) => {
    const code = character.codePointAt(0);

    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === "\"") return "&quot;";
    if (character === "'") return "&#39;";
    return code > 127 ? "&#" + code + ";" : character;
  }).join("");
}

function numericizeNonAscii(value) {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0);
    return code > 127 ? "&#" + code + ";" : character;
  }).join("");
}

function htmlToText(value) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function rootRelativeHref(pageDirectory, rootRelativePath) {
  const target = resolve(root, rootRelativePath);
  const href = relative(pageDirectory, target).replaceAll(sep, "/");

  return href || ".";
}

function projectHref(pageDirectory, entry) {
  if (/^[a-z][a-z\d+.-]*:/i.test(entry)) return entry;
  return rootRelativeHref(pageDirectory, entry);
}

function extractVideoParts(existingHtml, pagePath) {
  const source = existingHtml.match(/data-src=["']([^"']+\.mp4)["']/i)?.[1];

  if (!source) {
    throw new Error("Missing MP4 data-src: " + pagePath);
  }

  const poster = existingHtml.match(/\sposter=["']([^"']+)["']/i)?.[1] || "";
  const track = existingHtml.match(/<track\b[\s\S]*?>/i)?.[0] || "";
  const chapterMatches = existingHtml.matchAll(
    /<button\b(?=[^>]*\bdata-time=["'][^"']+["'])[^>]*>[\s\S]*?<\/button>/gi,
  );
  const heading = existingHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "";
  const description = existingHtml.match(
    /<p\b[^>]*class=["'][^"']*(?:hub-video-description|intro)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i,
  )?.[1] || "";
  const chapters = Array.from(chapterMatches, (chapter) => {
    const time = chapter[0].match(/data-time=["']([^"']+)["']/i)?.[1];
    const inner = chapter[0]
      .replace(/^<button\b[^>]*>/i, "")
      .replace(/<\/button>$/i, "");

    return (
      '      <button class="hub-video-chapter" type="button" data-time="' +
      htmlEntities(time) +
      '">' +
      numericizeNonAscii(inner) +
      "</button>"
    );
  });

  return {
    source,
    poster,
    track: numericizeNonAscii(track),
    chapters,
    heading: htmlToText(heading),
    description: htmlToText(description),
  };
}

function renderPage(app, pagePath, existingHtml) {
  const pageDirectory = dirname(pagePath);
  const rootHref = rootRelativeHref(pageDirectory, ".");
  const cssHref = rootHref + "/assets/hub-video-player.css";
  const scriptHref = rootHref + "/assets/hub-video-player.js";
  const entryHref = projectHref(pageDirectory, app.entry);
  const parts = extractVideoParts(existingHtml, pagePath);
  const defaultHeading = app.name + " " + String.fromCodePoint(20171, 32461, 35270, 39057);
  const heading = parts.heading || defaultHeading;
  const description = parts.description || app.brief;
  const posterAttribute = parts.poster
    ? ' poster="' + htmlEntities(parts.poster) + '"'
    : "";
  const chapterMarkup = parts.chapters.length
    ? [
        '    <section class="hub-video-chapters" aria-label="&#35270;&#39057;&#31456;&#33410;">',
        ...parts.chapters,
        "    </section>",
      ].join("\n")
    : "";

  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "  <head>",
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '    <meta name="color-scheme" content="dark" />',
    '    <link rel="icon" href="data:," />',
    "    <title>" + htmlEntities(app.name) + " &#20171;&#32461;&#35270;&#39057;</title>",
    '    <link rel="stylesheet" href="' + cssHref + '" />',
    "  </head>",
    "  <body data-hub-video-page>",
    '    <a class="hub-video-home" href="' +
      rootHref +
      '/index.html">&#36820;&#22238;&#20027;&#39029;</a>',
    '    <main class="hub-video-page">',
    '      <p class="hub-video-kicker">&#25945;&#31243;&#35270;&#39057;</p>',
    "      <h1>" + htmlEntities(heading) + "</h1>",
    '      <p class="hub-video-description">' + htmlEntities(description) + "</p>",
    '      <section class="hub-video-player" aria-label="' +
      htmlEntities(app.name) +
      ' &#20171;&#32461;&#35270;&#39057;">',
    '        <div class="hub-video-stage">',
    '          <div class="hub-video-load-card" id="loadCard" role="status">',
    "            <strong>&#20934;&#22791;&#25773;&#25918;&#20171;&#32461;&#35270;&#39057;</strong>",
    '            <p data-hub-video-message>&#28857;&#20987;&#21518;&#20877;&#21152;&#36733;&#35270;&#39057;&#65292;&#36991;&#20813;&#25171;&#24320;&#39029;&#38754;&#26102;&#31561;&#24453;&#12290;</p>',
    '            <button id="loadVideo" type="button">&#21152;&#36733;&#24182;&#25773;&#25918;&#35270;&#39057;</button>',
    "          </div>",
    '          <video id="introVideo" controls playsinline preload="none" data-src="' +
      htmlEntities(parts.source) +
      '"' +
      posterAttribute +
      " hidden>" +
      parts.track +
      "</video>",
    "        </div>",
    "      </section>",
    '      <nav class="hub-video-actions" aria-label="&#35270;&#39057;&#30456;&#20851;&#20837;&#21475;">',
    '        <a href="' + htmlEntities(parts.source) + '">&#25171;&#24320; MP4</a>',
    '        <a href="' +
      htmlEntities(entryHref) +
      '">&#25171;&#24320;&#39033;&#30446;</a>',
    "      </nav>",
    chapterMarkup,
    "    </main>",
    '    <script type="module" src="' + scriptHref + '"></script>',
    "  </body>",
    "</html>",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

const apps = loadDefaultApps();

for (const app of apps) {
  if (!app.video) throw new Error("Missing video page for " + app.id);

  const pagePath = resolve(root, app.video.replace(/^\.\//, ""));
  const existingHtml = readFileSync(pagePath, "utf8");

  writeFileSync(pagePath, renderPage(app, pagePath, existingHtml), "utf8");
}

console.log("Standardized " + apps.length + " video pages.");
