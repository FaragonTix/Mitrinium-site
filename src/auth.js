import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

const googleJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const sessionCookie = "mitrinium_session";
const sessionIssuer = "mitrinium";
const sessionAudience = "mitrinium-web";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function adminEmails(env) {
  return new Set(
    String(env.ADMIN_EMAILS || "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean),
  );
}

function sessionKey(env) {
  if (!env.SESSION_SECRET) {
    throw new Error("Секрет пользовательских сессий не настроен.");
  }
  return new TextEncoder().encode(String(env.SESSION_SECRET));
}

function readCookie(request, name) {
  const source = request.headers.get("cookie") || "";
  for (const part of source.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function userFromEmail(email, env) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error("Google не передал email пользователя.");
  return {
    email: normalized,
    isAdmin: adminEmails(env).has(normalized),
  };
}

function localUser(request, env) {
  const hostname = new URL(request.url).hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    return null;
  }

  const firstAdmin = [...adminEmails(env)][0];
  return userFromEmail(
    request.headers.get("x-dev-user-email") ||
      env.DEV_USER_EMAIL ||
      firstAdmin ||
      "local@mitrinium.test",
    env,
  );
}

export async function authenticateGoogle(credential, env) {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error("Google Client ID не настроен.");
  }
  if (!credential) throw new Error("Google не передал токен входа.");

  const { payload } = await jwtVerify(credential, googleJwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: String(env.GOOGLE_CLIENT_ID),
  });
  if (payload.email_verified !== true) {
    throw new Error("Email Google-аккаунта не подтверждён.");
  }

  return userFromEmail(payload.email, env);
}

export async function createSession(user, env) {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(sessionIssuer)
    .setAudience(sessionAudience)
    .setSubject(user.email)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(sessionKey(env));
}

export function sessionCookieHeader(token) {
  return `${sessionCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
}

export function clearSessionCookieHeader() {
  return `${sessionCookie}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function getUser(request, env) {
  const local = localUser(request, env);
  if (local) return local;

  const token = readCookie(request, sessionCookie);
  if (!token) throw new Error("Требуется вход через Google.");

  try {
    const { payload } = await jwtVerify(token, sessionKey(env), {
      issuer: sessionIssuer,
      audience: sessionAudience,
    });
    return userFromEmail(payload.email || payload.sub, env);
  } catch {
    throw new Error("Сессия истекла. Войдите через Google ещё раз.");
  }
}
