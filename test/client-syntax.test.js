import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readClassicScript(path) {
  const html = await readFile(new URL(path, import.meta.url), "utf8");
  return html
    .replace(/^\s*<script>\s*/, "")
    .replace(/\s*<\/script>\s*$/, "");
}

test("клиентские скрипты редактора синтаксически корректны", async () => {
  const scripts = await Promise.all([
    readClassicScript("../apps-script-source/AbilitiesData.html"),
    readClassicScript("../apps-script-source/EquipmentData.html"),
    readClassicScript("../apps-script-source/ScriptsEquipment.html"),
    readClassicScript("../apps-script-source/ScriptsCore.html"),
    readClassicScript("../apps-script-source/ScriptsCharacter.html"),
    readClassicScript("../apps-script-source/ExtendedNameLibraryData.html"),
    readClassicScript("../apps-script-source/NameGeneratorData.html"),
    readClassicScript("../apps-script-source/ScriptsNameGenerator.html"),
    readClassicScript("../apps-script-source/ScriptsAbilities.html"),
    readClassicScript("../apps-script-source/ScriptsStorage.html"),
    readClassicScript("../apps-script-source/ViewerScripts.html"),
    readClassicScript("../apps-script-source/CharacterPdfScripts.html"),
    readClassicScript("../apps-script-source/RollsScripts.html"),
    readClassicScript("../apps-script-source/RulesReferenceScripts.html"),
  ]);

  for (const source of scripts) {
    assert.doesNotThrow(() => new Function(source));
  }
});

test("памятка содержит актуальные правила 0.5.6 и доступна отдельным режимом", async () => {
  const [index, core, view, styles] = await Promise.all([
    readFile(new URL("../apps-script-source/Index.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/ScriptsCore.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/RulesReferenceView.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/RulesReferenceStyles.html", import.meta.url), "utf8"),
  ]);

  assert.match(index, /id="referenceModeButton"/);
  assert.match(core, /'reference'/);
  assert.match(view, /редакция 0\.5\.6/);
  assert.match(view, /d4 \+ d6 \+ d8/);
  assert.match(view, /ПЗ цели \+ текущая Т оружия/);
  assert.match(view, /Короткий отдых[\s\S]*?d6 Тела/);
  assert.match(view, /базовая Т 3 → максимум Т 6/);
  assert.match(view, /Нормальная 0 ЭФ → Пониженная −2 ЭФ → Недостаточная −5 ЭФ/);
  assert.match(view, /Пороховое оружие[\s\S]*?40–100 ф/);
  assert.match(view, /Броня 4 \/ 5[\s\S]*?140 \/ 300 ф/);
  assert.doesNotMatch(view, /<details[^>]*\sopen(?:\s|>)/);
  const restIndex = view.indexOf("<h2>Отдых и починка</h2>");
  const extendedIndex = view.indexOf("<h2>Протяжённые действия</h2>");
  const maintenanceIndex = view.indexOf("<h2>Обслуживание снаряжения</h2>");
  assert.ok(restIndex >= 0 && extendedIndex > restIndex && maintenanceIndex > extendedIndex);
  assert.match(view, /<details class="reference-card wide accent-green reference-section-spoiler"[\s\S]*?<h2>Обслуживание снаряжения<\/h2>/);
  assert.match(styles, /\.reference-topic-nav/);
  assert.match(styles, /\.reference-split\s*\{\s*align-items:\s*start;\s*\}/);
  assert.match(view, /id="referenceAbilitySearch"/);
  assert.match(view, /id="referenceAbilityClass"/);
  assert.match(view, /id="referenceAbilityCategory"/);
  assert.match(view, /data-reference-topic="abilities"/);
  assert.match(styles, /\.reference-ability-grid/);
});

test("главная страница содержит ссылки на правила и книгу сеттинга", async () => {
  const landing = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(landing, /1u-42AfJ8D4FAS9f41KpYCBMHo95bQSdS/);
  assert.match(landing, /1Z-Zor0VfLCpU9fWEM2iIslm3RXvRwj8K/);
  assert.match(landing, />\s*Книга сеттинга\s*</);
});

