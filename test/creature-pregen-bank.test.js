import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  flattenCreaturePregens,
  migrateCreaturePregenBank,
  resolveCreaturePregen,
  scaleCreatureProfileForLevel,
  validateCreaturePregenBank,
} from "../src/client/calculator-v8/creature-pregens.js";
import { archetypeVariants } from "../src/client/calculator-v8/encounter-generator.js";
import { validateGeneratedNpc } from "../src/client/calculator-v8/generated-npc-invariants.js";

async function fixtures() {
  const [rawBank, rawDict] = await Promise.all([
    readFile(new URL("../src/client/calculator-v8/data/creature-pregens-v2.json", import.meta.url), "utf8"),
    readFile(new URL("../calculator-script-source/Dict.html", import.meta.url), "utf8"),
  ]);
  const catalogs = new Function(`${rawDict.replace(/<\/?script>/g, "")}; return { attacks: ATTACK_LIBRARY, reactions: REACTION_LIBRARY, passives: PASSIVE_TRAITS, reactionMigrationMap: REACTION_MIGRATION_MAP };`)();
  return { bank: migrateCreaturePregenBank(JSON.parse(rawBank), catalogs), catalogs };
}

test("creature pregen bank v2 содержит 125 уникальных концептов", async () => {
  const { bank, catalogs } = await fixtures();
  const validation = validateCreaturePregenBank(bank, catalogs);
  assert.deepEqual(validation, { ok: true, errors: [], count: 125 });
  assert.equal(bank.creatureTypes.length, 5);
  assert.ok(bank.creatureTypes.every((group) => group.pregens.length === 25));
});

test("все ссылки v2 разрешаются только в каталоге своего типа", async () => {
  const { bank, catalogs } = await fixtures();
  for (const pregen of flattenCreaturePregens(bank)) {
    const resolved = resolveCreaturePregen(pregen, catalogs);
    assert.ok(resolved.resolvedAttacks.length >= 1 && resolved.resolvedAttacks.length <= 4);
    assert.ok(resolved.resolvedReactions.length <= 2);
    assert.ok(resolved.resolvedAttacks.every((item) => pregen.hardIdentity.attacks.some((ref) => ref.name === item.name)));
    assert.deepEqual(resolved.resolvedReactions.map((item) => item.name), pregen.hardIdentity.reactions.map((item) => item.name));
  }
});

test("v2 сохраняет hard identity при числовом tuning", async () => {
  const { bank, catalogs } = await fixtures();
  const bear = flattenCreaturePregens(bank).find((pregen) => pregen.creatureType === "animal" && /медвед/i.test(pregen.name))
    || flattenCreaturePregens(bank).find((pregen) => pregen.creatureType === "animal");
  const resolved = resolveCreaturePregen(bear, catalogs);
  const variants = archetypeVariants({ id: resolved.id, name: resolved.name, usage: "archetype", profile: { ...resolved.idealProfile, expl: 3, penetration: 0, archetype: resolved.archetype }, hardIdentity: resolved.hardIdentity });
  assert.ok(variants.some((variant) => variant.tuningDiff.length));
  assert.ok(variants.every((variant) => JSON.stringify(variant.hardIdentity) === JSON.stringify(resolved.hardIdentity)));
});

test("калькулятор загружает creature bank v2 как основной источник архетипов", async () => {
  const [index, script] = await Promise.all([
    readFile(new URL("../calculator-script-source/Index.html", import.meta.url), "utf8"),
    readFile(new URL("../calculator-script-source/Script.html", import.meta.url), "utf8"),
  ]);
  assert.match(index, /creature-pregens\.js/);
  assert.match(index, /mitriniumCreatureBankReady/);
  assert.match(script, /source:'creature-archetype'/);
  assert.match(script, /creatureGenerated\.length\?creatureGenerated:legacyGenerated/);
});

test("калькулятор использует generatedDamageStep и не выпускает automatic d12", async () => {
  const script = await readFile(new URL("../calculator-script-source/Script.html", import.meta.url), "utf8");
  assert.doesNotMatch(script, /\bshiftDamage\s*\(/);
  assert.match(script, /damage:generatedDamageStep\(profile\.damage/);
  assert.match(script, /damage:generatedDamageStep\(entry\.profile\.damage/);
  assert.match(script, /GENERATED_DAMAGE_PROFILES/);
});

test("level-aware creature scaling ограничивает сильный ideal на первом уровне и сохраняет Nerve/PZ", () => {
  const baselines = [null, { hp: 22, armor: 1, pool: 4, damage: "d6" }, { hp: 62, armor: 4, pool: 8, damage: "d12" }];
  const authored = { body: 60, armor: 8, pz: 6, nerve: 18, pool: 8, damage: "d12", penetration: 2, archetype: "standard" };
  const levelOne = scaleCreatureProfileForLevel(authored, "standard", 1, baselines, "beast");
  const highLevel = scaleCreatureProfileForLevel(authored, "standard", 2, baselines, "beast");
  assert.ok(levelOne.body <= 16 && levelOne.armor <= 3 && levelOne.pool <= 5);
  assert.ok(highLevel.body > levelOne.body && highLevel.pool > levelOne.pool);
  assert.equal(levelOne.nerve, 18);
  assert.equal(highLevel.nerve, 18);
  assert.equal(levelOne.pz, 6);
  assert.equal(highLevel.pz, 6);
});

test("весь creature bank соблюдает generated invariants на низком и высоком уровне", async () => {
  const { bank, catalogs } = await fixtures();
  const baselines = [null, { hp: 22, armor: 1, pool: 4, damage: "d6" }, ...Array.from({ length: 19 }, (_, index) => ({ hp: 24 + index * 2, armor: 1 + Math.floor(index / 5), pool: 4 + Math.floor(index / 5), damage: index > 14 ? "d12" : "d8" }))];
  for (const pregen of flattenCreaturePregens(bank)) {
    const resolved = resolveCreaturePregen(pregen, catalogs);
    for (const level of [1, 20]) {
      const profile = scaleCreatureProfileForLevel(resolved.idealProfile, resolved.archetype, level, baselines, resolved.creatureType);
      assert.equal(validateGeneratedNpc(profile, resolved.creatureType), true, `${resolved.id}/level-${level}`);
    }
  }
});

test("UI использует выбранный party level и объясняет authored Nerve выше 10", async () => {
  const script = await readFile(new URL("../calculator-script-source/Script.html", import.meta.url), "utf8");
  assert.match(script, /scaleCreatureProfileForLevel\(authoredProfile,resolved\.archetype,settings\.level\|\|1,LEVEL_BASELINES,resolved\.creatureType\)/);
  assert.match(script, /Запас Нерва позволяет использовать его для получения преимущества\./);
  assert.match(script, /Справочная БС/);
});
