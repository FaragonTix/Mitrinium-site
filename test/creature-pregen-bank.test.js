import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  flattenCreaturePregens,
  resolveCreaturePregen,
  validateCreaturePregenBank,
} from "../src/client/calculator-v8/creature-pregens.js";
import { archetypeVariants } from "../src/client/calculator-v8/encounter-generator.js";

async function fixtures() {
  const [rawBank, rawDict] = await Promise.all([
    readFile(new URL("../src/client/calculator-v8/data/creature-pregens-v2.json", import.meta.url), "utf8"),
    readFile(new URL("../calculator-script-source/Dict.html", import.meta.url), "utf8"),
  ]);
  const catalogs = new Function(`${rawDict.replace(/<\/?script>/g, "")}; return { attacks: ATTACK_LIBRARY, reactions: REACTION_LIBRARY };`)();
  return { bank: JSON.parse(rawBank), catalogs };
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
    assert.equal(resolved.resolvedAttacks.length, pregen.hardIdentity.attacks.length);
    assert.equal(resolved.resolvedReactions.length, pregen.hardIdentity.reactions.length);
    assert.deepEqual(resolved.resolvedAttacks.map((item) => item.name), pregen.hardIdentity.attacks.map((item) => item.name));
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

test("калькулятор использует существующий damageStep для урона существ", async () => {
  const script = await readFile(new URL("../calculator-script-source/Script.html", import.meta.url), "utf8");
  assert.doesNotMatch(script, /\bshiftDamage\s*\(/);
  assert.match(script, /damage:damageStep\(profile\.damage/);
  assert.match(script, /damage:damageStep\(entry\.profile\.damage/);
});
