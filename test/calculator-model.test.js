import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function classicScript(source) {
  return source
    .replace(/^\s*<script>\s*/, "")
    .replace(/\s*<\/script>\s*$/, "");
}

async function loadCalculatorModel() {
  const [dict, script] = await Promise.all([
    readFile(new URL("../calculator-script-source/Dict.html", import.meta.url), "utf8"),
    readFile(new URL("../calculator-script-source/Script.html", import.meta.url), "utf8"),
  ]);
  const windowStub = { addEventListener() {}, scrollTo() {} };
  const documentStub = { getElementById() { return null; } };
  const localStorageStub = { getItem() { return null; }, setItem() {} };

  return new Function(
    "window",
    "document",
    "localStorage",
    "google",
    `${classicScript(dict)}\n${classicScript(script)}\nreturn {
      efficiencyDetailDistribution,
      eventChance,
      chanceAgainstPlayerDefense,
      protectionThreshold,
      evaluateCombatPower,
      SCENE_PRESETS,
      MODEL_SCENE_DICE
    };`,
  )(windowStub, documentStub, localStorageStub, undefined);
}

test("модель калькулятора использует три Куба сцены редакции 0.5.1", async () => {
  const model = await loadCalculatorModel();

  assert.deepEqual(model.MODEL_SCENE_DICE, [4, 6, 8]);
  assert.deepEqual(model.SCENE_PRESETS.hindrance.dice, [4, 4, 4]);
  assert.deepEqual(model.SCENE_PRESETS.advantage.dice, [8, 8, 8]);

  const distribution = model.efficiencyDetailDistribution(3);
  const probability = [...distribution.values()].reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(probability - 1) < 1e-9);
  assert.ok(model.eventChance(3, "complication") > 0);
  assert.ok(model.eventChance(3, "breakthrough") > 0);
});

test("ПЗ рассчитывается из Сноровки и Смекалки, а высокое ПЗ снижает шанс попадания", async () => {
  const model = await loadCalculatorModel();

  assert.equal(model.protectionThreshold(0, 0), 2);
  assert.equal(model.protectionThreshold(3, 2), 5);
  assert.ok(
    model.chanceAgainstPlayerDefense(4, 2) >
      model.chanceAgainstPlayerDefense(4, 6),
  );
});

test("обновлённая БС растёт вместе с Телом и уроном", async () => {
  const model = await loadCalculatorModel();
  const base = {
    level: 5,
    typeKey: "humanoid",
    tagKey: "chief",
    hp: 20,
    nerve: 5,
    armor: 2,
    pz: 5,
    physicalDefensePool: 4,
    mentalDefensePool: 4,
    speed: 3,
    reactionLimit: 0,
    reactions: [],
    properties: [],
    attacks: [
      { name: "Удар", pool: 4, damage: "d6", category: "Обычная" },
      { name: "Запасной удар", pool: 3, damage: "d4", category: "Обычная" },
    ],
  };
  const stronger = {
    ...base,
    hp: 30,
    attacks: base.attacks.map((attack) => ({ ...attack, damage: "d10" })),
  };

  assert.ok(model.evaluateCombatPower(stronger).bp > model.evaluateCombatPower(base).bp);
});

test("static enemy PZ directly affects combat power", async () => {
  const model = await loadCalculatorModel();
  const base = {
    level: 5,
    typeKey: "humanoid",
    tagKey: "chief",
    hp: 20,
    nerve: 5,
    armor: 2,
    pz: 4,
    physicalDefensePool: 4,
    mentalDefensePool: 4,
    speed: 3,
    reactionLimit: 0,
    reactions: [],
    properties: [],
    attacks: [
      { name: "Attack", pool: 4, damage: "d6", category: "Normal" },
      { name: "Reserve", pool: 3, damage: "d4", category: "Normal" },
    ],
  };

  const lowPz = model.evaluateCombatPower(base);
  const highPz = model.evaluateCombatPower({ ...base, pz: 7 });

  assert.equal(lowPz.defense.pz, 4);
  assert.equal(highPz.defense.pz, 7);
  assert.ok(highPz.bp > lowPz.bp);
});
