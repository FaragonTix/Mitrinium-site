import assert from "node:assert/strict";
import test from "node:test";
import {
  __test,
  appendExternalRoll,
  applyBiographyBonus,
  rerollEfficiencyDie,
  rollEfficiency,
} from "../src/rolls.js";

const testDb = {
  prepare() {
    return {
      bind() {
        return this;
      },
      async run() {},
    };
  },
};

const testUser = { email: "player@example.com" };

test("сцена всегда добавляет три куба новой геометрии", async () => {
  const cases = {
    hindrance: [4, 4, 4],
    normal: [4, 4, 6],
    advantage: [6, 6, 6],
  };

  for (const [sceneKey, expectedSides] of Object.entries(cases)) {
    const result = await rollEfficiency(testDb, testUser, {
      sceneKey,
      firstComponent: { key: "attribute:drive", label: "Напор", value: 1 },
      secondComponent: { key: "skill:threats", label: "Угрозы", value: 0 },
      difficulty: 6,
    });

    assert.deepEqual(
      result.dice.slice(0, 3).map((die) => die.sides),
      expectedSides,
    );
    assert.equal(result.dice.length, 4);
    assert.equal(result.difficulty, 6);
  }
});

test("калькулятор может добавить бросок противника в общий лог", async () => {
  let writes = 0;
  const db = {
    prepare() {
      return {
        bind() { return this; },
        async run() { writes += 1; },
      };
    },
  };
  const result = await appendExternalRoll(db, testUser, {
    type: "efficiency",
    characterName: "Часовой",
    title: "Атака мушкетом",
    ef: 7,
    finalResult: 7,
    breakthrough: true,
    dice: [
      { sides: 4, value: 3, source: "Куб сцены 1" },
      { sides: 4, value: 3, source: "Куб сцены 2" },
      { sides: 6, value: 4, source: "Куб сцены 3" },
      { sides: 6, value: 6, source: "Пул противника 1" },
    ],
  });
  assert.equal(result.success, true);
  assert.equal(writes, 1);
});

test("Эффективность — сумма двух лучших минус сумма двух худших", () => {
  const result = __test.evaluate([
    { sides: 4, value: 2 },
    { sides: 6, value: 5 },
    { sides: 6, value: 6 },
    { sides: 6, value: 1 },
  ]);

  assert.equal(result.ef, 8);
  assert.deepEqual(result.topValues, [5, 6]);
  assert.deepEqual(result.bottomValues, [1, 2]);
});

test("биографическая черта добавляет ровно +1 ЭФ", async () => {
  const previous = {
    id: "roll-1",
    type: "efficiency",
    title: "Проверка",
    characterName: "Герой",
    components: [
      { key: "a", label: "Напор", value: 1 },
      { key: "s", label: "Угрозы", value: 1 },
    ],
    dice: [
      { sides: 4, value: 2, source: "Куб сцены 1" },
      { sides: 6, value: 3, source: "Куб сцены 2" },
      { sides: 6, value: 4, source: "Куб сцены 3" },
      { sides: 6, value: 5, source: "Напор" },
      { sides: 6, value: 6, source: "Угрозы" },
    ],
  };

  const result = await applyBiographyBonus(testDb, testUser, previous);

  assert.equal(result.biographyBonus, 1);
  assert.equal(result.finalEf, result.baseEf + 1);
  await assert.rejects(
    applyBiographyBonus(testDb, testUser, result),
    /уже применена/,
  );
});

test("Нерв перебрасывает только выбранный куб", async () => {
  const previous = {
    id: "roll-2",
    type: "efficiency",
    title: "Проверка",
    characterName: "Герой",
    components: [
      { key: "a", label: "Напор", value: 1 },
      { key: "s", label: "Угрозы", value: 1 },
    ],
    dice: [
      { sides: 4, value: 2, source: "Куб сцены 1" },
      { sides: 6, value: 3, source: "Куб сцены 2" },
      { sides: 6, value: 4, source: "Куб сцены 3" },
      { sides: 6, value: 5, source: "Напор" },
      { sides: 6, value: 6, source: "Угрозы" },
    ],
    controlRequest: { enabled: false },
  };

  const result = await rerollEfficiencyDie(testDb, testUser, previous, 1);

  assert.equal(result.dice[0].value, previous.dice[0].value);
  assert.equal(result.dice[2].value, previous.dice[2].value);
  assert.equal(result.dice[3].value, previous.dice[3].value);
  assert.equal(result.dice[4].value, previous.dice[4].value);
  assert.equal(result.dice[1].rerolledFrom, previous.dice[1].value);
  assert.equal(result.nerveRerolls.length, 1);
});

test("шкала результата Эффективности сохранена", () => {
  assert.equal(__test.outcome(3), "Ниже элементарной сложности");
  assert.equal(__test.outcome(4), "Элементарная");
  assert.equal(__test.outcome(6), "Квалифицированная");
  assert.equal(__test.outcome(8), "Сложная профессиональная");
  assert.equal(__test.outcome(10), "Исключительная");
});

test("Осложнение даёт дубль с третьим Кубом сцены на единицу ниже", () => {
  const complication = __test.evaluate([
    { sides: 4, value: 3, source: "Куб сцены 1" },
    { sides: 6, value: 3, source: "Куб сцены 2" },
    { sides: 6, value: 2, source: "Куб сцены 3" },
    { sides: 6, value: 1, source: "Навык" },
    { sides: 6, value: 6, source: "Атрибут" },
  ]);
  const componentDuplicateOnly = __test.evaluate([
    { sides: 4, value: 2, source: "Куб сцены 1" },
    { sides: 6, value: 3, source: "Куб сцены 2" },
    { sides: 6, value: 4, source: "Куб сцены 3" },
    { sides: 6, value: 3, source: "Навык" },
    { sides: 6, value: 3, source: "Атрибут" },
  ]);

  assert.equal(complication.complication, "Осложнение");
  assert.equal(complication.sceneTrigger, 3);
  assert.equal(complication.sceneThirdValue, 2);
  assert.equal(componentDuplicateOnly.complication, "Нет");
});

test("Прорыв даёт дубль с третьим Кубом сцены на единицу выше и успешная проверка", () => {
  const potential = __test.evaluate([
    { sides: 4, value: 3, source: "Куб сцены 1" },
    { sides: 6, value: 3, source: "Куб сцены 2" },
    { sides: 6, value: 4, source: "Куб сцены 3" },
    { sides: 6, value: 6, source: "Навык" },
    { sides: 6, value: 1, source: "Атрибут" },
  ]);
  const triple = __test.evaluate([
    { sides: 4, value: 3, source: "Куб сцены 1" },
    { sides: 6, value: 3, source: "Куб сцены 2" },
    { sides: 6, value: 3, source: "Куб сцены 3" },
    { sides: 6, value: 6, source: "Навык" },
  ]);

  assert.equal(potential.potentialBreakthrough, true);
  assert.equal(__test.resolveBreakthrough(potential, 7, 6), "Прорыв");
  assert.equal(__test.resolveBreakthrough(potential, 5, 6), "Нет");
  assert.equal(triple.potentialBreakthrough, false);
});

test("опция Контроля срабатывает только при Осложнении", () => {
  assert.equal(
    __test.shouldRollControl(
      { enabled: true },
      { complication: "Осложнение" },
    ),
    true,
  );
  assert.equal(
    __test.shouldRollControl({ enabled: true }, { complication: "Нет" }),
    false,
  );
  assert.equal(
    __test.shouldRollControl(
      { enabled: false },
      { complication: "Осложнение" },
    ),
    false,
  );
});
