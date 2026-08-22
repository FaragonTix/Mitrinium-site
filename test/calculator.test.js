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

test("калькулятор сохраняет tactical pregen metadata и явную primary semantics", () => {
  const enemy = normalizeEnemyTemplate({
    name: "Тактический враг", typeKey: "humanoid", tacticalPregenId: "brute_club_guard",
    tacticalRole: "brute", tacticalTier: "chief", chassis: "humanoid",
    tacticalIdentity: "держать ближний бой", preferredRange: "ближняя",
    attacks: [
      { name: "Натиск", pool: 5, damage: "d8", tacticalKind: "primary", tags: ["melee"], provides: ["heavy_melee"] },
      { name: "Толчок", pool: 5, damage: "d6", tacticalKind: "secondary", tags: ["control"] },
    ],
    primary: { name: "Натиск", provides: ["heavy_melee"] },
    secondary: { name: "Толчок" }, reaction: { name: "Не отпустить", trigger: "цель уходит" },
    special: { name: "Продавить", uses: 1 },
    tactics: { opener: "сблизиться", loop: "primary → reaction", weakness: "дистанция" },
    semanticContract: { must_provide: ["heavy_melee"], reaction_requires: ["melee_attack"], primary_attack_semantics: "explicit" },
  });
  assert.equal(enemy.tacticalPregenId, "brute_club_guard");
  assert.equal(enemy.tacticalRole, "brute");
  assert.equal(enemy.tacticalTier, "chief");
  assert.equal(enemy.attacks[0].tacticalKind, "primary");
  assert.deepEqual(enemy.attacks[0].provides, ["heavy_melee"]);
  assert.equal(enemy.semanticContract.primary_attack_semantics, "explicit");
});
