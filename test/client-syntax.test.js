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
  ]);

  for (const source of scripts) {
    assert.doesNotThrow(() => new Function(source));
  }
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

test("у каждой способности есть пререквизит, а теги больше не выводятся", async () => {
  const abilitySource = await readClassicScript(
    "../apps-script-source/AbilitiesData.html",
  );
  const abilities = new Function(`${abilitySource}; return abilityData;`)();
  const abilityRenderer = await readFile(
    new URL("../apps-script-source/ScriptsAbilities.html", import.meta.url),
    "utf8",
  );

  assert.equal(abilities.length, 88);
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
    "Реакция после атаки крупнокалиберным оружием. Рекрут может сделать второй выстрел следом в этот же ход. Второй выстрел получает Помеху и наносит d6 урона.",
  );
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
    `${equipmentUiSource}; return { isConsumableEquipment, isHiddenEquipmentItem };`,
  )();
  const watch = equipmentData.find((item) => item.name === "Простые карманные часы");

  assert.equal(equipmentData.length, 81);
  assert.ok(watch);
  assert.ok(equipmentData.some((item) => item.name === "Дермопластическая мазь №7 («Семёрка»)"));
  assert.ok(equipmentData.every((item) => item.name !== "Механический ассистент"));
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
  }
});

test("основные и вторичные рекомендованные навыки настроены для каждого класса", async () => {
  const coreSource = await readFile(
    new URL("../apps-script-source/ScriptsCore.html", import.meta.url),
    "utf8",
  );
  const editorSource = await readFile(
    new URL("../apps-script-source/Index.html", import.meta.url),
    "utf8",
  );

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
  assert.match(coreSource, /'Рекрут': \{[\s\S]*?primary:[\s\S]*?'nyuh:strelba'/);
  assert.match(coreSource, /const classSecondarySkills = \[[\s\S]*?'snorovka:uklonenie'[\s\S]*?'napor:stoikost'[\s\S]*?'gospodstvo:disciplina'[\s\S]*?'smetka:erudiciya'[\s\S]*?'nyuh:vnimatelnost'/);
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
  assert.match(view, /Обычная сцена — 2d4 \+ d6/);
  assert.match(view, /Преимущество — 3d6/);
  assert.match(view, /id="rollDifficulty"/);
  assert.match(scripts, /mitriniumApplyBiographyBonus/);
  assert.match(scripts, /mitriniumRerollEfficiencyDie/);
  assert.match(scripts, /roll-event-badge complication/);
  assert.match(scripts, /roll-event-badge breakthrough/);
  assert.doesNotMatch(`${view}\n${scripts}`, /замен(?:а|ить).*на 4/i);
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

test("выбор куба для переброса остаётся компактным", async () => {
  const [scripts, styles] = await Promise.all([
    readFile(new URL("../apps-script-source/RollsScripts.html", import.meta.url), "utf8"),
    readFile(new URL("../apps-script-source/Styles.html", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(scripts, /roll-die-selected-label/);
  assert.match(styles, /roll-die\.selectable\.selected::after/);
  assert.doesNotMatch(styles, /translateY\(-3px\) scale\(1\.06\)/);
});

test("редактор использует Атрибуты, Навыки и ограничения версии 0.4.9", async () => {
  const core = await readFile(
    new URL("../apps-script-source/ScriptsCore.html", import.meta.url),
    "utf8",
  );
  const editor = await readFile(
    new URL("../apps-script-source/Index.html", import.meta.url),
    "utf8",
  );

  assert.match(core, /const totalExtraSkillPoints = 18/);
  assert.match(core, /const maxStartingSkillGroupTotal = 5/);
  assert.match(core, /skill\.value = 0/);
  assert.match(editor, /Все Навыки начинаются с 0/);
  const characterScripts = await readFile(
    new URL("../apps-script-source/ScriptsCharacter.html", import.meta.url),
    "utf8",
  );
  assert.match(characterScripts, /skillRulesVersion: 5/);
  assert.match(characterScripts, /attributeRulesVersion: 2/);
  assert.match(characterScripts, /attributes\.napor[\s\S]*attributes\.snorovka/);
  assert.match(characterScripts, /attributes\.gospodstvo[\s\S]*attributes\.nyuh/);
  assert.match(characterScripts, /legacySkills/);
  const storageScripts = await readFile(
    new URL("../apps-script-source/ScriptsStorage.html", import.meta.url),
    "utf8",
  );
  assert.match(storageScripts, /clampLoadedStat\([\s\S]*loadedSkills/);
  assert.match(storageScripts, /group\[skillKey\][\s\S]*0/);
});
