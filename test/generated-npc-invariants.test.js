import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  finalizeGeneratedNpc,
  validateGeneratedNpc,
  weaponTFromDamage,
} from "../src/client/calculator-v8/generated-npc-invariants.js";
import { archetypeVariants } from "../src/client/calculator-v8/encounter-generator.js";

const combatProfile = (overrides = {}) => ({
  body: 8, armor: 1, pz: 4, nerve: 4, pool: 4, expl: 3, damage: "d6", penetration: 0, archetype: "minion", ...overrides,
});

test("самый слабый automatic minion получает Body >=4 и PZ >=3", () => {
  const variants = archetypeVariants({ id: "weak-minion", usage: "archetype", typeKey: "humanoid", profile: combatProfile({ body: 1, pz: 2, nerve: 18 }) });
  assert.ok(variants.every((entry) => entry.profile.body >= 4));
  assert.ok(variants.every((entry) => entry.profile.pz >= 3 && entry.profile.pz <= 6));
  assert.ok(variants.every((entry) => entry.profile.nerve >= 3 && entry.profile.nerve <= 6));
});

test("ручной exact statblock не проходит automatic clamps", () => {
  const manual = combatProfile({ body: 1, pz: 2, nerve: 18 });
  const [entry] = archetypeVariants({ id: "manual", usage: "exact", typeKey: "humanoid", profile: manual });
  assert.deepEqual(entry.profile, manual);
});

test("type envelopes нормализуют Nerve без difficulty multiplier", () => {
  assert.equal(finalizeGeneratedNpc(combatProfile({ nerve: 18 }), "humanoid").nerve, 6);
  assert.equal(finalizeGeneratedNpc(combatProfile({ nerve: 12 }), "animal").nerve, 3);
  assert.equal(finalizeGeneratedNpc(combatProfile({ nerve: 12 }), "beast").nerve, 12);
  assert.equal(finalizeGeneratedNpc(combatProfile({ nerve: 1 }), "beast").nerve, 5);
  assert.equal(finalizeGeneratedNpc(combatProfile({ nerve: 12 }), "mechanism").nerve, 0);
  assert.equal(finalizeGeneratedNpc(combatProfile({ nerve: 12 }), "undead").nerve, 0);
});

test("T автоматически следует базовому кубу урона и игнорирует +1", () => {
  assert.deepEqual(
    ["d4", "d4+1", "d6", "d6+1", "d8", "d8+1", "d10", "d10+1"].map((damage) => weaponTFromDamage(damage)),
    [2, 2, 3, 3, 4, 4, 5, 5],
  );
  assert.equal(weaponTFromDamage("d12", 7), 7);
});

test("automatic damage tuning синхронно обновляет T, manual exact не меняется", () => {
  const variants = archetypeVariants({ id: "weapon-t", usage: "archetype", typeKey: "humanoid", profile: combatProfile({ damage: "d8+1", expl: 12 }) });
  assert.ok(variants.every((entry) => entry.profile.expl === weaponTFromDamage(entry.profile.damage)));
  const [manual] = archetypeVariants({ id: "manual-t", usage: "exact", typeKey: "humanoid", profile: combatProfile({ damage: "d8+1", expl: 12 }) });
  assert.equal(manual.profile.expl, 12);
});

test("Easy -> Hard variants humanoid не меняют Nerve и default PZ", () => {
  const variants = archetypeVariants({ id: "human-difficulty", usage: "archetype", typeKey: "humanoid", profile: combatProfile({ body: 14, pz: 4, nerve: 18, archetype: "elite" }) });
  assert.ok(variants.some((entry) => entry.profile.body !== 14 || entry.profile.pool !== 4));
  assert.ok(variants.every((entry) => entry.profile.nerve === 6));
  assert.ok(variants.every((entry) => entry.profile.pz === 4));
});

test("explicit PZ tuning остаётся внутри generator envelope 3..6", () => {
  const variants = archetypeVariants({ id: "explicit-pz-envelope", usage: "archetype", typeKey: "beast", profile: combatProfile({ pz: 3, nerve: 12 }), tuningPolicy: { tunable: { pz: true } } });
  assert.ok(variants.some((entry) => entry.profile.pz > 3));
  assert.ok(variants.every((entry) => entry.profile.pz >= 3 && entry.profile.pz <= 6));
});

test("validator бросает ошибку на нарушении вместо выпуска плохого statblock", () => {
  assert.throws(() => validateGeneratedNpc({ body: 3, pz: 2, nerve: 18 }, "humanoid"), /Generated NPC invariant failed/);
  assert.throws(() => validateGeneratedNpc({ body: 4, pz: 3, nerve: 4 }, "mechanism"), /expected 0/);
  assert.equal(validateGeneratedNpc({ body: 4, pz: 3, nerve: 12 }, "beast"), true);
});

test("procedural generator удалил ratio-based Nerve scaling и валидирует build/apply paths", async () => {
  const [script, index] = await Promise.all([
    readFile(new URL("../calculator-script-source/Script.html", import.meta.url), "utf8"),
    readFile(new URL("../calculator-script-source/Index.html", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(script, /Math\.pow\(ratio,\.40\)/);
  assert.match(script, /nerve=type\.nerve===0\?0:Math\.round\(4\*type\.nerve\*cls\.nerve\)/);
  assert.match(script, /validateGeneratedNpc\(\{body:profile\.hp,pz:profile\.pz,nerve:profile\.nerve\},safeType\)/);
  assert.match(script, /const generatedProfile=finalizeGeneratedProfile\(\{\.\.\.profile,damage:generatedDamageStep\(profile\.damage,0\)\},enemy\.typeKey\)/);
  assert.match(script, /function withGeneratedWeaponT\(attack\)/);
  assert.match(script, /attacks\[0\]=withGeneratedWeaponT/);
  assert.doesNotMatch(script, />Expl</);
  assert.match(index, /generated-npc-invariants\.js/);
  assert.doesNotMatch(index, /пула, Expl/);
});
