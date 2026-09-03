const TABS = new Set(["characters", "trinkets"]);

function validTab(tab) {
  return TABS.has(tab) ? tab : "characters";
}

function validId(id) {
  const numeric = Number(id);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function validPage(page) {
  const numeric = Number(page);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 1;
}

export function createAtlasState() {
  return {
    tab: "characters",
    characters: { query: "", page: 1, selection: null },
    trinkets: { query: "", page: 1, sort: "default", selection: null },
  };
}

export function setAtlasTab(state, tab) {
  return { ...state, tab: validTab(tab) };
}

export function setAtlasQuery(state, tab, query) {
  const selectedTab = validTab(tab);
  return {
    ...state,
    [selectedTab]: { ...state[selectedTab], query: String(query ?? ""), page: 1 },
  };
}

export function setAtlasPage(state, tab, page) {
  const selectedTab = validTab(tab);
  return {
    ...state,
    [selectedTab]: { ...state[selectedTab], page: validPage(page) },
  };
}

export function setAtlasSort(state, sort) {
  const allowed = new Set(["default", "recent", "name", "quantity", "activity"]);
  return {
    ...state,
    trinkets: { ...state.trinkets, sort: allowed.has(sort) ? sort : "default", page: 1 },
  };
}

export function selectAtlasItem(state, tab, id) {
  const selectedTab = validTab(tab);
  return {
    ...state,
    [selectedTab]: { ...state[selectedTab], selection: validId(id) },
  };
}

export function parseAtlasLocation(input) {
  const url = new URL(input, "https://atlas.local/");
  const tab = validTab(url.searchParams.get("tab"));
  const characterId = tab === "characters" ? validId(url.searchParams.get("character")) : null;
  const itemId = tab === "trinkets" ? validId(url.searchParams.get("item")) : null;
  return { tab, characterId, itemId };
}

export function formatAtlasLocation(state) {
  const tab = validTab(state?.tab);
  const params = new URLSearchParams({ tab });
  const selection = validId(state?.[tab]?.selection);
  if (selection) params.set(tab === "characters" ? "character" : "item", String(selection));
  return `?${params.toString()}`;
}
