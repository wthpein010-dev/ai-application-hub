const DEFAULT_KEY_PREFIX = "paws-level-editor:last-opened";

function storageKey(prefix, mode) {
  return `${prefix}:${mode === "lan" ? "lan" : "static"}`;
}

export function createLastOpenedLevelStore({
  storage = globalThis.localStorage,
  validateFileName = (value) => typeof value === "string" && value.endsWith(".json"),
  keyPrefix = DEFAULT_KEY_PREFIX,
} = {}) {
  return {
    read(mode) {
      if (!storage) return "";
      const key = storageKey(keyPrefix, mode);
      try {
        const fileName = storage.getItem(key) ?? "";
        if (!fileName) return "";
        if (validateFileName(fileName)) return fileName;
        storage.removeItem(key);
      } catch {
        return "";
      }
      return "";
    },

    write(mode, fileName) {
      if (!storage || !validateFileName(fileName)) return false;
      try {
        storage.setItem(storageKey(keyPrefix, mode), fileName);
        return true;
      } catch {
        return false;
      }
    },

    clear(mode) {
      if (!storage) return;
      try {
        storage.removeItem(storageKey(keyPrefix, mode));
      } catch {
        // Storage may be disabled by browser policy; startup still falls back safely.
      }
    },
  };
}
