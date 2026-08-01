import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCharacterControl,
  normalizeCharacterLevel,
} from "../src/characters.js";

test("старый персонаж без уровня получает первый уровень", () => {
  assert.equal(normalizeCharacterLevel(undefined), 1);
  assert.equal(normalizeCharacterLevel(""), 1);
});

test("уровень персонажа принимается только в диапазоне 1–20", () => {
  assert.equal(normalizeCharacterLevel(1), 1);
  assert.equal(normalizeCharacterLevel("12"), 12);
  assert.equal(normalizeCharacterLevel(20), 20);
  assert.throws(() => normalizeCharacterLevel(0), /от 1 до 20/);
  assert.throws(() => normalizeCharacterLevel(21), /от 1 до 20/);
  assert.throws(() => normalizeCharacterLevel(1.5), /целым числом/);
});

test("Контроль получает актуальные классовые бонусы и первый уровень", () => {
  const control = normalizeCharacterControl(undefined, "Психопат");

  assert.deepEqual(control.methods.Реагенты, { level: 1, bonus: 3 });
  assert.deepEqual(control.methods.Порох, { level: 1, bonus: 2 });
  assert.deepEqual(control.methods.Пар, { level: 1, bonus: 0 });
  assert.deepEqual(control.methods.Кристаллы, { level: 1, bonus: 0 });
});

test("уровни и бонусы Методик нормализуются", () => {
  const control = normalizeCharacterControl(
    {
      methods: {
        Порох: { level: 5, bonus: 7 },
        Пар: { level: 99, bonus: -99 },
      },
    },
    "Рекрут",
  );

  assert.deepEqual(control.methods.Порох, { level: 5, bonus: 7 });
  assert.deepEqual(control.methods.Пар, { level: 5, bonus: -20 });
  assert.deepEqual(control.methods.Кристаллы, { level: 1, bonus: 0 });
});
