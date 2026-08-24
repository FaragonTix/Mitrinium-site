import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import {
  BASE_FEATURE_ORDER,
  characterSheetToCombatProfile,
  computeEncounterFeatures,
  normalizeCombatProfile,
  predictEncounter,
  pzFromAttributes,
} from "../src/client/calculator-v8/mitrinium-v8-core.js";
import { predictMitriniumV15 } from "../src/client/calculator-v8/mitrinium_runtime_v15_predictor.js";

const runtimeUrl = new URL("../src/client/calculator-v8/mitrinium_runtime_v15.min.json", import.meta.url);
const bundle = JSON.parse(await readFile(runtimeUrl, "utf8"));
const byArchetype = (name) => bundle.unit_library.find((unit) => unit.archetype === name);
const standard = byArchetype("standard");
const boss = byArchetype("boss");
const minion = byArchetype("minion");

const scenarios = [
  ["1 PC vs 1 enemy", [standard], [standard]],
  ["standard party of four", Array(4).fill(standard), [standard, standard]],
  ["heterogeneous party", [standard, byArchetype("tank"), byArchetype("striker"), byArchetype("shooter")], [standard, standard]],
  ["boss and minions", Array(4).fill(standard), [boss, minion, minion, minion]],
  ["identical enemies", Array(4).fill(standard), Array(5).fill(standard)],
];

test("V15 bundle exposes the frozen base and expanded contracts", () => {
  assert.deepEqual(BASE_FEATURE_ORDER, bundle.base_feature_order);
  assert.equal(bundle.required_expanded_features.length, 24);
  assert.deepEqual(bundle.generator_primary_axes, ["party_win_probability", "mean_pc_ko_fraction"]);
  assert.equal(bundle.runtime_simulation, false);
});

for (const [name, party, enemies] of scenarios) {
  test(`V15 deterministic integration: ${name}`, () => {
    const result = predictEncounter(bundle, party, enemies);
    assert.equal(result.mode, "normal-v15");
    assert.deepEqual(Object.keys(result.expandedFeatures).sort(), [...bundle.required_expanded_features].sort());
    for (const [feature, value] of Object.entries(result.expandedFeatures)) {
      assert.ok(Number.isFinite(value), `${feature} must be finite, got ${value}`);
    }
    assert.ok(result.prediction.party_win_probability >= 0 && result.prediction.party_win_probability <= 1);
    assert.ok(result.prediction.mean_pc_ko_fraction >= 0 && result.prediction.mean_pc_ko_fraction <= 1);
    assert.ok(result.prediction.p_any_pc_ko >= 0 && result.prediction.p_any_pc_ko <= 1);
    assert.ok(Number.isFinite(result.prediction.mean_rounds));
    assert.ok(result.prediction.mean_party_body_loss_fraction >= 0 && result.prediction.mean_party_body_loss_fraction <= 1);
  });
}

test("V15 reuses the V6 deterministic base feature geometry", () => {
  const result = computeEncounterFeatures(bundle, [minion], [boss]);
  assert.ok(Math.abs(result.features.log_clear_time_ratio - 2.625588590775038) < 1e-12);
  assert.ok(Math.abs(result.features.log_pressure_integral_ratio - 2.5157399208511864) < 1e-12);
  assert.ok(Math.abs(result.diagnostics.partyClearTime - 27.02118836034979) < 1e-12);
  assert.ok(Math.abs(result.diagnostics.enemyClearTime - 1.9562565461154588) < 1e-12);
  assert.equal(result.expandedFeatures.dynamic_enemy_kill_fraction, 1);
  assert.equal(result.expandedFeatures.dynamic_party_kill_fraction, 0);
});

test("V15 JS predictor is deterministic and consumes the explicit expanded map", () => {
  const computed = computeEncounterFeatures(bundle, Array(4).fill(standard), [boss, minion, minion]);
  const first = predictMitriniumV15(bundle, computed.vector, computed.expandedFeatures);
  const second = predictMitriniumV15(bundle, computed.vector, computed.expandedFeatures);
  assert.deepEqual(first, second);
  assert.throws(() => predictMitriniumV15(bundle, computed.vector, {}), /Missing V15 feature/);
});

