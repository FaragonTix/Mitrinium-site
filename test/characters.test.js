import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCharacterResources,
  normalizeCharacterControl,
  normalizeCharacterAttributes,
  normalizeCharacterLevel,
  normalizeCharacterSkills,
  saveCharacter,
  sanitizeState,
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

test("старые Навыки однократно переводятся со шкалы 1–3 на 0–3", () => {
  const migrated = normalizeCharacterSkills({
    skills: {
      napor: { stoikost: 1, sila: 2, ugrozy: 3 },
    },
  });

  assert.equal(migrated.skills.napor.stoikost, 0);
  assert.equal(migrated.skills.snorovka.draka, 1);
  assert.equal(migrated.skills.gospodstvo.ugrozy, 2);
  assert.equal(migrated.skillRulesVersion, 5);
  assert.deepEqual(
    normalizeCharacterSkills(migrated).skills,
    migrated.skills,
  );
});

test("персонаж новой редакции без маркера распознаётся по нулевым Навыкам", () => {
  const normalized = normalizeCharacterSkills({
    skills: {
      napor: { stoikost: 0, sila: 2 },
    },
  });

  assert.equal(normalized.skills.napor.stoikost, 0);
  assert.equal(normalized.skills.snorovka.draka, 2);
  assert.equal(normalized.skillRulesVersion, 5);
});

test("ошибочно помеченный формат v2 также восстанавливается", () => {
  const normalized = normalizeCharacterSkills({
    skillRulesVersion: 2,
    advancedEditMode: false,
    skills: {
      drive: { a: 1, b: 2, c: 1, d: 1, e: 1 },
      wit: { a: 1, b: 2, c: 1, d: 1, e: 1 },
      flair: { a: 1, b: 2, c: 1, d: 1, e: 1 },
      grit: { a: 1, b: 2, c: 1, d: 1, e: 1 },
      gloss: { a: 1, b: 2, c: 1, d: 1, e: 1 },
    },
  });

  assert.equal(normalized.skillRulesVersion, 5);
});

test("старая компоновка Атрибутов мигрирует в редакцию 0.4.9", () => {
  const normalized = normalizeCharacterAttributes({
    attributes: { napor: 2, smetka: 3, nyuh: 1, zhila: 2, losk: 3 },
  });
  assert.deepEqual(normalized.attributes, {
    napor: 2,
    snorovka: 3,
    nyuh: 1,
    smetka: 2,
    gospodstvo: 3,
  });
  assert.equal(normalized.attributeRulesVersion, 2);
});

test("Тело и Нерв рассчитываются по правилам 0.4.9", () => {
  assert.deepEqual(calculateCharacterResources({
    napor: 2,
    snorovka: 3,
    nyuh: 2,
    smetka: 1,
    gospodstvo: 3,
  }), {
    body: 14,
    mainNerve: 5,
    bonusNerve: 3,
  });
});

test("сервер сохраняет нулевые текущие показатели как осознанное состояние", () => {
  const state = sanitizeState({
    currentBody: 0,
    currentMainNerve: 0,
    currentBonusNerve: 0,
    currentArmor: 0,
    maxArmor: 0,
    money: { gold: 0, farthings: 0, pekkels: 0 },
  }, { body: 12, mainNerve: 5, bonusNerve: 3 });
  assert.equal(state.currentBody, 0);
  assert.equal(state.currentMainNerve, 0);
  assert.equal(state.initialized, true);
});

test("старые Навыки переносятся в новые группы без потери очков", () => {
  const legacySkills = {
    napor: { ugrozy: 2, draka: 1, stoikost: 1, liderstvo: 2, sila: 1 },
    smetka: { obman: 1, skrytnost: 2, mehanizmy: 1, lovkostRuk: 0, uklonenie: 1 },
    nyuh: { priroda: 0, vnimatelnost: 2, strelba: 2, zakon: 1, znanieUlits: 1 },
    zhila: { ekonomika: 1, himiya: 2, atletika: 1, disciplina: 2, medicina: 1 },
    losk: { vnushenie: 1, ubezhdenie: 2, psiho: 1, scena: 1, etiket: 1 },
  };
  const normalized = normalizeCharacterSkills({
    skillRulesVersion: 3,
    skills: legacySkills,
  });
  const oldTotal = Object.values(legacySkills).flatMap(Object.values).reduce((sum, value) => sum + value, 0);
  const total = Object.values(normalized.skills).flatMap(Object.values).reduce((sum, value) => sum + value, 0);
  assert.equal(total, oldTotal - legacySkills.losk.etiket);
  assert.equal(normalized.skills.napor.fehtovanie, 1);
  assert.equal(normalized.skills.gospodstvo.ugrozy, 2);
  assert.equal(normalized.skills.nyuh.psihologiya, 1);
  assert.equal(normalized.skills.napor.vyzhivanie, 1);
});

test("навыки редакции 4 переходят в новую компоновку редакции 5", () => {
  const normalized = normalizeCharacterSkills({
    skillRulesVersion: 4,
    skills: {
      napor: { stoikost: 1, draka: 2, atletika: 1, disciplina: 2, vyzhivanie: 1 },
      snorovka: { fehtovanie: 2, skrytnost: 1, lovkostRuk: 0, uklonenie: 1, strelba: 2 },
      nyuh: { priroda: 1, vnimatelnost: 2, znanieUlits: 1, psihologiya: 1, etiket: 2 },
      smetka: { mehanizmy: 1, zakon: 1, ekonomika: 2, himiya: 1, medicina: 1 },
      gospodstvo: { ugrozy: 1, obman: 2, komandovanie: 1, ubezhdenie: 1, scena: 1 },
    },
  });
  assert.equal(normalized.skillRulesVersion, 5);
  assert.equal(normalized.skills.napor.fehtovanie, 2);
  assert.equal(normalized.skills.snorovka.draka, 2);
  assert.equal(normalized.skills.snorovka.obman, 2);
  assert.equal(normalized.skills.nyuh.strelba, 2);
  assert.equal(normalized.skills.gospodstvo.disciplina, 2);
  assert.equal(normalized.skills.smetka.erudiciya, 2);
  assert.equal(normalized.skills.napor.sila, 0);
});

test("незаконченный персонаж сохраняется как черновик", async () => {
  let writes = 0;
  const db = {
    prepare(sql) {
      return {
        bind() { return this; },
        async first() { return null; },
        async run() { writes += 1; return { meta: { changes: 1 } }; },
      };
    },
  };
  const result = await saveCharacter(db, { email: "player@example.com", isAdmin: false }, {
    name: "",
    level: 1,
    className: "",
    isComplete: false,
    attributes: {},
    skills: {},
  });
  assert.equal(result.isComplete, false);
  assert.equal(writes, 1);
});
