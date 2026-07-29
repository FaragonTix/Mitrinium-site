import { createRemoteJWKSet, jwtVerify } from "jose";

const jwksCache = new Map();

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

function localUser(request, env) {
  const hostname = new URL(request.url).hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    return null;
  }

  const firstAdmin = [...adminEmails(env)][0];
  const email = normalizeEmail(
    request.headers.get("x-dev-user-email") ||
      env.DEV_USER_EMAIL ||
      firstAdmin ||
      "local@mitrinium.test",
  );

  return {
    email,
    isAdmin: adminEmails(env).has(email),
  };
}

export async function getUser(request, env) {
  const local = localUser(request, env);
  if (local) return local;

  if (!env.TEAM_DOMAIN || !env.POLICY_AUD) {
    throw new Error("Авторизация Cloudflare Access ещё не настроена.");
  }

  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) {
    throw new Error("Требуется вход в приложение.");
  }

  const issuer = String(env.TEAM_DOMAIN).replace(/\/+$/, "");
  const certsUrl = new URL(`${issuer}/cdn-cgi/access/certs`);
  let jwks = jwksCache.get(certsUrl.href);

  if (!jwks) {
    jwks = createRemoteJWKSet(certsUrl);
    jwksCache.set(certsUrl.href, jwks);
  }

  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience: env.POLICY_AUD,
  });

  const email = normalizeEmail(payload.email);
  if (!email) {
    throw new Error("Cloudflare Access не передал email пользователя.");
  }

  return {
    email,
    isAdmin: adminEmails(env).has(email),
  };
}

