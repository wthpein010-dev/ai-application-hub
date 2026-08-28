"use strict";

const { readFile, readdir } = require("node:fs/promises");
const path = require("node:path");

function resolveBundledLevelDirectories({
  allowOverride = false,
  overrideDirectory,
  portableExecutableDirectory,
  resourcesPath,
  executablePath,
  isPackaged = false,
} = {}) {
  if (allowOverride && typeof overrideDirectory === "string" && overrideDirectory.trim()) {
    return [path.resolve(overrideDirectory)];
  }

  const portableDirectory = typeof portableExecutableDirectory === "string"
    && portableExecutableDirectory.trim()
    ? path.resolve(portableExecutableDirectory)
    : null;
  const packagedDirectory = isPackaged
    && typeof executablePath === "string"
    && executablePath.trim()
    ? path.dirname(path.resolve(executablePath))
    : null;
  const packagedResources = isPackaged
    && typeof resourcesPath === "string"
    && resourcesPath.trim()
    ? path.resolve(resourcesPath)
    : null;
  const roots = portableDirectory
    ? [portableDirectory]
    : [...new Set([packagedResources, packagedDirectory].filter(Boolean))];
  return roots.flatMap((root) => (
    ["Editorlevel", "EditorLevels"].map((name) => path.join(root, name))
  ));
}

async function collectFiles(directory, root, folderName) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true }));
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath, root, folderName));
    } else if (entry.isFile()) {
      const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, "/");
      files.push({
        name: entry.name,
        webkitRelativePath: `${folderName}/${relativePath}`,
        text: await readFile(absolutePath, "utf8"),
      });
    }
  }
  return files;
}

async function readBundledLevelFiles(directories) {
  for (const directory of directories ?? []) {
    const resolved = path.resolve(directory);
    try {
      const folderName = path.basename(resolved);
      return {
        available: true,
        folderName,
        files: await collectFiles(resolved, resolved, folderName),
      };
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") continue;
      throw error;
    }
  }
  return { available: false, folderName: null, files: [] };
}

module.exports = {
  readBundledLevelFiles,
  resolveBundledLevelDirectories,
};