test("obvious enemy count increases are monotone as a smoke check", () => {
  const party = Array(4).fill(standard);
  const predictions = Array.from({ length: 6 }, (_, index) => predictEncounter(bundle, party, Array(index + 1).fill(standard)).prediction);
  for (let index = 1; index < predictions.length; index += 1) {
    assert.ok(predictions[index].party_win_probability <= predictions[index - 1].party_win_probability);
    assert.ok(predictions[index].mean_pc_ko_fraction >= predictions[index - 1].mean_pc_ko_fraction);
  }
});

test("PZ 7+ is not a separate runtime regime", () => {
  assert.equal(normalizeCombatProfile({ ...standard, pz: 7 }).pz, 6);
  assert.equal(normalizeCombatProfile({ ...standard, pz: 99 }).pz, 6);
  assert.equal(pzFromAttributes(2, 2), 4);
  const result = predictEncounter(bundle, [standard], [{ ...standard, pz: 7 }]);
  assert.equal(result.mode, "normal-v15");
  assert.equal(result.extreme, false);
});

test("existing character sheets still convert to combat profiles", () => {
  const result = characterSheetToCombatProfile({
    name: "Ирма",
    isComplete: true,
    attributes: { napor: 3, snorovka: 2, nyuh: 3, smetka: 1, gospodstvo: 2 },
    skills: { nyuh: { strelba: 2 }, napor: { fehtovanie: 1 } },
    resources: { body: 14, protection: 4 },
    state: { initialized: true, currentBody: 9, currentArmor: 1, maxArmor: 2 },
    equipment: ["pistol", "knife"],
  }, [
    { id: "pistol", name: "Пистоль", pool: "Нюх + Стрельба", damage: "d6", exploitation: 3, tags: ["Пробитие 1"] },
    { id: "knife", name: "Нож", pool: "Напор + Фехтование", damage: "d6", exploitation: 3, tags: [] },
  ], "pistol");
  assert.deepEqual({
    body: result.profile.body,
    armor: result.profile.armor,
    pz: result.profile.pz,
    pool: result.profile.pool,
    damage: result.profile.damage,
    penetration: result.profile.penetration,
  }, { body: 9, armor: 1, pz: 4, pool: 5, damage: "d6", penetration: 1 });
});

test("legacy BP and action multipliers do not alter V15 inputs", () => {
  const party = Array(4).fill(standard);
  const base = predictEncounter(bundle, party, [{ ...standard, bp: 1000, actionMultiplier: 1 }]);
  const legacyChanged = predictEncounter(bundle, party, [{ ...standard, bp: 5000, actionMultiplier: 9 }]);
  assert.deepEqual(base.vector, legacyChanged.vector);
  assert.deepEqual(base.expandedFeatures, legacyChanged.expandedFeatures);
  assert.deepEqual(base.prediction, legacyChanged.prediction);
});

test("production V15 assets match the supplied export manifest and contain no Monte-Carlo", async () => {
  const manifest = JSON.parse(await readFile(new URL("../src/client/calculator-v8/manifest_v15.json", import.meta.url), "utf8"));
  for (const file of manifest.files) {
    const url = new URL(`../src/client/calculator-v8/${file.name}`, import.meta.url);
    const bytes = await readFile(url);
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
  }
  const [runtimeStat, predictorStat, coreSource] = await Promise.all([
    stat(runtimeUrl),
    stat(new URL("../src/client/calculator-v8/mitrinium_runtime_v15_predictor.js", import.meta.url)),
    readFile(new URL("../src/client/calculator-v8/mitrinium-v8-core.js", import.meta.url), "utf8"),
  ]);
  assert.ok(runtimeStat.size + predictorStat.size < 50 * 1024 * 1024);
  assert.doesNotMatch(coreSource, /Math\.random|monte.?carlo/i);
});
