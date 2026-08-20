const STORAGE_KEY = "gamespec-relay:v1";
const SECRET_KEYS = new Set([
  "apikey",
  "api_key",
  "authorization",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SECRET_KEYS.has(key.toLowerCase()))
      .map(([key, item]) => [key, sanitize(item)]),
  );
}

function emptyState() {
  return { projects: {}, settings: {} };
}

function readState(storage) {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return emptyState();
    return {
      projects: value.projects && typeof value.projects === "object" && !Array.isArray(value.projects)
        ? sanitize(value.projects)
        : {},
      settings: value.settings && typeof value.settings === "object" && !Array.isArray(value.settings)
        ? sanitize(value.settings)
        : {},
    };
  } catch {
    return emptyState();
  }
}

function projectId(project) {
  const id = String(project?.id || project?.project?.id || "").trim();
  if (!id) throw new TypeError("Project requires a stable id before it can be saved");
  return id;
}

export function createRelayStore(storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw new TypeError("GameSpec Relay storage must implement getItem and setItem");
  }

  function update(mutator) {
    const state = readState(storage);
    mutator(state);
    storage.setItem(STORAGE_KEY, JSON.stringify(sanitize(state)));
  }

  return {
    saveProject(project) {
      const safeProject = sanitize(clone(project));
      const id = projectId(safeProject);
      update((state) => { state.projects[id] = safeProject; });
      return clone(safeProject);
    },

    loadProject(id) {
      const project = readState(storage).projects[String(id)];
      return project ? clone(project) : null;
    },

    listProjects() {
      return Object.values(readState(storage).projects).map(clone);
    },

    deleteProject(id) {
      let deleted = false;
      update((state) => {
        deleted = Object.hasOwn(state.projects, String(id));
        delete state.projects[String(id)];
      });
      return deleted;
    },

    saveSettings(settings) {
      const safeSettings = sanitize(clone(settings || {}));
      update((state) => { state.settings = safeSettings; });
      return clone(safeSettings);
    },

    loadSettings() {
      return clone(readState(storage).settings);
    },
  };
}

export { STORAGE_KEY };
