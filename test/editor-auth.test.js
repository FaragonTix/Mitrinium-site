import assert from "node:assert/strict";
import test from "node:test";
import { createSession, sessionCookieHeader } from "../src/auth.js";
import worker from "../src/worker.js";

const sessionEnv = {
  SESSION_SECRET: "test-secret-that-is-long-enough-for-hs256",
  ADMIN_EMAILS: "",
};

test("редактор без сессии сразу перенаправляет на вход", async () => {
  const env = {
    ...sessionEnv,
    ASSETS: { fetch: () => new Response("editor") },
  };
  const response = await worker.fetch(
    new Request("https://mitrinium.test/editor/"),
    env,
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://mitrinium.test/login/?return=%2Feditor%2F",
  );
});

test("прямой URL файла редактора тоже требует вход", async () => {
  const env = {
    ...sessionEnv,
    ASSETS: { fetch: () => new Response("editor") },
  };
  const response = await worker.fetch(
    new Request("https://mitrinium.test/editor/index.html"),
    env,
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://mitrinium.test/login/?return=%2Feditor%2Findex.html",
  );
});

test("редактор с действующей сессией загружается как обычно", async () => {
  const token = await createSession({ email: "player@example.com" }, sessionEnv);
  const env = {
    ...sessionEnv,
    ASSETS: { fetch: () => new Response("editor") },
  };
  const response = await worker.fetch(
    new Request("https://mitrinium.test/editor/", {
      headers: { cookie: sessionCookieHeader(token).split(";")[0] },
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "editor");
});
