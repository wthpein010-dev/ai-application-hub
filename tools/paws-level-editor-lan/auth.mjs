import { randomBytes, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "paws_lan_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function equalSecret(left, right) {
  const leftBytes = Buffer.from(String(left ?? ""), "utf8");
  const rightBytes = Buffer.from(String(right ?? ""), "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
function readCookie(cookieHeader) {
  for (const part of String(cookieHeader ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return rest.join("=");
  }
  return "";
}

export function createSessionAuth({ password, now = () => Date.now() } = {}) {
  const secret = String(password ?? "");
  const sessions = new Map();

  function prune() {
    const current = now();
    for (const [id, expiresAt] of sessions) {
      if (expiresAt <= current) sessions.delete(id);
    }
  }

  function authenticate(cookieHeader) {
    prune();
    const id = readCookie(cookieHeader);
    return Boolean(id && sessions.has(id));
  }

  return {
    enabled: secret.length > 0,
    authenticate,
    login(candidate) {
      if (!secret || !equalSecret(candidate, secret)) return "";
      const id = randomBytes(32).toString("base64url");
      sessions.set(id, now() + SESSION_TTL_MS);
      return id;
    },
    logout(cookieHeader) {
      sessions.delete(readCookie(cookieHeader));
    },
    loginCookie(id) {
      return `${COOKIE_NAME}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`;
    },
    logoutCookie() {
      return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
    },
  };
}