test("администратор получает ссылку на калькулятор, а окно бросков объясняет биографическую черту", async () => {
  const [builder, authClient, rollsView] = await Promise.all([
    readFile(new URL("../scripts/build-editor.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/client/google-script-run.js", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/RollsView.html", import.meta.url), "utf8"),
  ]);

  assert.match(builder, /id="calculatorAdminButton"[\s\S]*?location\.href='\/calculator\/'[\s\S]*?hidden/);
  assert.match(authClient, /payload\?\.user\?\.isAdmin[\s\S]*?\["dashboardButton", "calculatorAdminButton"\]/);
  assert.match(rollsView, /Один раз за игровую встречу после броска[\s\S]*?повысить ЭФ на 1/);
  assert.match(rollsView, /применимость определяет ведущий/);
});

test("черновики блокируют просмотр и могут быть сохранены явно", async () => {
  const [index, core, storage, pdf] = await Promise.all([
    readFile(new URL("../apps-script-source/Index.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/ScriptsCore.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/ScriptsStorage.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/CharacterPdfScripts.html", import.meta.url), "utf8"),
  ]);
  assert.match(index, /Этот персонаж не закончен/);
  assert.match(index, /Всё равно сохранить/);
  assert.match(core, /const requiresSavedCharacter = mode === 'view' && !currentCharacterId/);
  assert.match(core, /setCharacterCompletionStatus\(validateCharacterOnClient\(collectCharacterForSave\(\)\)\.length === 0\)/);
  assert.match(storage, /character\.isComplete = errors\.length === 0/);
  assert.match(pdf, /createPdf\(buildCharacterPdfDefinition\(character\)\)\.download/);
});

test("новое состояние просмотра начинается с максимумов и оставшихся денег", async () => {
  const viewerSource = await readClassicScript("../apps-script-source/ViewerScripts.html");
  const api = new Function(
    "getSelectedArmorTotal",
    "startingMoney",
    "getEquipmentById",
    "getAbilityById",
    `${viewerSource}; return { normalizeViewerState };`,
  )(() => 4, 1000, (id) => ({
    crystal: { id: "crystal", durability: 2 },
    pistol: { id: "pistol", exploitation: 3 },
  })[id], (id) => ({
    favorite: { id: "favorite", category: "favorite", charges: 3 },
    common: { id: "common", category: "common" },
  })[id]);
  const resources = { body: 12, mainNerve: 5, bonusNerve: 3 };

  const initial = api.normalizeViewerState({
    resources,
    equipmentSpent: 300,
    state: { initialized: false, currentBody: 0, maxArmor: 0, money: { farthings: 0 } },
  });
  assert.equal(initial.currentBody, 12);
  assert.equal(initial.currentMainNerve, 5);
  assert.equal(initial.currentBonusNerve, 3);
  assert.equal(initial.currentArmor, 4);
  assert.equal(initial.maxArmor, 4);
  assert.equal(initial.money.farthings, 700);

  const saved = api.normalizeViewerState({
    resources,
    state: {
      initialized: true,
      currentBody: 0,
      currentMainNerve: 0,
      currentBonusNerve: 0,
      currentArmor: 0,
      maxArmor: 0,
      money: { gold: 0, farthings: 0, pekkels: 0 },
    },
  });
  assert.equal(saved.currentBody, 0);
  assert.equal(saved.currentMainNerve, 0);
  assert.equal(saved.money.farthings, 0);

  const equipmentState = api.normalizeViewerState({
    resources,
    equipment: ["crystal", "pistol"],
    state: {
      initialized: true,
      equipmentConditions: {
        crystal: { currentDurability: -1 },
        pistol: { currentExploitation: 99 },
      },
    },
  });
  assert.deepEqual(equipmentState.equipmentConditions, {
    crystal: { currentDurability: 0 },
    pistol: { currentExploitation: 6 },
  });

  const abilityState = api.normalizeViewerState({
    resources,
    abilities: ["favorite", "common"],
    state: { initialized: true, abilityUses: { favorite: 99, common: 1 } },
  });
  assert.deepEqual(abilityState.abilityUses, { favorite: 3 });
});

test("просмотр начинает с имени и состояния, показывает атрибуты в навыках, а концепт оставляет внизу", async () => {
  const viewer = await readFile(
    new URL("../apps-script-source/ViewerScripts.html", import.meta.url),
    "utf8",
  );
  const hero = viewer.indexOf('<section class="viewer-hero">');
  const state = viewer.indexOf("<h3>Состояние</h3>", hero);
  const skills = viewer.indexOf("<h3>Навыки</h3>", state);
  const control = viewer.indexOf("<h3>Контроль</h3>", skills);
  const concept = viewer.indexOf("<h3>Концепт</h3>", control);
  const biography = viewer.indexOf("<h3>Биографические черты</h3>", control);
  const notes = viewer.indexOf("<h3>Заметки</h3>", biography);
  assert.ok(hero >= 0 && state > hero && skills > state);
  assert.ok(control > skills && biography > control);
  assert.ok(concept > notes);
  assert.equal(viewer.indexOf("<h3>Атрибуты</h3>", state), -1);
});

test("личная видимость, общий доступ и админские папки разделены в интерфейсе", async () => {
  const [storage, admin, adminView, migration, sharingMigration] = await Promise.all([
    readFile(new URL("../apps-script-source/ScriptsStorage.html", import.meta.url), "utf8"),
    readFile(new URL("../src/client/admin/admin.js", import.meta.url), "utf8"),
    readFile(new URL("../src/client/admin/index.html", import.meta.url), "utf8"),
    readFile(new URL("../migrations/0007_character_visibility_folders.sql", import.meta.url), "utf8"),
    readFile(new URL("../migrations/0008_character_shares.sql", import.meta.url), "utf8"),
  ]);
  assert.doesNotThrow(() => new Function(admin));
  assert.match(storage, /hiddenSavedCharactersCache/);
  assert.match(storage, /savedCharacterFoldersCache/);
  assert.match(storage, /organizeSavedCharactersIntoFolders/);
  assert.doesNotMatch(storage, /Скрыть персонажа только из вашего личного списка/);
  assert.match(storage, /mitriniumRestoreHiddenCharacter/);
  assert.match(storage, /Скрыто в моём списке/);
  assert.match(storage, /character\.canDelete !== false/);
  assert.doesNotMatch(storage, /if \(\s*!savedCharactersListIsAdmin\s*\) \{\s*return;\s*\}/);
  assert.match(adminView, /Папки персонажей/);
  assert.match(adminView, /Скрыть персонажа от всех игроков/);
  assert.match(admin, /adminSetCharacterFolder/);
  assert.match(admin, /adminCreateCharacterFolder/);
  assert.match(admin, /Скрыть от игрока/);
  assert.match(adminView, /id="sharedEmails"/);
  assert.match(admin, /sharedEmails/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS character_list_preferences/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS character_folders/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS character_folder_assignments/);
  assert.match(sharingMigration, /CREATE TABLE IF NOT EXISTS character_shares/);
});

test("PDF содержит биографические черты, заголовки Атрибутов и полное название", async () => {
  const pdfSource = await readClassicScript("../apps-script-source/CharacterPdfScripts.html");
  assert.match(pdfSource, /pdfBiographyContent/);
  assert.match(pdfSource, /card\.traits/);
  assert.match(pdfSource, /pdfSkillGroupColumns/);
  assert.match(pdfSource, /group\.attributeName/);
  assert.match(pdfSource, /dontBreakRows: true/);
  assert.match(pdfSource, /unbreakable: true/);
  assert.match(pdfSource, /pdfUnbreakableSection\('Навыки'/);
  assert.match(pdfSource, /text: 'Mitrinium'/);
  assert.doesNotMatch(pdfSource, /text: 'M'/);
  assert.doesNotMatch(pdfSource, /'ур\. ' \+ entry\[1\]\.level/);
});

test("каталог способностей соответствует редакции 0.5.8", async () => {
  const abilitySource = await readClassicScript(
    "../apps-script-source/AbilitiesData.html",
  );
  const abilities = new Function(`${abilitySource}; return abilityData;`)();
  const abilityRenderer = await readFile(
    new URL("../apps-script-source/ScriptsAbilities.html", import.meta.url),
    "utf8",
  );

  assert.equal(abilities.length, 126);
  assert.equal(new Set(abilities.map((ability) => ability.id)).size, abilities.length);
  const expectedCounts = { ultimate: 6, favorite: 6, common: 5, situational: 4 };
  for (const className of ["Психопат", "Кустарь", "Воротила", "Рекрут", "Менталист", "Натуралист"]) {
    for (const [category, count] of Object.entries(expectedCounts)) {
      assert.equal(abilities.filter((ability) => ability.className === className && ability.category === category).length, count);
    }
  }
  assert.ok(abilities.every((ability) => ability.prerequisite));
  assert.doesNotMatch(abilityRenderer, /ability\.tags/);

  const byName = Object.fromEntries(
    abilities.map((ability) => [ability.name, ability]),
  );
  assert.equal(
    byName["Механический перехват"].effect,
    "Реакция после броска. Ассистент теряет d4 прочности, чтобы полностью поглотить прямой физический урон по любому персонажу. Не распространяется на урон по площади, урон от падения или любой вид перенаправленного урона. Способность доступна до уничтожения ассистента.",
  );
  assert.equal(
    byName["Нет, подожди"].effect,
    "Действие. В случае победы Воротилы, цель не может заявлять уклонение и использовать реакции в следующих 2 раундах.",
  );
  assert.equal(
    byName["Двухзарядный мушкет"].effect,
    "Реакция после атаки крупнокалиберным оружием, совершённой Действием. Рекрут может сделать второй выстрел следом в этот же ход. Второй выстрел получает Помеху и наносит d6 урона. Не может использоваться больше одного раза за раунд.",
  );
  assert.equal(byName["Жучок"].prerequisite, "предмет с тегом КК.");
  assert.equal(byName["Резкая ингаляция"].pool, "Нюх + Стрельба");
  assert.equal(byName["Кислотный плевок"].pool, "Напор+Драка или Нюх+Стрельба");
  assert.equal(byName["Кислотные ампулы"].pool, "Смекалка + Химия");
  assert.equal(byName["Токсичный распылитель"].pool, "Смекалка + Стрельба против Напор + Стойкость");
  assert.equal(byName["Готовое дело"].prerequisite, "Предмет с тегом Канцелярия или КК");
  assert.equal(byName["Бумага уже есть"].pool, "Господство + Обман или Смекалка + Закон");
  assert.equal(byName["Встречный захват"].pool, "Воротила — Господство + Обман; цель — Нюх + Внимательность");
  assert.equal(byName["Мастерство преображения"].pool, "Господство + Публика");
  assert.equal(
    byName["Липкий пол"].effect,
    "Действие. Метни ёмкость с липким составом в один видимый незанятый гекс на Средней дистанции. При успехе гекс до конца сцены становится липким и считается труднопроходимым. Существо, входящее в гекс или выходящее из него, делает проверку Сноровка + Координация или Напор + Сила против сл. 7. При провале его движение заканчивается, а существо не может перемещаться до начала своего следующего хода.",
  );
  assert.equal(byName["Липкий пол"].complications, "В случае провала Контроля, способность не срабатывает.");
  assert.equal(byName["Тяжёлый замах"].charges, 2);
  assert.equal(byName["Выстрел и перекат"].reaction, "после");
  assert.equal(byName["Две обезьяны"].breakthrough, "Наложи Глухоту и Немоту одновременно.");
  assert.equal(byName["Полевые дротики"].prerequisite, "Дротиковая трубка.");
  assert.equal(byName["Пиротехнический сигнал"].category, "situational");
  assert.equal(byName["Манипулятор поля"].category, "situational");
  assert.equal(byName["Набор печатей"].category, "situational");
  assert.equal(byName["Спрятанные клинки"].category, "situational");
  assert.equal(byName["Резонатор"].category, "situational");
  assert.equal(byName["Жучок"].category, "situational");
  for (const name of ["Монтажная пена", "Третья рука", "Без следов", "Прыгун", "Должно быть, ветер", "Оценка"]) {
    assert.equal(byName[name].category, "situational");
  }
});

test("справочник памятки ищет способности всех классов и фильтрует категории", async () => {
  const [abilitySource, referenceSource] = await Promise.all([
    readClassicScript("../apps-script-source/AbilitiesData.html"),
    readClassicScript("../apps-script-source/RulesReferenceScripts.html"),
  ]);
  const nodes = {
    referenceAbilityResults: { innerHTML: "" },
    referenceAbilityStatus: { textContent: "" },
    referenceAbilitySearch: { value: "" },
    referenceAbilityClass: { value: "Рекрут" },
    referenceAbilityCategory: { value: "ultimate" },
  };
  const runFilter = new Function(
    "document",
    `${abilitySource}; ${referenceSource}; filterRulesReferenceAbilities();`,
  );

  runFilter({ getElementById: (id) => nodes[id] || null });

  assert.equal(nodes.referenceAbilityStatus.textContent, "Найдено способностей: 6 из 126");
  assert.match(nodes.referenceAbilityResults.innerHTML, /<h3>Рекрут<\/h3>/);
  assert.match(nodes.referenceAbilityResults.innerHTML, /Ультимативные/);
  assert.doesNotMatch(nodes.referenceAbilityResults.innerHTML, /<h3>Психопат<\/h3>/);
});

test("на старте выбираются две способности каждой категории", async () => {
  const [abilitySource, abilityUiSource, core, characterScripts, editor, server] = await Promise.all([
    readClassicScript("../apps-script-source/AbilitiesData.html"),
    readClassicScript("../apps-script-source/ScriptsAbilities.html"),
    readFile(new URL("../apps-script-source/ScriptsCore.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/ScriptsCharacter.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/Index.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/Code.js", import.meta.url), "utf8"),
  ]);
  const { abilityData, abilityCategoryLabels } = new Function(
    `${abilitySource}; return { abilityData, abilityCategoryLabels };`,
  )();
  const runSelectionScenario = new Function(
    "abilityData",
    "abilityCategoryLabels",
    `
      const selectedAbilities = [];
      const maxStartingAbilities = 8;
      const advancedEditMode = false;
      let activeAbilityId = null;
      const warnings = [];
      function refreshViewerIfOpen() {}
      ${abilityUiSource}
      renderAbilities = function() {};
      showAbilitiesWarning = function(message) { warnings.push(message); };
      const psychopat = abilityData.filter(ability => ability.className === "Психопат");
      for (const category of ["ultimate", "favorite", "common", "situational"]) {
        const choices = psychopat.filter(ability => ability.category === category);
        toggleAbilitySelection(choices[0].id);
        toggleAbilitySelection(choices[1].id);
        toggleAbilitySelection(choices[2].id);
      }
      return { selectedAbilities, warnings };
    `,
  );
  const result = runSelectionScenario(abilityData, abilityCategoryLabels);

  assert.equal(result.selectedAbilities.length, 8);
  assert.equal(result.warnings.length, 4);
  assert.ok(result.warnings.every((warning) => warning.includes("только две способности")));
  assert.match(core, /const maxStartingAbilities = 8/);
  assert.match(characterScripts, /categoryCounts\.ultimate !== 2/);
  assert.match(characterScripts, /categoryCounts\.favorite !== 2/);
  assert.match(characterScripts, /categoryCounts\.common !== 2/);
  assert.match(characterScripts, /categoryCounts\.situational !== 2/);
  assert.match(characterScripts, /Выберите ровно 8 способностей/);
  assert.match(editor, /выберите по две способности/);
  assert.match(editor, /Ситуативные способности/);
  assert.match(editor, /0 \/ 8/);
  assert.match(server, /abilities\.length !== 8/);
});

test("биографические факты соответствуют редакции 0.5.3", async () => {
  const biographySource = await readClassicScript("../apps-script-source/BiographyData.html");
  const biographyData = new Function(`${biographySource}; return biographyData;`)();
  const family = biographyData.sections.find((section) => section.id === "family");
  const names = Object.fromEntries(family.cards.map((card) => [card.id, card.name]));

  assert.equal(family.title, "Условия взросления");
  assert.equal(names["working-income"], "Скромный быт");
  assert.equal(names.prosperity, "Благополучие");
  assert.equal(names.privilege, "Возможности");
});

test("снаряжение использует актуальный каталог, расходники и рекомендации", async () => {
  const [equipmentSource, equipmentUiSource] = await Promise.all([
    readClassicScript("../apps-script-source/EquipmentData.html"),
    readClassicScript("../apps-script-source/ScriptsEquipment.html"),
  ]);
  const { equipmentData, classRecommendedEquipment } = new Function(
    `${equipmentSource}; return { equipmentData, classRecommendedEquipment };`,
  )();
  const helpers = new Function(
    `${equipmentUiSource}; return { isConsumableEquipment, isHiddenEquipmentItem, hasVisibleEquipmentDamage };`,
  )();
  const renderEquipmentQuickStats = new Function(
    "escapeViewerHtml",
    `${equipmentUiSource}; return renderEquipmentQuickStats;`,
  )((value) => String(value));
  const watch = equipmentData.find((item) => item.name === "Простые карманные часы");

  assert.equal(equipmentData.length, 85);
  assert.ok(watch);
  assert.ok(equipmentData.some((item) => item.name === "Дермопластическая мазь №7 («Семёрка»)"));
  assert.ok(equipmentData.some((item) => item.name === "Чистый спирт (1 л)" && item.priceText === "100 ф"));
  assert.ok(equipmentData.some((item) => item.name === "Атронская горечь (нефильт.) шот" && item.priceText === "100 п."));
  assert.ok(equipmentData.every((item) => item.name !== "Механический ассистент"));
  assert.ok(equipmentData.every((item) => !["Хвитлэк", "Фарналит"].includes(item.name)));
  assert.equal(
    equipmentData.find((item) => item.name === "Химический распылитель")?.pool,
    "Нюх + Стрельба или Напор + Драка",
  );
  assert.equal(
    equipmentData.find((item) => item.name === "Химический распылитель")?.purpose,
    "Поражает два соседних гекса разом.",
  );
  assert.equal(
    equipmentData.find((item) => item.name === "Химический распылитель")?.exploitation,
    4,
  );
  assert.equal(
    equipmentData.filter((item) => item.category === "Метательное оружие").length,
    4,
  );
  assert.ok(equipmentData.every((item) => ![
    "Джавелин / короткое метательное копьё",
    "Тяжёлый гарпун",
  ].includes(item.name)));
  const crystalItems = equipmentData.filter((item) => item.category === "Кристаллы");
  assert.equal(crystalItems.length, 5);
  assert.ok(crystalItems.every((item) => item.durability === 2 && item.exploitation === undefined));
  assert.ok(crystalItems.every((item) => (item.tags || []).some((tag) => ["КК", "СК"].includes(tag))));
  assert.equal(helpers.hasVisibleEquipmentDamage(crystalItems.find((item) => item.name === "Перчатка синего поля")), false);
  assert.equal(helpers.hasVisibleEquipmentDamage(equipmentData.find((item) => item.name === "Пистоль")), true);
  assert.doesNotMatch(renderEquipmentQuickStats(crystalItems.find((item) => item.name === "Перчатка синего поля")), /Урон/);
  assert.match(renderEquipmentQuickStats(crystalItems.find((item) => item.name === "Перчатка синего поля")), /Прочность/);
  assert.equal(equipmentData.find((item) => item.name === "Сабля / шпага")?.exploitation, 4);
  assert.deepEqual(
    ["Тяжёлый меч", "Булава", "Боевой молот"].map((name) => {
      const item = equipmentData.find((candidate) => candidate.name === name);
      return [item?.damage, item?.exploitation];
    }),
    [["d10", 5], ["d10", 5], ["d10", 5]],
  );
  assert.deepEqual(
    ["Камень / бутылка / подручный предмет", "Метательный дротик"].map((name) => {
      const item = equipmentData.find((candidate) => candidate.name === name);
      return [item?.damage, item?.exploitation];
    }),
    [["d4", 2], ["d4", 2]],
  );
  assert.deepEqual(
    ["Дуэльный пистоль", "Короткий револьвер ранней конструкции", "Мушкет", "Карабин", "Охотничье ружьё", "Механический арбалет"]
      .map((name) => equipmentData.find((candidate) => candidate.name === name)?.exploitation),
    [3, 4, 5, 4, 5, 5],
  );
  assert.deepEqual(
    ["Дротиковая трубка", "Пружинный гвоздомёт"].map((name) => {
      const item = equipmentData.find((candidate) => candidate.name === name);
      return [item?.damage, item?.exploitation];
    }),
    [["d4+1", 3], ["d4+1", 2]],
  );
  assert.equal(equipmentData.find((item) => item.name === "Трость с кристаллическим навершием")?.damage, "d4");
  assert.ok(equipmentData.some((item) => item.name === "Фурма"));
  assert.equal(equipmentData.find((item) => item.name === "Фурма")?.damage, "d4 — d10");
  assert.equal(equipmentData.find((item) => item.name === "Фурма")?.exploitation, "2–5");
  assert.equal(
    equipmentData.find((item) => item.name === "Полевая аптечка")?.purpose,
    "Состав: раневой коллодий, «Семёрка», несколько (3) доз Сомнола, перевязочный материал и набор слабых антидотов.",
  );
  assert.equal(
    equipmentData.find((item) => item.name === "Малый набор инструментов")?.purpose,
    "Компактный набор для полевого ремонта и работы с механизмами. Содержит небольшой молоток, гаечный ключ, плоскогубцы, несколько отвёрток, напильник, шило, моток проволоки, небольшой набор мелких деталей, крепёж и масло.",
  );
  assert.equal(
    equipmentData.find((item) => item.name === "Большой набор инструментов")?.purpose,
    "Полный набор для ремонта, сборки и разборки механизмов. Содержит молот, набор гаечных ключей, плоскогубцы и клещи, отвёртки, напильники, зубило, ручную дрель, ножовку по металлу, струбцину, проволоку, крепёж, масло и множество запасных деталей.",
  );
  assert.ok(classRecommendedEquipment["Менталист"].includes("pistol"));
  assert.ok(!classRecommendedEquipment["Менталист"].includes("duelny-pistol"));
  assert.equal(
    helpers.isConsumableEquipment(equipmentData.find((item) => item.name === "Слабый яд")),
    true,
  );
  assert.equal(
    helpers.isConsumableEquipment(equipmentData.find((item) => item.name === "Кислотная склянка")),
    false,
  );
  assert.equal(
    helpers.isHiddenEquipmentItem(equipmentData.find((item) => item.name === "Тяжёлый меч")),
    true,
  );
  for (const recommended of Object.values(classRecommendedEquipment)) {
    assert.ok(recommended.includes(watch.id));
    for (const equipmentId of ['somnol', 'argentol', 'fibrinat', 'mitrinovyy-ranevoy-kollodiy']) {
      assert.ok(recommended.includes(equipmentId));
    }
  }
  const equipmentById = Object.fromEntries(equipmentData.map((item) => [item.id, item]));
  assert.ok(classRecommendedEquipment["Натуралист"].every((equipmentId) =>
    !(equipmentById[equipmentId]?.tags || []).includes("СК")
  ));
});

test("каталоги снаряжения имеют независимые быстрые фильтры", async () => {
  const [editor, styles, equipmentSource, equipmentUiSource] = await Promise.all([
    readFile(new URL("../apps-script-source/Index.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/Styles.html", import.meta.url), "utf8"),
    readClassicScript("../apps-script-source/EquipmentData.html"),
    readClassicScript("../apps-script-source/ScriptsEquipment.html"),
  ]);
  const equipmentData = new Function(`${equipmentSource}; return equipmentData;`)();
  const helpers = new Function(
    `${equipmentUiSource}; return { getEquipmentFilterCategory, matchesEquipmentFilter };`,
  )();
  const byName = Object.fromEntries(equipmentData.map(item => [item.name, item]));

  assert.equal((editor.match(/>Сбросить фильтры<\/button>/g) || []).length, 2);
  assert.match(editor, /рекомендованные классу/);
  assert.match(styles, /\.equipment-quick-filters button \{[\s\S]*?background: #dce5e8/);
  assert.match(styles, /\.equipment-filter-reset \{[\s\S]*?background: #eadbd6/);
  assert.match(styles, /\.skill-name-text \{[\s\S]*?hyphens: auto/);
  assert.match(styles, /\.skill-column \{[\s\S]*?grid-template-rows: auto repeat\(6, 62px\)/);
  assert.match(styles, /\.skill-item \{[\s\S]*?height: 62px/);
  assert.match(styles, /\.skill-mark-legend\[hidden\] \{ display: none; \}/);
  for (const filter of ['armor', 'melee', 'thrown', 'ranged', 'crystal', 'kit', 'consumable', 'other']) {
    assert.equal((editor.match(new RegExp(`data-equipment-filter="${filter}"`, 'g')) || []).length, 2);
  }
  assert.equal(helpers.getEquipmentFilterCategory(byName['Кираса']), 'armor');
  assert.equal(helpers.getEquipmentFilterCategory(byName['Нож / складной нож']), 'melee');
  assert.equal(helpers.getEquipmentFilterCategory(byName['Химический распылитель']), 'melee');
  assert.equal(helpers.getEquipmentFilterCategory(byName['Метательный нож']), 'thrown');
  assert.equal(helpers.getEquipmentFilterCategory(byName['Полевой исследовательский набор']), 'kit');
  assert.equal(helpers.getEquipmentFilterCategory(byName['Пистоль']), 'ranged');
  assert.equal(helpers.getEquipmentFilterCategory(byName['Красный резонансный кулон']), 'crystal');
  assert.equal(helpers.getEquipmentFilterCategory(byName['Слабый яд']), 'consumable');
  assert.equal(helpers.getEquipmentFilterCategory(byName['Компас']), 'other');
  assert.equal(helpers.matchesEquipmentFilter(byName['Пистоль'], 'melee'), false);
  assert.match(equipmentUiSource, /class="equipment-quick-stats"/);
  assert.match(styles, /\.equipment-quick-stat\s*\{/);
  assert.match(editor, /<details id="otherEquipmentSection" class="equipment-section equipment-collapsible">/);
  assert.doesNotMatch(editor, /<details id="otherEquipmentSection"[^>]*\sopen(?:\s|>)/);
  assert.match(styles, /\.equipment-collapsible > summary::after\s*\{[\s\S]*?content: 'Показать'/);
});

test("одновременно открыта только одна подсказка навыка", async () => {
  const characterSource = await readFile(
    new URL("../apps-script-source/ScriptsCharacter.html", import.meta.url),
    "utf8",
  );

  assert.match(characterSource, /ontoggle="handleSkillInfoToggle\(this\)"/);
  assert.match(characterSource, /querySelectorAll\('#skillsGrid details\.skill-info\[open\]'\)/);
  assert.match(characterSource, /if \(details !== currentDetails\) details\.open = false/);
});

test("навыки фильтруются по типу, а мобильная сводка остаётся липкой", async () => {
  const [editor, characterSource, styles] = await Promise.all([
    readFile(new URL("../apps-script-source/Index.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/ScriptsCharacter.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/Styles.html", import.meta.url), "utf8"),
  ]);

  for (const filter of ['all', 'primary', 'secondary']) {
    assert.match(editor, new RegExp(`data-skill-type-filter="${filter}"`));
  }
  assert.match(characterSource, /skillTypeFilter === 'secondary' && !isSecondary/);
  assert.match(characterSource, /skillTypeFilter === 'primary' && isSecondary/);
  assert.match(characterSource, /mobileTypeProgress\.textContent/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.skill-sticky-controls\s*\{[\s\S]*?position: sticky/);
  assert.match(styles, /\.skills-grid\[data-skill-type-filter='secondary'\] \.skill-column/);
});

test("рекомендации классов и второстепенные навыки редакции 0.5.2 настроены отдельно", async () => {
  const [coreSource, editorSource, characterSource] = await Promise.all([
    readFile(new URL("../apps-script-source/ScriptsCore.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/Index.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/ScriptsCharacter.html", import.meta.url), "utf8"),
  ]);

  for (const className of [
    "Психопат",
    "Кустарь",
    "Воротила",
    "Рекрут",
    "Менталист",
    "Натуралист",
  ]) {
    assert.match(coreSource, new RegExp(`'${className}': \\{`));
  }

  assert.match(editorSource, /id="showRecommendedSkills"/);
  assert.match(editorSource, /id="skillRecommendationLegend"/);
  assert.match(editorSource, /skill-mark-legend secondary/);
  assert.match(editorSource, /skill-mark-legend useful/);
  assert.match(editorSource, /skill-mark-legend recommended/);
  assert.doesNotMatch(editorSource, />II<\/b>/);
  assert.doesNotMatch(characterSource, />II<\/b>/);
  assert.doesNotMatch(characterSource, />П<\/b>/);
  assert.doesNotMatch(characterSource, />★<\/span>/);
  assert.match(characterSource, /skillMarks = \[[\s\S]*?class="secondary"[\s\S]*?class="useful"[\s\S]*?class="recommended"/);
  assert.match(characterSource, /recommendationLegend\.hidden = !recommendationToggle\?\.checked/);
  assert.match(characterSource, /'Внимательность': 'Вни&shy;ма&shy;тель&shy;ность'/);
  assert.match(characterSource, /'Командование': 'Ко&shy;ман&shy;до&shy;ва&shy;ние'/);
  assert.match(coreSource, /'Рекрут': \{[\s\S]*?primary:[\s\S]*?'nyuh:strelba'/);
  assert.match(coreSource, /const secondarySkillPaths = \[[\s\S]*?'napor:sila'[\s\S]*?'snorovka:koordinatsiya'[\s\S]*?'nyuh:znanieUlits'[\s\S]*?'smetka:erudiciya'[\s\S]*?'gospodstvo:publika'/);
  assert.match(coreSource, /const maxStartingPrimarySkillPoints = totalExtraSkillPoints - requiredSecondarySkillPoints/);
  assert.match(characterSource, /getSpentPrimarySkillPoints\(\) >= maxStartingPrimarySkillPoints/);
  assert.match(coreSource, /const usefulSkillPaths = \[[\s\S]*?'nyuh:vnimatelnost'[\s\S]*?'smetka:erudiciya'[\s\S]*?'gospodstvo:disciplina'[\s\S]*?'napor:stoikost'[\s\S]*?'snorovka:uklonenie'/);
  assert.match(characterSource, /isUseful = showSkillGuidance && usefulSkillPaths\.includes\(path\)/);
  assert.match(characterSource, /skillMarks \? 'has-skill-marks' : ''/);
  assert.match(characterSource, /usefulLegend\.hidden = !recommendationToggle\?\.checked/);
  assert.match(coreSource, /vzlom: \{ name: 'Взлом'/);
  assert.match(coreSource, /publika: \{ name: 'Публика'/);
  assert.match(characterSource, /getSpentSecondarySkillPoints/);
  assert.match(characterSource, /getPrimarySkillGroupTotal/);
  assert.match(editorSource, /resetAllSkills/);
});

test("каждый тип образования имеет генератор минимум из 30 специализаций", async () => {
  const characterSource = await readFile(
    new URL("../apps-script-source/ScriptsCharacter.html", import.meta.url),
    "utf8",
  );
  const script = characterSource.replace(/^\s*<script>\s*/, "").replace(/\s*<\/script>\s*$/, "");
  for (const type of ["guild", "humanities", "parish", "scientific"]) {
    const match = script.match(new RegExp(`${type}: \\[([\\s\\S]*?)\\n    \\]`));
    assert.ok(match, `нет библиотеки ${type}`);
    assert.ok((match[1].match(/'/g) || []).length / 2 >= 30, `мало вариантов ${type}`);
  }
  assert.match(characterSource, /generateEducationSpecialization/);
  assert.doesNotMatch(characterSource, /Ремонт автоматонов/);
});

test("режим бросков не требует сохранения, а просмотр требует", async () => {
  const core = await readFile(new URL("../apps-script-source/ScriptsCore.html", import.meta.url), "utf8");
  assert.match(core, /const requiresSavedCharacter = mode === 'view' && !currentCharacterId/);
  assert.doesNotMatch(core, /mode !== 'edit'[\s\S]{0,100}!currentCharacterId \|\| !currentCharacterIsComplete/);
});

test("name generator supports the three regions and both modes", async () => {
  const extendedDataSource = await readClassicScript(
    "../apps-script-source/ExtendedNameLibraryData.html",
  );
  const dataSource = await readClassicScript(
    "../apps-script-source/NameGeneratorData.html",
  );
  const generatorSource = await readClassicScript(
    "../apps-script-source/ScriptsNameGenerator.html",
  );
  const generator = new Function(
    `${extendedDataSource}; ${dataSource}; ${generatorSource}; return {
      data: nameGeneratorData,
      libraryData: extendedNameLibrary,
      library: generateLibraryCharacterName,
      procedural: generateProceduralCharacterName
    };`,
  )();

  assert.deepEqual(Object.keys(generator.data), ["plex", "rellek", "shelloun"]);

  const libraryEntryCount = Object.values(generator.libraryData)
    .flatMap((region) => Object.values(region.library))
    .reduce((total, entries) => total + entries.length, 0);
  assert.equal(libraryEntryCount, 2478);

  for (const region of Object.keys(generator.data)) {
    for (const gender of ["male", "female", "neutral"]) {
      assert.match(generator.library(region, gender), /^\S.+\s.+$/);
      assert.match(generator.procedural(region, gender), /^\S.+\s.+$/);
    }
  }
});

test("интерфейс бросков использует новые действия и выделяет события в логе", async () => {
  const view = await readFile(
    new URL("../apps-script-source/RollsView.html", import.meta.url),
    "utf8",
  );
  const scripts = await readFile(
    new URL("../apps-script-source/RollsScripts.html", import.meta.url),
    "utf8",
  );

  assert.match(view, /Бросить Контроль при Осложнении/);
  assert.match(view, /Помеха — 3d4/);
  assert.match(view, /Обычная сцена — d4 \+ d6 \+ d8/);
  assert.match(view, /Преимущество — 3d8/);
  assert.match(view, /id="rollDifficulty"/);
  assert.match(view, /id="rollControlMethod"\s+type="hidden"\s+value="fixed"/);
  assert.match(view, /id="rollControlFlatBonus"[\s\S]*?readonly/);
  assert.equal((view.match(/data-control-method="[^"]+"\s+disabled/g) || []).length, 0);
  assert.match(view, /Стандартная сложность Контроля — 16/);
  assert.match(scripts, /mitriniumApplyBiographyBonus/);
  assert.match(scripts, /mitriniumRerollEfficiencyDie/);
  assert.match(scripts, /roll-event-badge complication/);
  assert.match(scripts, /roll-event-badge breakthrough/);
  assert.doesNotMatch(`${view}\n${scripts}`, /замен(?:а|ить).*на 4/i);
});

test("бонус выбранной Методики автоматически попадает в бросок Контроля", async () => {
  const [core, rolls] = await Promise.all([
    readFile(new URL("../apps-script-source/ScriptsCore.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/RollsScripts.html", import.meta.url), "utf8"),
  ]);

  assert.match(
    core,
    /function setCharacterControl[\s\S]*?applyCharacterControlMethodToRoll\(\)/,
  );
  assert.match(
    core,
    /if \(mode === 'rolls'\)[\s\S]*?applyCharacterControlMethodToRoll\(\)/,
  );
  assert.match(
    rolls,
    /function rollEfficiencyNow\(\)[\s\S]*?applyCharacterControlMethodToRoll\(\)[\s\S]*?flatBonus:/,
  );
});

test("опции общего лога находятся в панели сохранения калькулятора", async () => {
  const [calculator, calculatorScripts] = await Promise.all([
    readFile(new URL("../calculator-script-source/Index.html", import.meta.url), "utf8"),
    readFile(new URL("../calculator-script-source/Script.html", import.meta.url), "utf8"),
  ]);
  const savingPanel = calculator.slice(
    calculator.indexOf('<h2>Сохранение</h2>'),
    calculator.indexOf('</section>', calculator.indexOf('<h2>Сохранение</h2>')),
  );

  assert.match(savingPanel, /Логирование событий/);
  assert.match(savingPanel, /id="combatLogRolls"/);
  assert.match(savingPanel, /id="combatLogResources"/);
  assert.match(savingPanel, /id="combatLogReactions"/);
  assert.match(savingPanel, /id="combatLogVisibleToPlayers"/);
  assert.match(savingPanel, /Показывать записи калькулятора игрокам/);
  assert.match(savingPanel, /Изменения Тела и Нерва врагов/);
  assert.match(calculatorScripts, /const pendingResourceLogs=new Map\(\)/);
  assert.match(calculatorScripts, /setTimeout\(\(\)=>flushResourceLog\(key\),1200\)/);
  assert.match(calculatorScripts, /Восстановление/);
  assert.match(calculatorScripts, /Сохранить как пресет/);
  assert.match(calculatorScripts, /sendCombatEnemyToEditor/);
  assert.match(calculatorScripts, /renameCombatEnemy/);
});

test("трекер инициативы сортируется только вручную, а противники открываются в отдельной панели", async () => {
  const [calculator, calculatorScripts, calculatorStyles] = await Promise.all([
    readFile(new URL("../calculator-script-source/Index.html", import.meta.url), "utf8"),
    readFile(new URL("../calculator-script-source/Script.html", import.meta.url), "utf8"),
    readFile(new URL("../calculator-script-source/Styles.html", import.meta.url), "utf8"),
  ]);

  assert.match(calculator, /onclick="sortInitiative\(\)"[^>]*>Отсортировать/);
  assert.match(calculator, /id="roundPhaseLabel"[^>]*>Передвижение/);
  assert.match(calculator, /onclick="advanceInitiativePhase\(\)"[^>]*>Перейти к действиям/);
  assert.match(calculator, /id="enemyGrid"/);
  assert.match(calculator, /id="enemyDetail"/);
  assert.match(calculatorScripts, /function sortInitiative\(\)/);
  assert.match(calculatorScripts, /function advanceInitiativePhase\(\)/);
  assert.match(calculatorScripts, /phase:'movement'/);
  assert.match(calculatorScripts, /statuses:\{\}/);
  assert.match(calculatorScripts, /toggleInitiativeStatus/);
  assert.match(calculatorScripts, /Походил/);
  assert.match(calculatorScripts, /Реакция/);
  assert.match(calculatorScripts, /Действие/);
  assert.match(calculatorScripts, /state\.initiative\.order=participants\.map/);
  const setInitiativeBody = calculatorScripts.slice(
    calculatorScripts.indexOf("function setInitiative("),
    calculatorScripts.indexOf("function sortInitiative("),
  );
  assert.doesNotMatch(setInitiativeBody, /renderInitiative\(\)/);
  assert.match(calculatorScripts, /function selectCombatEnemy\(id\)/);
  assert.match(calculatorScripts, /enemy-summary-card/);
  assert.match(calculatorStyles, /\.combat-enemy-workspace/);
  assert.match(calculatorStyles, /\.enemy-summary-card\.selected/);
  assert.match(calculatorStyles, /\.initiative-statuses/);
});

test("у Нерва нет крупного шага −5, а у Тела он сохранён", async () => {
  const viewerScripts = await readFile(
    new URL("../apps-script-source/ViewerScripts.html", import.meta.url),
    "utf8",
  );

  assert.match(viewerScripts, /key === 'currentBody'/);
  assert.match(viewerScripts, /changeViewerStateValue\('\$\{key\}', -5\)/);
});

test("игрок отслеживает передвижение, реакцию и действие в режиме бросков", async () => {
  const [rollsView, rollsScripts, viewerScripts, styles] = await Promise.all([
    readFile(new URL("../apps-script-source/RollsView.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/RollsScripts.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/ViewerScripts.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/UiStyles.html", import.meta.url), "utf8"),
  ]);

  assert.match(rollsView, /id="rollMovementState"/);
  assert.match(rollsView, /id="rollReactionState"/);
  assert.match(rollsView, /id="rollActionState"/);
  assert.match(rollsView, /onclick="resetRollTurnTracker\(\)"/);
  assert.match(rollsScripts, /function toggleRollTurnTracker\(key\)/);
  assert.match(rollsScripts, /markViewerStateUnsaved\(\)/);
  assert.match(viewerScripts, /turnTracker: normalizeViewerTurnTracker/);
  assert.match(styles, /\.roll-turn-tracker-buttons/);
});

test("калькулятор показывает общий лог бросков", async () => {
  const [calculator, calculatorScripts, calculatorStyles] = await Promise.all([
    readFile(new URL("../calculator-script-source/Index.html", import.meta.url), "utf8"),
    readFile(new URL("../calculator-script-source/Script.html", import.meta.url), "utf8"),
    readFile(new URL("../calculator-script-source/Styles.html", import.meta.url), "utf8"),
  ]);

  assert.match(calculator, /id="calculatorRollLogList"/);
  assert.match(calculator, /Общий лог бросков/);
  assert.match(calculatorScripts, /serverCall\('mitriniumGetRollLog',100\)/);
  assert.match(calculatorScripts, /function renderCalculatorRollLog\(entries\)/);
  assert.match(calculatorScripts, /if\(state\.currentScreen==='combat'\)refreshCalculatorRollLog\(true\)/);
  assert.match(calculatorStyles, /\.combat-roll-log-entry/);
});

test("выбор куба для переброса остаётся компактным", async () => {
  const [scripts, styles] = await Promise.all([
    readFile(new URL("../apps-script-source/RollsScripts.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/Styles.html", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(scripts, /roll-die-selected-label/);
  assert.match(styles, /roll-die\.selectable\.selected::after/);
  assert.doesNotMatch(styles, /translateY\(-3px\) scale\(1\.06\)/);
});

test("редактор использует Атрибуты, Навыки и ограничения версии 0.5.2", async () => {
  const core = await readFile(
    new URL("../apps-script-source/ScriptsCore.html", import.meta.url),
    "utf8",
  );
  const editor = await readFile(
    new URL("../apps-script-source/Index.html", import.meta.url),
    "utf8",
  );

  assert.match(core, /const totalExtraSkillPoints = 20/);
  assert.match(core, /const requiredSecondarySkillPoints = 4/);
  assert.match(core, /const maxStartingPrimarySkillGroupTotal = 5/);
  assert.match(core, /skill\.value = 0/);
  assert.match(core, /const startingControlPoints = 3/);
  assert.match(core, /changeCharacterControlBonus/);
  assert.match(editor, /Контроль = d20 \+ фиксированный бонус Методики/);
  assert.match(editor, /Все Навыки начинаются с 0/);
  const characterScripts = await readFile(
    new URL("../apps-script-source/ScriptsCharacter.html", import.meta.url),
    "utf8",
  );
  assert.match(characterScripts, /skillRulesVersion: 7/);
  assert.match(characterScripts, /attributeRulesVersion: 2/);
  assert.match(characterScripts, /attributes\.napor[\s\S]*attributes\.snorovka/);
  assert.match(characterScripts, /attributes\.gospodstvo[\s\S]*attributes\.nyuh/);
  assert.match(characterScripts, /protection:\s*2 \+ Math\.ceil/);
  assert.match(editor, /id="protectionValue"/);
  assert.match(characterScripts, /legacySkills/);
  const storageScripts = await readFile(
    new URL("../apps-script-source/ScriptsStorage.html", import.meta.url),
    "utf8",
  );
  assert.match(storageScripts, /clampLoadedStat\([\s\S]*loadedSkills/);
  assert.match(storageScripts, /group\[skillKey\][\s\S]*0/);
});

test("способности открываются без прокрутки, а бюджет снаряжения остаётся видимым", async () => {
  const [editor, abilityScripts, equipmentScripts, styles] = await Promise.all([
    readFile(new URL("../apps-script-source/Index.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/ScriptsAbilities.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/ScriptsEquipment.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/Styles.html", import.meta.url), "utf8"),
  ]);

  assert.match(editor, /id="abilityDetailsDialog"/);
  assert.match(abilityScripts, /openAbilityDetailsDialog\(\)/);
  assert.match(abilityScripts, /matchMedia\('\(max-width: 700px\)'\)/);
  assert.match(abilityScripts, /Выбрать способность/);
  assert.match(editor, /id="equipmentAvailableSticky"/);
  assert.match(equipmentScripts, /stickyAvailableElement\.textContent/);
  assert.match(styles, /\.equipment-budget-sticky\s*\{[\s\S]*?position:\s*sticky/);
});

test("просмотр показывает состояние, компактные навыки со значениями атрибутов и затем Контроль", async () => {
  const viewer = await readFile(
    new URL("../apps-script-source/ViewerScripts.html", import.meta.url),
    "utf8",
  );

  const stateIndex = viewer.indexOf('<h3>Состояние</h3>');
  const skillsIndex = viewer.indexOf('<h3>Навыки</h3>');
  const controlIndex = viewer.indexOf('<h3>Контроль</h3>');

  assert.ok(stateIndex >= 0 && stateIndex < skillsIndex);
  assert.ok(skillsIndex < controlIndex);
  assert.equal(viewer.indexOf('<h3>Атрибуты</h3>'), -1);
  assert.match(viewer, /renderViewerSkills\(character\.skills \|\| \{}, character\.attributes \|\| \{}\)/);
  assert.match(viewer, /class="viewer-skill-attribute-value"/);
  assert.match(viewer, /viewer-state-label">Скорость<[\s\S]*?viewer-state-static-value">3</);
});

test("числовые поля просмотра не показывают встроенные стрелки браузера", async () => {
  const styles = await readFile(
    new URL("../apps-script-source/Styles.html", import.meta.url),
    "utf8",
  );

  assert.match(styles, /\.viewer input\[type='number'\]\s*\{[\s\S]*?appearance: textfield/);
  assert.match(styles, /\.viewer input\[type='number'\]::-webkit-inner-spin-button/);
  assert.match(styles, /-webkit-appearance: none/);
});

test("просмотр группирует способности по типу в фиксированном порядке", async () => {
  const [viewer, styles, referenceScripts] = await Promise.all([
    readFile(new URL("../apps-script-source/ViewerScripts.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/Styles.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/RulesReferenceScripts.html", import.meta.url), "utf8"),
  ]);

  const expectedOrder = /\['ultimate', 'favorite', 'common', 'situational'\]/;
  assert.match(viewer, expectedOrder);
  assert.match(viewer, /class="viewer-ability-group"/);
  assert.match(viewer, /abilityCategoryLabels\[category\]/);
  assert.match(styles, /\.viewer-ability-group h4/);
  assert.match(referenceScripts, expectedOrder);
});
