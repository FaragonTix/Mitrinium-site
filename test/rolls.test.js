import assert from "node:assert/strict";
import test from "node:test";
import { __test } from "../src/rolls.js";

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

test("оптимальная замена на 4 применяется только при росте ЭФ", () => {
  const dice = [
    { sides: 6, value: 5, source: "Сцена" },
    { sides: 6, value: 5, source: "Навык" },
    { sides: 6, value: 6, source: "Атрибут" },
    { sides: 6, value: 6, source: "Атрибут" },
  ];
  const original = __test.evaluate(dice);
  const changed = __test.chooseOptimalFour(dice);

  assert.ok(changed.replacement);
  assert.ok(changed.evaluation.ef > original.ef);
  assert.equal(changed.replacement.to, 4);
});

test("шкала результата Эффективности сохранена", () => {
  assert.equal(__test.outcome(3), "Неудача");
  assert.equal(__test.outcome(4), "Элементарно");
  assert.equal(__test.outcome(6), "Обычный успех");
  assert.equal(__test.outcome(8), "Сильный успех");
  assert.equal(__test.outcome(9), "Почти невозможное сделано");
});
