import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCharacterResources,
  adminSaveCharacter,
  normalizeCharacterControl,
  normalizeCharacterAttributes,
  normalizeCharacterFolderName,
  normalizeCharacterLevel,
  normalizeCharacterSkills,
  hideCharacter,
  listVisibleCharacters,
  loadCharacter,
  restoreHiddenCharacter,
  saveCharacter,
  saveCharacterState,
  sanitizeState,
} from "../src/characters.js";

test("названия админских папок нормализуются и ограничены", () => {
  assert.equal(normalizeCharacterFolderName("  Плейтест   Керона  "), "Плейтест Керона");
  assert.throws(() => normalizeCharacterFolderName(""), /название папки/i);
  assert.throws(() => normalizeCharacterFolderName("а".repeat(81)), /80 символов/);
});

test("личное скрытие игрока не меняет серверную видимость персонажа", async () => {
  const statements = [];
  const db = {
    prepare(sql) {
      statements.push(sql);
      return {
        bind() { return this; },
        async first() {
          if (sql.includes("FROM characters WHERE id")) {
            return { id: "c1", owner_email: "player@example.com", hidden: 0 };
          }
          return { count: 1 };
        },
        async run() { return { meta: { changes: 1 } }; },
      };
    },
  };

  await hideCharacter(db, { email: "player@example.com", isAdmin: false }, "c1");
  await restoreHiddenCharacter(db, { email: "player@example.com", isAdmin: false }, "c1");

  assert.ok(statements.some((sql) => sql.includes("INSERT INTO character_list_preferences")));
  assert.ok(statements.some((sql) => sql.includes("DELETE FROM character_list_preferences")));
  assert.ok(!statements.some((sql) => /UPDATE characters SET hidden/.test(sql)));
});

test("список разделяет видимых и лично скрытых персонажей", async () => {
  let characterQuery = "";
  const rows = [
    {
      id: "visible", created_at: "a", updated_at: "b", name: "Видимый",
      player: "Игрок", class_name: "Рекрут", level: 1,
      owner_email: "player@example.com", data_json: "{}", personally_hidden: 0,
      folder_id: "campaign", folder_name: "Кампания",
    },
    {
      id: "personal", created_at: "a", updated_at: "b", name: "Лично скрытый",
      player: "Игрок", class_name: "Рекрут", level: 1,
      owner_email: "player@example.com", data_json: "{}", personally_hidden: 1,
    },
  ];
  const db = {
    prepare(sql) {
      if (sql.includes("FROM characters c")) characterQuery = sql;
      return {
        bind() { return this; },
        async first() { return null; },
        async all() {
          return sql.includes("FROM character_folders")
            ? { results: [{ id: "campaign", name: "Кампания" }] }
            : { results: rows };
        },
      };
    },
  };

  const result = await listVisibleCharacters(
    db,
    { email: "admin@example.com", isAdmin: true },
  );
  assert.deepEqual(result.characters.map((item) => item.id), ["visible"]);
  assert.deepEqual(result.hiddenCharacters.map((item) => item.id), ["personal"]);
  assert.equal(result.hiddenCount, 1);
  assert.equal(result.characters[0].folderName, "Кампания");
  assert.deepEqual(result.folders, [{ id: "campaign", name: "Кампания" }]);
  assert.doesNotMatch(characterQuery, /WHERE c\.hidden = 0/);
});

test("дополнительный игрок может открыть персонажа и менять игровое состояние", async () => {
  const statements = [];
  const character = {
    id: "shared-character",
    owner_email: "owner@example.com",
    hidden: 0,
    level: 1,
    data_json: JSON.stringify({
      id: "shared-character",
      name: "Общий герой",
      className: "Рекрут",
      level: 1,
      attributes: {},
      skills: {},
      resources: { body: 8, mainNerve: 2, bonusNerve: 3 },
    }),
  };
  const db = {
    prepare(sql) {
      statements.push(sql);
      return {
        bind() { return this; },
        async first() {
          if (sql.includes("FROM characters WHERE id")) return character;
          if (sql.includes("FROM character_shares")) return { character_id: character.id };
          return null;
        },
        async run() { return { meta: { changes: 1 } }; },
      };
    },
  };
  const user = { email: "friend@example.com", isAdmin: false };

  const loaded = await loadCharacter(db, user, character.id);
  assert.equal(loaded.name, "Общий герой");
  const saved = await saveCharacterState(db, user, character.id, { currentBody: 4 });
  assert.equal(saved.state.currentBody, 4);
  assert.ok(statements.some((sql) => sql.includes("FROM character_shares")));
  assert.ok(statements.some((sql) => sql.includes("INSERT INTO character_states")));
});

