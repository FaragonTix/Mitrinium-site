import {
  authenticateGoogle,
  clearSessionCookieHeader,
  createSession,
  getUser,
  sessionCookieHeader,
} from "./auth.js";
import { grantAdmin, listAdmins, revokeAdmin } from "./admins.js";
import {
  clearEncounter,
  deleteEnemyTemplate,
  getEnemyLibrary,
  loadEncounter as loadCalculatorEncounter,
  saveEncounter,
  saveEnemyTemplate,
} from "./calculator.js";
import {
  adminDeleteCharacter,
  adminListCharacters,
  adminSaveCharacter,
  adminSetCharacterVisibility,
  deleteOwnCharacter,
  hideCharacter,
  listVisibleCharacters,
  loadCharacter,
  restoreHiddenCharacters,
  saveCharacter,
  saveCharacterState,
} from "./characters.js";
import {
  adminGetCharacterDeletionPolicy,
  adminSetCharacterDeletionPolicy,
} from "./settings.js";
import {
  appendExternalRoll,
  applyBiographyBonus,
  clearRollLog,
  getRollLog,
  rerollEfficiencyDie,
  rollEfficiency,
  rollRandom,
} from "./rolls.js";

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function jsonWithHeaders(payload, status, headers = {}) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

async function dispatch(method, args, env, user) {
  const methods = {
    getCurrentUserInfo: () => user,
    saveCharacter: () => saveCharacter(env.DB, user, args[0]),
    mitriniumSaveCharacter: () => saveCharacter(env.DB, user, args[0]),
    listSavedCharacters: async () =>
      (await listVisibleCharacters(env.DB, user)).characters,
    mitriniumListVisibleCharacters: () =>
      listVisibleCharacters(env.DB, user),
    loadCharacter: () => loadCharacter(env.DB, user, args[0]),
    saveCharacterState: () =>
      saveCharacterState(env.DB, user, args[0], args[1]),
    mitriniumHideCharacter: () => hideCharacter(env.DB, user, args[0]),
    mitriniumDeleteOwnCharacter: () => deleteOwnCharacter(env.DB, user, args[0]),
    mitriniumRestoreHiddenCharacters: () =>
      restoreHiddenCharacters(env.DB, user),
    mitriniumRollEfficiency: () =>
      rollEfficiency(env.DB, user, args[0]),
    mitriniumApplyBiographyBonus: () =>
      applyBiographyBonus(env.DB, user, args[0]),
    mitriniumRerollEfficiencyDie: () =>
      rerollEfficiencyDie(env.DB, user, args[0], args[1]),
    mitriniumRollRandom: () => rollRandom(env.DB, user, args[0]),
    mitriniumGetRollLog: () => getRollLog(env.DB, user, args[0]),
    mitriniumAppendExternalRoll: () => appendExternalRoll(env.DB, user, args[0]),
    mitriniumClearRollLog: () => clearRollLog(env.DB, user),
    adminListCharacters: () => adminListCharacters(env.DB, user),
    adminSaveCharacter: () => adminSaveCharacter(env.DB, user, args[0]),
    adminSetCharacterVisibility: () =>
      adminSetCharacterVisibility(env.DB, user, args[0], args[1]),
    adminDeleteCharacter: () =>
      adminDeleteCharacter(env.DB, user, args[0]),
    adminGetCharacterDeletionPolicy: () => adminGetCharacterDeletionPolicy(env.DB, user),
    adminSetCharacterDeletionPolicy: () => adminSetCharacterDeletionPolicy(env.DB, user, args[0]),
    adminListAdmins: () => listAdmins(env.DB, env, user),
    adminGrantAdmin: () => grantAdmin(env.DB, user, args[0]),
    adminRevokeAdmin: () => revokeAdmin(env.DB, env, user, args[0]),
    saveEncounter: () => saveEncounter(env.DB, user, args[0]),
    loadEncounter: () => loadCalculatorEncounter(env.DB, user),
    clearEncounter: () => clearEncounter(env.DB, user),
    getEnemyLibrary: () => getEnemyLibrary(env.DB),
    saveEnemyTemplate: () =>
      saveEnemyTemplate(env.DB, user, args[0]),
    deleteEnemyTemplate: () =>
      deleteEnemyTemplate(env.DB, user, args[0]),
  };

  const handler = methods[method];
  if (!handler) throw new Error(`Неизвестный серверный метод: ${method}`);
  return handler();
}

async function handleRpc(request, env) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Метод не поддерживается." }, 405);
  }

  try {
    const body = await request.json();
    const method = String(body?.method || "");
    const args = Array.isArray(body?.args) ? body.args : [];
    const user = await getUser(request, env);
    const result = await dispatch(method, args, env, user);
    return json({ ok: true, result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Неизвестная ошибка сервера.";
    const authError =
      message.includes("вход") ||
      message.includes("авторизац") ||
      message.includes("Сессия");
    return json({ ok: false, error: message }, authError ? 401 : 400);
  }
}

async function handleGoogleLogin(request, env) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Метод не поддерживается." }, 405);
  }
  try {
    const requestUrl = new URL(request.url);
    if (request.headers.get("origin") !== requestUrl.origin) {
      throw new Error("Недопустимый источник запроса.");
    }
    const body = await request.json();
    const user = await authenticateGoogle(body?.credential, env);
    const session = await createSession(user, env);
    return jsonWithHeaders({ ok: true, user }, 200, {
      "set-cookie": sessionCookieHeader(session),
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Ошибка входа через Google.",
      },
      401,
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/auth/config") {
      return json({ ok: true, clientId: env.GOOGLE_CLIENT_ID || "" });
    }
    if (url.pathname === "/api/auth/google") {
      return handleGoogleLogin(request, env);
    }
    if (url.pathname === "/api/auth/logout") {
      return jsonWithHeaders({ ok: true }, 200, {
        "set-cookie": clearSessionCookieHeader(),
      });
    }
    if (url.pathname === "/api/auth/me") {
      try {
        return json({ ok: true, user: await getUser(request, env) });
      } catch (error) {
        return json(
          { ok: false, error: error instanceof Error ? error.message : "Требуется вход." },
          401,
        );
      }
    }
    if (url.pathname === "/api/rpc") {
      return handleRpc(request, env);
    }
    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "mitrinium" });
    }
    return env.ASSETS.fetch(request);
  },
};
