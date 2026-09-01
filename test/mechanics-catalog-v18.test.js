import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildMechanicsCatalogV18,
  DEFAULT_MECHANICS_CATALOG_V18_PATH,
} from "../scripts/export-mechanics-catalog-v18.mjs";

const TYPES = ["humanoid", "mechanism", "animal", "beast", "undead"];
const OFFENSIVE_REACTION_KINDS = new Set([
  "normal_attack",
  "power_attack",
  "advantage_attack",
  "multiattack",
  "aoe_attack",
  "armor_break",
  "accuracy_debuff",
  "damage_debuff",
  "vulnerability",
  "nerve_damage",
  "heal_attack",
  "heal_action",
]);

async function artifact() {
  return JSON.parse(await readFile(DEFAULT_MECHANICS_CATALOG_V18_PATH, "utf8"));
}

test("mechanics catalog V18 детерминированно экспортируется из реальной site library", async () => {
  const [generated, saved] = await Promise.all([buildMechanicsCatalogV18(), artifact()]);
  assert.deepEqual(saved, generated);
  assert.equal(saved.source, "calculator-script-source/Dict.html");
  assert.equal(saved.runtime_contract.production_predictor, "v15");
  for (const type of TYPES) {
    assert.ok(saved.actions[type].length > 0, type);
    assert.ok(saved.specials[type].length > 0, type);
    assert.ok(saved.reactions[type].length > 0, type);
  }
});

test("V18 loader shape получает specials/reactions без offensive reactions", async () => {
  const data = await artifact();
  const specials = data.specials;
  const reactions = data.reactions;
  assert.ok(specials && reactions);
  for (const reaction of Object.values(reactions).flat()) {
    assert.ok(!OFFENSIVE_REACTION_KINDS.has(reaction.kind), `${reaction.id}: ${reaction.kind}`);
    assert.ok(Number.isFinite(reaction.uses));
  }
});

test("реальная production library покрывает согласованные V18 mechanic kinds", async () => {
  const data = await artifact();
  const actionKinds = new Set(Object.values(data.actions).flat().map((item) => item.kind));
  for (const kind of [
    "normal_attack", "power_attack", "advantage_attack", "multiattack", "aoe_attack",
    "armor_break", "accuracy_debuff", "damage_debuff", "vulnerability", "movement_debuff",
    "nerve_damage", "heal_attack", "heal_action",
  ]) assert.ok(actionKinds.has(kind), kind);
  assert.ok(Object.values(data.specials).flat().some((item) => item.ultimate === true));
  assert.ok(Object.values(data.passives).flat().length > 0);
});

test("ultimate metadata экспортируется без скрытого damage multiplier", async () => {
  const data = await artifact();
  const ultimates = Object.values(data.specials).flat().filter((item) => item.ultimate === true);
  assert.ok(ultimates.length >= 1);
  assert.ok(ultimates.every((item) => item.uses >= 1));
  assert.ok(ultimates.every((item) => item.ultimate_multiplier === undefined));
  const crush = ultimates.find((item) => item.id === "beast_special_crush");
  assert.deepEqual(
    { damage_step: crush.damage_step, penetration_bonus: crush.penetration_bonus },
    { damage_step: 1, penetration_bonus: 1 },
  );
});

test("multiattack metadata сохраняет независимые rolls и targeting", async () => {
  const data = await artifact();
  const multiattacks = Object.values(data.specials).flat().filter((item) => item.kind === "multiattack");
  assert.ok(multiattacks.length >= 3);
  for (const item of multiattacks) {
    assert.ok(Number.isInteger(item.multiattack.attacks) && item.multiattack.attacks >= 2, item.id);
    assert.ok(["focus", "split", "split_or_focus"].includes(item.multiattack.targeting), item.id);
    assert.ok(item.multiattack.max_targets >= 1 && item.multiattack.max_targets <= item.multiattack.attacks, item.id);
    assert.equal(item.dpr_multiplier, undefined);
  }
});

test("enemy Nerve и pacing остаются runtime policy, а не generator sliders", async () => {
  const data = await artifact();
  assert.equal(data.runtime_contract.enemy_nerve.spend, "normal_to_advantage_only");
  assert.deepEqual(data.runtime_contract.enemy_nerve.never_spend_for, ["hindrance_to_normal", "already_advantage"]);
  assert.deepEqual(data.runtime_contract.generator_axes, ["party_win_probability", "mean_pc_ko_fraction"]);
  assert.equal(data.runtime_contract.pacing.role, "quality_guardrail");
});
