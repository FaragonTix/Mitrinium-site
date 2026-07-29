import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEnemyTemplate } from "../src/calculator.js";

test("калькулятор нормализует статблок противника", () => {
  const enemy = normalizeEnemyTemplate({
    id: "enemy-1",
    name: "  Страж  ",
    typeKey: "humanoid",
    tagKey: "leader",
    level: 99,
    attacks: [{ name: "Пистолет", pool: "5d6", damage: "d6+1" }],
  });

  assert.equal(enemy.name, "Страж");
  assert.equal(enemy.tagKey, "chief");
  assert.equal(enemy.level, 20);
  assert.equal(enemy.attacks.length, 2);
  assert.equal(enemy.attacks[0].pool, 5);
  assert.equal(enemy.attacks[0].technical, true);
});

test("калькулятор отклоняет статблок без названия", () => {
  assert.throws(
    () => normalizeEnemyTemplate({ name: " " }),
    /Укажите название противника/,
  );
});

