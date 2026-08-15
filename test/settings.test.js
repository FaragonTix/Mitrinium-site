import assert from "node:assert/strict";
import test from "node:test";
import {
  adminSetCharacterDeletionPolicy,
  getCharacterDeletionPolicy,
} from "../src/settings.js";

function settingsDb(initial = null) {
  let value = initial;
  return {
    prepare(sql) {
      return {
        bind(next) { if (sql.includes("INSERT INTO")) value = next; return this; },
        async first() { return value === null ? null : { value }; },
        async run() { return { meta: { changes: 1 } }; },
      };
    },
  };
}

test("политика удаления по умолчанию запрещает действие игрокам", async () => {
  assert.equal(await getCharacterDeletionPolicy(settingsDb()), "forbidden");
});

test("администратор выбирает одну из трёх политик удаления", async () => {
  const db = settingsDb();
  await adminSetCharacterDeletionPolicy(db, { isAdmin: true, email: "admin@example.com" }, "archive");
  assert.equal(await getCharacterDeletionPolicy(db), "archive");
  await assert.rejects(
    () => adminSetCharacterDeletionPolicy(db, { isAdmin: true }, "unknown"),
    /Неизвестная политика/,
  );
});
