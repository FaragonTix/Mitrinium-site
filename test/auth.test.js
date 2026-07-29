import assert from "node:assert/strict";
import test from "node:test";
import {
  createSession,
  getUser,
  sessionCookieHeader,
} from "../src/auth.js";

test("сессионная cookie возвращает Google email и роль администратора", async () => {
  const env = {
    SESSION_SECRET: "test-secret-that-is-long-enough-for-hs256",
    ADMIN_EMAILS: "admin@example.com",
  };
  const token = await createSession({ email: "admin@example.com" }, env);
  const cookie = sessionCookieHeader(token).split(";")[0];
  const request = new Request("https://mitrinium.test/api/auth/me", {
    headers: { cookie },
  });

  assert.deepEqual(await getUser(request, env), {
    email: "admin@example.com",
    isAdmin: true,
  });
});

test("API без cookie требует вход через Google", async () => {
  const request = new Request("https://mitrinium.test/api/rpc");
  await assert.rejects(
    () =>
      getUser(request, {
        SESSION_SECRET: "test-secret-that-is-long-enough-for-hs256",
        ADMIN_EMAILS: "",
      }),
    /Требуется вход через Google/,
  );
});