test("список игрока включает назначенных ему общих персонажей", async () => {
  let characterQuery = "";
  const db = {
    prepare(sql) {
      if (sql.includes("FROM characters c")) characterQuery = sql;
      return {
        bind() { return this; },
        async first() { return null; },
        async all() { return { results: [] }; },
      };
    },
  };

  await listVisibleCharacters(db, { email: "friend@example.com", isAdmin: false });
  assert.match(characterQuery, /EXISTS[\s\S]*FROM character_shares/);
  assert.match(characterQuery, /cs\.user_email = \?1/);
});

test("Dashboard сохраняет уникальный список дополнительных игроков", async () => {
  const writes = [];
  const db = {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() { return null; },
        async run() {
          writes.push({ sql, values: this.values });
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };

  const result = await adminSaveCharacter(
    db,
    { email: "admin@example.com", isAdmin: true },
    {
      name: "Общий герой",
      className: "Рекрут",
      level: 1,
      ownerEmail: "OWNER@example.com",
      sharedEmails: [
        "FRIEND@example.com",
        "friend@example.com",
        "owner@example.com",
      ],
      isComplete: false,
      data: { attributes: {}, skills: {} },
    },
  );

  assert.equal(result.ownerEmail, "owner@example.com");
  assert.deepEqual(result.sharedEmails, ["friend@example.com"]);
  const shareWrites = writes.filter((write) =>
    write.sql.includes("INSERT INTO character_shares"),
  );
  assert.equal(shareWrites.length, 1);
  assert.equal(shareWrites[0].values[1], "friend@example.com");
});

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

test("Контроль получает по +1 к трём основным Методикам класса", () => {
  const control = normalizeCharacterControl(undefined, "Психопат");

  assert.deepEqual(control.methods.Реагенты, { bonus: 1 });
  assert.deepEqual(control.methods.Порох, { bonus: 1 });
  assert.deepEqual(control.methods.Пар, { bonus: 1 });
  assert.deepEqual(control.methods.Кристаллы, { bonus: 0 });
});

test("фиксированные бонусы Методик нормализуются", () => {
  const control = normalizeCharacterControl(
    {
      methods: {
        Порох: { level: 5, bonus: 7 },
        Пар: { level: 99, bonus: -99 },
      },
    },
    "Рекрут",
  );

  assert.deepEqual(control.methods.Порох, { bonus: 7 });
  assert.deepEqual(control.methods.Пар, { bonus: 1 });
  assert.deepEqual(control.methods.Кристаллы, { bonus: 0 });
});

test("старые Навыки однократно переводятся со шкалы 1–3 на 0–3", () => {
  const migrated = normalizeCharacterSkills({
    skills: {
      napor: { stoikost: 1, sila: 2, ugrozy: 3 },
    },
  });

  assert.equal(migrated.skills.napor.stoikost, 0);
  assert.equal(migrated.skills.napor.draka, 1);
  assert.equal(migrated.skills.gospodstvo.ugrozy, 2);
  assert.equal(migrated.skillRulesVersion, 7);
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
  assert.equal(normalized.skills.napor.draka, 2);
  assert.equal(normalized.skillRulesVersion, 7);
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

  assert.equal(normalized.skillRulesVersion, 7);
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

test("Тело, Нерв и ПЗ рассчитываются по актуальным правилам", () => {
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
    protection: 4,
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

test("сервер сохраняет состояние Прочности и Т снаряжения", () => {
  const state = sanitizeState({
    equipmentConditions: {
      "trost-kristall": { currentDurability: 0 },
      pistol: { currentExploitation: 6 },
      broken: { currentDurability: -10, currentExploitation: 1000 },
    },
  }, {});
  assert.deepEqual(state.equipmentConditions["trost-kristall"], { currentDurability: 0 });
  assert.deepEqual(state.equipmentConditions.pistol, { currentExploitation: 6 });
  assert.deepEqual(state.equipmentConditions.broken, {
    currentDurability: 0,
    currentExploitation: 99,
  });
});

test("сервер сохраняет оставшиеся использования способностей", () => {
  const state = sanitizeState({
    abilityUses: {
      "favorite-one": 2,
      "favorite-empty": -5,
      "favorite-overflow": 1000,
      invalid: "нет",
    },
  }, {});

  assert.deepEqual(state.abilityUses, {
    "favorite-one": 2,
    "favorite-empty": 0,
    "favorite-overflow": 99,
  });
});

test("сервер сохраняет состояние хода персонажа", () => {
  const state = sanitizeState({
    turnTracker: { moved: true, reaction: false, action: true },
  }, {});

  assert.deepEqual(state.turnTracker, {
    moved: true,
    reaction: false,
    action: true,
  });
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
  assert.equal(total, oldTotal);
  assert.equal(normalized.skills.napor.fehtovanie, 1);
  assert.equal(normalized.skills.gospodstvo.ugrozy, 2);
  assert.equal(normalized.skills.nyuh.psihologiya, 1);
  assert.equal(normalized.skills.napor.vyzhivanie, 1);
});

test("навыки редакции 4 переходят в новую компоновку редакции 7", () => {
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
  assert.equal(normalized.skillRulesVersion, 7);
  assert.equal(normalized.skills.napor.fehtovanie, 2);
  assert.equal(normalized.skills.napor.draka, 2);
  assert.equal(normalized.skills.gospodstvo.obman, 2);
  assert.equal(normalized.skills.nyuh.strelba, 2);
  assert.equal(normalized.skills.gospodstvo.disciplina, 2);
  assert.equal(normalized.skills.smetka.erudiciya, 2);
  assert.equal(normalized.skills.napor.sila, 0);
  assert.equal(normalized.skills.snorovka.koordinatsiya, 1);
});

test("навыки редакции 6 переносят Обман и объединяют Сцену с Этикетом в Публику", () => {
  const normalized = normalizeCharacterSkills({
    skillRulesVersion: 6,
    skills: {
      snorovka: { obman: 2, koordinatsiya: 1 },
      gospodstvo: { scena: 1, etiket: 1, disciplina: 2 },
    },
  });

  assert.equal(normalized.skillRulesVersion, 7);
  assert.equal(normalized.skills.gospodstvo.obman, 2);
  assert.equal(normalized.skills.gospodstvo.publika, 2);
  assert.equal(normalized.skills.gospodstvo.disciplina, 2);
  assert.equal(normalized.skills.snorovka.vzlom, 0);
  assert.equal(normalized.skills.snorovka.obman, undefined);
});

test("сервер проверяет 20 очков, минимум 4 Второстепенных и лимит 5 Основных", async () => {
  const db = {
    prepare() {
      return {
        bind() { return this; },
        async first() { return null; },
        async run() { return { meta: { changes: 1 } }; },
      };
    },
  };
  const base = {
    name: "Тест",
    level: 1,
    skillRulesVersion: 7,
    attributes: {},
    skills: {
      napor: { fehtovanie: 2, draka: 2, metanie: 1, sila: 2 },
      snorovka: { uklonenie: 2, skrytnost: 2, lovkostRuk: 1, koordinatsiya: 2 },
      nyuh: { vnimatelnost: 2, strelba: 2 },
      smetka: { erudiciya: 2 },
    },
  };
  const result = await saveCharacter(db, { email: "player@example.com", isAdmin: false }, base);
  assert.equal(result.isComplete, true);

  await assert.rejects(
    saveCharacter(db, { email: "player@example.com", isAdmin: false }, {
      ...base,
      skills: {
        napor: { fehtovanie: 2, draka: 2, metanie: 1 },
        snorovka: { uklonenie: 2, skrytnost: 2, lovkostRuk: 1 },
        nyuh: { vnimatelnost: 2, strelba: 2, priroda: 1 },
        smetka: { mehanizmy: 2, himiya: 2, medicina: 1 },
      },
    }),
    /Второстепенные/i,
  );
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
