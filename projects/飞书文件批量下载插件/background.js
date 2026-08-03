const CACHE_TTL = 30 * 60 * 1000;
const EXPORT_POLL_LIMIT = 18;
const EXPORT_POLL_INTERVAL = 1200;

const STORAGE_KEYS = {
  files: "feishuBatchFiles",
  tree: "feishuBatchTree",
  host: "feishuBatchHost",
  loadedAt: "feishuBatchLoadedAt"
};

const TYPE_META = {
  2: { apiType: "doc", extension: "docx", label: "文档" },
  3: { apiType: "sheet", extension: "xlsx", label: "表格" },
  8: { apiType: "bitable", extension: "xlsx", label: "多维表格" },
  11: { apiType: "mindnote", extension: "mm", label: "思维笔记" },
  22: { apiType: "docx", extension: "docx", label: "文档" },
  30: { apiType: "slides", extension: "pptx", label: "幻灯片" }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) {
    return false;
  }

  if (message.type === "LOAD_FEISHU_LIBRARY") {
    loadFeishuLibrary(message.origin, Boolean(message.force))
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "CLEAR_FEISHU_CACHE") {
    chrome.storage.local.remove(Object.values(STORAGE_KEYS), () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "DOWNLOAD_FEISHU_URL") {
    downloadWithChrome({
      url: message.url,
      filename: message.filename,
      conflictAction: "uniquify",
      saveAs: false
    })
      .then((downloadId) => sendResponse({ ok: true, downloadId }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "GET_FEISHU_CSRF") {
    getCsrfToken(message.origin)
      .then((csrf) => sendResponse({ ok: true, csrf }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "feishu-export") {
    return;
  }

  port.onMessage.addListener((message) => {
    if (message?.type === "START_EXPORT") {
      exportFiles(port, message).catch((error) => {
        safePost(port, { type: "job-error", error: error.message });
      });
    }
  });
});

async function loadFeishuLibrary(origin, force = false) {
  const normalizedOrigin = normalizeOrigin(origin);
  assertFeishuOrigin(normalizedOrigin);

  const cached = await getStorage(Object.values(STORAGE_KEYS));
  const sameHost = cached[STORAGE_KEYS.host] === new URL(normalizedOrigin).hostname;
  const fresh = Date.now() - Number(cached[STORAGE_KEYS.loadedAt] || 0) < CACHE_TTL;

  if (!force && sameHost && fresh && Array.isArray(cached[STORAGE_KEYS.files]) && Array.isArray(cached[STORAGE_KEYS.tree])) {
    return {
      files: cached[STORAGE_KEYS.files],
      tree: cached[STORAGE_KEYS.tree],
      loadedAt: cached[STORAGE_KEYS.loadedAt],
      cached: true
    };
  }

  const context = createLoadContext(normalizedOrigin);
  const tree = [
    createFolderNode("root:my", "我的文件", "我的文件", "my"),
    createFolderNode("root:shared", "共享文件夹", "共享文件夹", "shared"),
    createFolderNode("root:wiki", "知识库", "知识库", "wiki")
  ];

  await Promise.allSettled([
    loadMySpace(context, tree[0]),
    loadSharedSpace(context, tree[1]),
    loadWikiSpaces(context, tree[2])
  ]);

  pruneEmptyFolders(tree);

  const payload = {
    [STORAGE_KEYS.files]: context.files,
    [STORAGE_KEYS.tree]: tree,
    [STORAGE_KEYS.host]: new URL(normalizedOrigin).hostname,
    [STORAGE_KEYS.loadedAt]: Date.now()
  };
  await setStorage(payload);

  return {
    files: context.files,
    tree,
    loadedAt: payload[STORAGE_KEYS.loadedAt],
    cached: false
  };
}

async function loadMySpace(context, rootNode) {
  const folderData = await getJson(context.origin, "/space/api/explorer/v3/my_space/folder/?asc=1&rank=5&length=50");
  const rootData = await getJson(context.origin, "/space/api/explorer/v3/my_space/obj/");

  await appendExplorerResponse(context, rootNode, rootData, rootNode.id, rootNode.path, "my");

  const folderTokens = folderData?.data?.node_list || [];
  for (const token of folderTokens) {
    const folder = folderData?.data?.entities?.nodes?.[token];
    if (!folder?.obj_token || !folder?.name) {
      continue;
    }

    const folderNode = createFolderNode(`folder:${folder.obj_token}`, cleanName(folder.name), joinPath(rootNode.path, folder.name), "my", folder.obj_token, folder.url);
    rootNode.children.push(folderNode);
    await loadExplorerChildren(context, folderNode, folder.obj_token, "my");
  }
}

async function loadSharedSpace(context, rootNode) {
  const data = await getJson(context.origin, "/space/api/explorer/v2/share/folder/list/?asc=0&rank=3&hidden=0&length=50");
  const folderTokens = data?.data?.node_list || [];

  for (const token of folderTokens) {
    const folder = data?.data?.entities?.nodes?.[token];
    if (!folder?.obj_token || !folder?.name) {
      continue;
    }

    const folderNode = createFolderNode(`folder:${folder.obj_token}`, cleanName(folder.name), joinPath(rootNode.path, folder.name), "shared", folder.obj_token, folder.url);
    rootNode.children.push(folderNode);
    await loadExplorerChildren(context, folderNode, folder.obj_token, "shared");
  }
}

async function loadExplorerChildren(context, parentNode, token, source) {
  if (!token || context.visitedExplorer.has(token)) {
    return;
  }
  context.visitedExplorer.add(token);

  const data = await getJson(context.origin, `/space/api/explorer/v3/children/list/?asc=1&rank=5&token=${encodeURIComponent(token)}`);
  await appendExplorerResponse(context, parentNode, data, token, parentNode.path, source);
}

async function appendExplorerResponse(context, parentNode, response, parentToken, parentPath, source) {
  const nodeIds = response?.data?.node_list || [];
  const entities = response?.data?.entities?.nodes || {};

  for (const nodeId of nodeIds) {
    const node = entities[nodeId];
    if (!node || node.obj_token === parentToken) {
      continue;
    }

    const name = cleanName(node.name || "未命名文件");
    const path = joinPath(parentPath, name);

    if (Number(node.type) === 0) {
      const folderNode = createFolderNode(`folder:${node.obj_token}`, name, path, source, node.obj_token, node.url);
      parentNode.children.push(folderNode);
      await loadExplorerChildren(context, folderNode, node.obj_token, source);
      continue;
    }

    const fileNode = createFileNode(context, {
      token: node.obj_token,
      objType: Number(node.type),
      name,
      path: parentPath,
      url: node.url,
      source
    });

    if (fileNode) {
      parentNode.children.push(fileNode);
    }
  }
}

async function loadWikiSpaces(context, rootNode) {
  const data = await getJson(context.origin, "/space/api/wiki/v2/space/get/?size=40");
  const spaces = data?.data?.spaces || [];

  for (const space of spaces) {
    if (!space?.space_id || !space?.root_token) {
      continue;
    }

    const spaceName = cleanName(space.space_name || "未命名知识库");
    const spaceNode = createFolderNode(`wiki-space:${space.space_id}`, spaceName, joinPath(rootNode.path, spaceName), "wiki", space.root_token);
    rootNode.children.push(spaceNode);

    const treeInfo = await fetchWikiTree(context, space.space_id, space.root_token);
    const wikiTree = treeInfo?.data?.tree;
    if (!wikiTree) {
      continue;
    }

    const childTokens = wikiTree.child_map?.[space.root_token] || wikiTree.root_list || [];
    for (const wikiToken of childTokens) {
      const node = wikiTree.nodes?.[wikiToken];
      if (node) {
        await appendWikiNode(context, spaceNode, node, space.space_id, spaceNode.path);
      }
    }
  }
}

async function appendWikiNode(context, parentNode, wikiNode, spaceId, parentPath) {
  const wikiToken = wikiNode.wiki_token || wikiNode.origin_wiki_token;
  const token = wikiNode.obj_token;
  const name = cleanName(wikiNode.title || wikiNode.name || "未命名知识库节点");
  const objType = Number(wikiNode.obj_type);
  const canExport = Boolean(token && TYPE_META[objType]);
  const hasChild = Boolean(wikiNode.has_child);
  const path = joinPath(parentPath, name);

  let currentNode;
  if (canExport) {
    currentNode = createFileNode(context, {
      token,
      objType,
      name,
      path: parentPath,
      url: wikiNode.url,
      source: "wiki",
      wikiToken,
      spaceId
    });
    if (!currentNode) {
      return;
    }
    currentNode.children = [];
    parentNode.children.push(currentNode);
  } else if (hasChild) {
    currentNode = createFolderNode(`wiki:${wikiToken || token}`, name, path, "wiki", token || wikiToken, wikiNode.url);
    parentNode.children.push(currentNode);
  }

  if (!hasChild || !wikiToken || context.visitedWiki.has(`${spaceId}:${wikiToken}`)) {
    return;
  }
  context.visitedWiki.add(`${spaceId}:${wikiToken}`);

  const treeInfo = await fetchWikiTree(context, spaceId, wikiToken);
  const tree = treeInfo?.data?.tree;
  if (!tree) {
    return;
  }

  const children = tree.child_map?.[wikiToken] || [];
  for (const childToken of children) {
    const childNode = tree.nodes?.[childToken];
    if (childNode && currentNode) {
      await appendWikiNode(context, currentNode, childNode, spaceId, path);
    }
  }
}

async function fetchWikiTree(context, spaceId, wikiToken) {
  return getJson(context.origin, `/space/api/wiki/v2/tree/get_info/?space_id=${encodeURIComponent(spaceId)}&wiki_token=${encodeURIComponent(wikiToken)}`);
}

async function exportFiles(port, message) {
  const origin = normalizeOrigin(message.origin);
  assertFeishuOrigin(origin);

  const files = Array.isArray(message.files) ? message.files.filter((file) => file?.obj_token && TYPE_META[file.obj_type]) : [];
  const folderName = sanitizePathSegment(message.folderName || `Feishu-Export-${timestamp()}`);
  const total = files.length;

  safePost(port, { type: "job-start", total });

  let completed = 0;
  let failed = 0;

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const fileId = file.id || file.obj_token;
    safePost(port, {
      type: "file-update",
      fileId,
      index: index + 1,
      total,
      status: "running",
      message: "创建导出任务"
    });

    try {
      const ticket = await createExportTask(origin, file);
      safePost(port, {
        type: "file-update",
        fileId,
        index: index + 1,
        total,
        status: "running",
        message: "等待飞书生成文件"
      });

      const result = await waitForExportResult(origin, ticket, file);
      const extension = result.extension || getTypeMeta(file.obj_type).extension;
      const filename = buildDownloadPath(folderName, file, extension, index + 1);

      const downloadId = await downloadWithChrome({
        url: result.url,
        filename,
        conflictAction: "uniquify",
        saveAs: false
      });

      completed += 1;
      safePost(port, {
        type: "file-update",
        fileId,
        index: index + 1,
        total,
        status: "done",
        message: "已交给浏览器下载",
        downloadId,
        filename
      });
    } catch (error) {
      failed += 1;
      safePost(port, {
        type: "file-update",
        fileId,
        index: index + 1,
        total,
        status: "failed",
        message: error.message
      });
    }

    safePost(port, {
      type: "job-progress",
      completed,
      failed,
      total,
      percent: total ? Math.round(((completed + failed) / total) * 100) : 100
    });
  }

  safePost(port, { type: "job-complete", completed, failed, total });
}

async function createExportTask(origin, file) {
  const meta = getTypeMeta(file.obj_type);
  const requestId = `fb-${crypto.randomUUID().replace(/-/g, "")}`;
  const body = {
    token: file.obj_token,
    type: meta.apiType,
    file_extension: meta.extension,
    event_source: 1,
    need_comment: false
  };

  const response = await feishuFetch(origin, `/space/api/export/create/?synced_block_host_token=${encodeURIComponent(file.obj_token)}&synced_block_host_type=${encodeURIComponent(meta.apiType)}`, {
    method: "POST",
    headers: await requestHeaders(origin, requestId, true),
    body: JSON.stringify(body)
  });
  const json = await response.json();
  const ticket = json?.data?.ticket;

  if (!response.ok || !ticket) {
    throw new Error(json?.msg || `导出任务创建失败 ${response.status}`);
  }

  return ticket;
}

async function waitForExportResult(origin, ticket, file) {
  const meta = getTypeMeta(file.obj_type);

  for (let attempt = 0; attempt < EXPORT_POLL_LIMIT; attempt += 1) {
    await sleep(EXPORT_POLL_INTERVAL);
    const response = await getJson(origin, `/space/api/export/result/${encodeURIComponent(ticket)}?token=${encodeURIComponent(file.obj_token)}&type=${encodeURIComponent(meta.apiType)}&synced_block_host_token=${encodeURIComponent(file.obj_token)}&synced_block_host_type=${encodeURIComponent(meta.apiType)}`);
    const result = response?.data?.result;
    const fileToken = result?.file_token;

    if (fileToken) {
      return {
        url: `https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/all/${encodeURIComponent(fileToken)}/?synced_block_host_token=${encodeURIComponent(file.obj_token)}&synced_block_host_type=${encodeURIComponent(meta.apiType)}`,
        extension: result?.file_extension || meta.extension
      };
    }
  }

  throw new Error("导出超时");
}

async function getJson(origin, path) {
  await sleep(120);
  const response = await feishuFetch(origin, path, {
    method: "GET",
    headers: await requestHeaders(origin, `fb-${crypto.randomUUID().replace(/-/g, "")}`, false)
  });
  const json = await response.json();
  if (!response.ok || json?.code !== 0) {
    throw new Error(json?.msg || `请求失败 ${response.status}`);
  }
  return json;
}

async function feishuFetch(origin, path, init = {}) {
  const url = path.startsWith("http") ? path : `${origin}${path}`;
  return fetch(url, {
    ...init,
    credentials: "include",
    mode: "cors"
  });
}

async function requestHeaders(origin, requestId, hasBody) {
  const headers = {
    accept: "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9",
    "doc-biz": "Lark",
    pragma: "no-cache",
    "request-id": requestId,
    "x-request-id": requestId,
    "x-tt-trace-id": requestId,
    context: `${requestId};os=web;app_version=1.0.0;platform=web`
  };

  if (hasBody) {
    headers["content-type"] = "application/json";
  }

  const csrf = await getCsrfToken(origin);
  if (csrf) {
    headers["x-csrftoken"] = csrf;
  }

  return headers;
}

async function getCsrfToken(origin) {
  const csrf = await getCookie("_csrf_token", origin);
  if (csrf) {
    return csrf;
  }
  return getCookie("swp_csrf_token", origin);
}

async function getCookie(name, origin) {
  return new Promise((resolve) => {
    chrome.cookies.get({ name, url: origin }, (cookie) => {
      resolve(cookie?.value || "");
    });
  });
}

function createLoadContext(origin) {
  return {
    origin,
    files: [],
    visitedExplorer: new Set(),
    visitedWiki: new Set(),
    fileIds: new Set()
  };
}

function createFolderNode(id, name, path, source, token = "", url = "") {
  return {
    id,
    kind: "folder",
    name: cleanName(name),
    path,
    source,
    token,
    url,
    children: []
  };
}

function createFileNode(context, data) {
  const meta = TYPE_META[data.objType];
  if (!data.token || !meta) {
    return null;
  }

  const id = `file:${data.token}`;
  if (context.fileIds.has(id)) {
    return null;
  }
  context.fileIds.add(id);

  const file = {
    id,
    kind: "file",
    obj_token: data.token,
    obj_type: data.objType,
    name: cleanName(data.name),
    path: data.path || "",
    url: data.url || "",
    source: data.source,
    wikiToken: data.wikiToken || "",
    spaceId: data.spaceId || "",
    extension: meta.extension,
    typeLabel: meta.label
  };

  context.files.push(file);
  return { ...file, children: undefined };
}

function pruneEmptyFolders(nodes) {
  for (const node of nodes) {
    if (Array.isArray(node.children)) {
      pruneEmptyFolders(node.children);
      node.children = node.children.filter((child) => child.kind === "file" || child.children?.length);
    }
  }
}

function getTypeMeta(objType) {
  const meta = TYPE_META[Number(objType)];
  if (!meta) {
    throw new Error(`不支持的飞书文件类型：${objType}`);
  }
  return meta;
}

function normalizeOrigin(origin) {
  const url = new URL(origin);
  return url.origin;
}

function assertFeishuOrigin(origin) {
  const host = new URL(origin).hostname;
  if (!/(^|\.)feishu\.cn$|(^|\.)larksuite\.com$/.test(host)) {
    throw new Error("请先打开飞书云文档、知识库或网盘页面");
  }
}

function joinPath(...segments) {
  return segments
    .filter(Boolean)
    .map((segment) => cleanName(segment))
    .join("/");
}

function cleanName(value) {
  return String(value || "未命名")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "未命名";
}

function sanitizePathSegment(value) {
  return cleanName(value).replace(/^\.+$/, "Feishu-Export");
}

function buildDownloadPath(folderName, file, extension, index) {
  const basePath = file.path ? file.path.split("/").map(sanitizePathSegment).join("/") : "未分类";
  const fileName = sanitizePathSegment(file.name);
  const ext = String(extension || file.extension || "docx").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const numberedName = `${String(index).padStart(3, "0")}-${fileName}${fileName.toLowerCase().endsWith(`.${ext}`) ? "" : `.${ext}`}`;
  return `${folderName}/${basePath}/${numberedName}`;
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStorage(payload) {
  return new Promise((resolve) => chrome.storage.local.set(payload, resolve));
}

function downloadWithChrome(options) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, (downloadId) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(downloadId);
    });
  });
}

function safePost(port, message) {
  try {
    port.postMessage(message);
  } catch {
    // Popup may have closed. Downloads already queued continue in the browser.
  }
}
