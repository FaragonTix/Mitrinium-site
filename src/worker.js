import { getUser } from "./auth.js";
import {
  adminDeleteCharacter,
  adminListCharacters,
  adminSaveCharacter,
  adminSetCharacterVisibility,
  hideCharacter,
  listVisibleCharacters,
  loadCharacter,
  restoreHiddenCharacters,
  saveCharacter,
  saveCharacterState,
} from "./characters.js";
import {
  applyOptimalFour,
  clearRollLog,
  getRollLog,
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
    mitriniumRestoreHiddenCharacters: () =>
      restoreHiddenCharacters(env.DB, user),
    mitriniumRollEfficiency: () =>
      rollEfficiency(env.DB, user, args[0]),
    mitriniumApplyOptimalFour: () =>
      applyOptimalFour(env.DB, user, args[0]),
    mitriniumRollRandom: () => rollRandom(env.DB, user, args[0]),
    mitriniumGetRollLog: () => getRollLog(env.DB, user, args[0]),
    mitriniumClearRollLog: () => clearRollLog(env.DB, user),
    adminListCharacters: () => adminListCharacters(env.DB, user),
    adminSaveCharacter: () => adminSaveCharacter(env.DB, user, args[0]),
    adminSetCharacterVisibility: () =>
      adminSetCharacterVisibility(env.DB, user, args[0], args[1]),
    adminDeleteCharacter: () =>
      adminDeleteCharacter(env.DB, user, args[0]),
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
      message.includes("Cloudflare Access");
    return json({ ok: false, error: message }, authError ? 401 : 400);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/rpc") {
      return handleRpc(request, env);
    }
    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "mitrinium" });
    }
    return env.ASSETS.fetch(request);
  },
};
