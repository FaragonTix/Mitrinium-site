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
    readClassicScript("../apps-script-source/ScriptsCore.html"),
    readClassicScript("../apps-script-source/ScriptsCharacter.html"),
    readClassicScript("../apps-script-source/ScriptsAbilities.html"),
    readClassicScript("../apps-script-source/ScriptsStorage.html"),
    readClassicScript("../apps-script-source/ViewerScripts.html"),
    readClassicScript("../apps-script-source/RollsScripts.html"),
  ]);

  for (const source of scripts) {
    assert.doesNotThrow(() => new Function(source));
  }
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

  assert.equal(abilities.length, 84);
  assert.ok(abilities.every((ability) => ability.prerequisite));
  assert.doesNotMatch(abilityRenderer, /ability\.tags/);
});

test("recommended skills are configured for every class", async () => {
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
    assert.match(coreSource, new RegExp(`'${className}': \\[`));
  }

  assert.match(editorSource, /id="showRecommendedSkills"/);
  assert.match(coreSource, /'Рекрут': \[[\s\S]*?'nyuh:strelba'/);
});
