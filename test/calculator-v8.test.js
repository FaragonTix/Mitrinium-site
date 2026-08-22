import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import {
  BASE_FEATURE_ORDER,
  characterSheetToCombatProfile,
  computeEncounterFeatures,
  normalizeCombatProfile,
  predictEncounter,
  pzFromAttributes,
} from "../src/client/calculator-v8/mitrinium-v8-core.js";
import { predictMitriniumV8 } from "../src/client/calculator-v8/mitrinium_runtime_v8_predictor.js";

const runtimeUrl = new URL("../src/client/calculator-v8/mitrinium_runtime_v8.min.json", import.meta.url);
const bundle = JSON.parse(await readFile(runtimeUrl, "utf8"));

function unit(archetype, body) {
  return bundle.unit_library.find((profile) => profile.archetype === archetype && (body === undefined || profile.body === body));
}

const standard = unit("standard", 12);
const minion = unit("minion", 8);
const boss = unit("boss");
const tank = unit("tank", 16);
const striker = unit("striker", 10);

test("v8: один обычный враг даёт четыре production-прогноза", () => {
  const result = predictEncounter(bundle, Array(4).fill(standard), [standard]);
  assert.deepEqual(Object.keys(result.prediction), bundle.outcome_order);
  assert.equal(result.mode, "normal-v8");
});

test("v8: несколько одинаковых врагов пересчитываются как группа", () => {
  const party = Array(4).fill(standard);
  const one = predictEncounter(bundle, party, [standard]);
  const three = predictEncounter(bundle, party, Array(3).fill(standard));
  assert.notDeepEqual(one.vector, three.vector);
  assert.notEqual(one.prediction.party_win_probability, three.prediction.party_win_probability);
});

test("v8: boss + minions сохраняет неоднородное распределение", () => {
  const result = predictEncounter(bundle, Array(4).fill(standard), [boss, minion, minion, minion]);
  assert.ok(result.features.enemy_durability_hhi > 0.25);
  assert.ok(result.features.enemy_survivability_cv > 0);
});

test("v8: tank + glass cannon учитывает раздельные survivability и pressure", () => {
  const result = computeEncounterFeatures(bundle, Array(4).fill(standard), [tank, striker]);
  assert.ok(result.features.enemy_survivability_cv > 0);
  assert.ok(result.features.enemy_pressure_cv > 0);
  assert.notEqual(result.features.enemy_survival_pressure_corr, 0);
});

test("v8: похожая суммарная живучесть не стирает распределение силы", () => {
  const party = Array(4).fill(standard);
  const concentrated = computeEncounterFeatures(bundle, party, [{ ...standard, body: 24 }, { ...standard, body: 2 }]);
  const even = computeEncounterFeatures(bundle, party, [{ ...standard, body: 13 }, { ...standard, body: 13 }]);
  assert.ok(concentrated.features.enemy_durability_hhi > even.features.enemy_durability_hhi);
  assert.notDeepEqual(concentrated.vector, even.vector);
});

test("v8: размер партии 4 поддерживается", () => {
  const result = predictEncounter(bundle, Array(4).fill(standard), [boss]);
  assert.equal(result.features.log_count_ratio, Math.log(1 / 4));
});

test("v8: размер партии 5 пересчитывает count ratio и прогноз", () => {
  const four = predictEncounter(bundle, Array(4).fill(standard), [boss]);
  const five = predictEncounter(bundle, Array(5).fill(standard), [boss]);
  assert.equal(five.features.log_count_ratio, Math.log(1 / 5));
  assert.notEqual(four.prediction.party_win_probability, five.prediction.party_win_probability);
});

test("v8: heterogeneity >= 1 включает предусмотренный outcome runtime rule", () => {
  const glass = { ...striker, body: 1, armor: 0 };
  const wall = { ...tank, body: 120, armor: 5 };
  const result = predictEncounter(bundle, Array(4).fill(standard), [wall, glass, glass, glass, glass]);
  assert.ok(Math.max(result.features.enemy_survivability_cv, result.features.enemy_pressure_cv) >= 1);
  assert.equal(bundle.heads.p_any_pc_ko.runtime_rule.type, "heterogeneity_switch");
  assert.ok(Number.isFinite(result.prediction.p_any_pc_ko));
});

test("v8: PZ 7+ не проходит через normal calibration", () => {
  const result = predictEncounter(bundle, Array(4).fill({ ...standard, pz: 7 }), [standard]);
  assert.equal(result.extreme, true);
  assert.equal(result.mode, "extreme-reference");
  assert.ok(Number.isInteger(result.referenceIndex));
});

test("v8: актуальная формула PZ", () => {
  assert.equal(pzFromAttributes(0, 0), 2);
  assert.equal(pzFromAttributes(3, 2), 5);
  assert.equal(normalizeCombatProfile({ agility: 4, wits: 5 }).pz, 7);
});

test("v8: сохранённый лист персонажа превращается в реальный боевой профиль", () => {
  const character = {
    name: "Ирма",
    isComplete: true,
    attributes: { napor: 3, snorovka: 2, nyuh: 3, smetka: 1, gospodstvo: 2 },
    skills: { nyuh: { strelba: 2 }, napor: { fehtovanie: 1 } },
    resources: { body: 14, protection: 4 },
    state: { initialized: true, currentBody: 9, currentArmor: 1, maxArmor: 2 },
    equipment: ["pistol", "nozh"],
  };
  const equipment = [
    { id: "pistol", name: "Пистоль", pool: "Нюх + Стрельба", damage: "d6", exploitation: 3, tags: ["Пробитие 1"] },
    { id: "nozh", name: "Нож", pool: "Напор + Фехтование", damage: "d6", exploitation: 3, tags: [] },
  ];

  const result = characterSheetToCombatProfile(character, equipment, "pistol");

  assert.equal(result.profile.name, "Ирма");
  assert.equal(result.profile.body, 9);
  assert.equal(result.profile.armor, 1);
  assert.equal(result.profile.pz, 4);
  assert.equal(result.profile.pool, 5);
  assert.equal(result.profile.damage, "d6");
  assert.equal(result.profile.penetration, 1);
  assert.equal(result.selectedWeaponId, "pistol");
  assert.deepEqual(result.weapons.map((weapon) => weapon.id).sort(), ["nozh", "pistol"]);
});

test("v8: незапущенный лист использует максимальные ресурсы и выбранное оружие", () => {
  const result = characterSheetToCombatProfile({
    isComplete: false,
    attributes: { napor: 1, snorovka: 3, nyuh: 1, smetka: 2 },
    skills: { snorovka: { lovkostRuk: 2 } },
    resources: { body: 12, protection: 5 },
    state: { initialized: false, maxArmor: 3 },
    equipment: ["blade"],
  }, [{
    id: "blade",
    name: "Клинок",
    pool: "Сноровка + Ловкость рук",
    damage: "d8+1",
    exploitation: 4,
  }]);

  assert.equal(result.profile.body, 12);
  assert.equal(result.profile.armor, 3);
  assert.equal(result.profile.pool, 5);
  assert.equal(result.profile.damage, "d8+1");
  assert.equal(result.isComplete, false);
  assert.equal(result.usesCurrentState, false);
});

test("v8: legacy BP и count multiplier не влияют на production prediction", () => {
  const party = Array(4).fill(standard);
  const base = predictEncounter(bundle, party, [{ ...standard, bp: 1000, actionMultiplier: 1 }]);
  const legacyChanged = predictEncounter(bundle, party, [{ ...standard, bp: 5000, actionMultiplier: 9 }]);
  assert.deepEqual(base.vector, legacyChanged.vector);
  assert.deepEqual(base.prediction, legacyChanged.prediction);
});

test("v8 exact core совпадает с приложенным reference-вектором", () => {
  const result = computeEncounterFeatures(bundle, [minion], [boss]);
  const expected = [2.625588590775038, 0, 1, 1, 0, 0, 0, 0, 2.5157399208511864];
  assert.deepEqual(BASE_FEATURE_ORDER, bundle.base_feature_order);
  result.vector.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-12));
});

test("v8 JS predictor детерминирован и совпадает с зафиксированным export-вызовом", () => {
  const vector = [2.625588590775038, 0, 1, 1, 0, 0, 0, 0, 2.5157399208511864];
  const first = predictMitriniumV8(bundle, vector);
  const second = predictMitriniumV8(bundle, vector);
  assert.deepEqual(first, second);
  assert.ok(Math.abs(first.party_win_probability - 0.014284648212221867) < 1e-15);
  assert.ok(Math.abs(first.p_any_pc_ko - 0.976788882042546) < 1e-15);
  assert.ok(Math.abs(first.mean_rounds - 1.7346090849857563) < 1e-15);
  assert.ok(Math.abs(first.mean_party_body_loss_fraction - 0.9979599660450722) < 1e-15);
});

test("v8 production assets меньше 50 MB и не включают runtime Monte-Carlo", async () => {
  const [runtimeSize, predictorSize, coreSize, manifestSize, coreSource] = await Promise.all([
    stat(runtimeUrl),
    stat(new URL("../src/client/calculator-v8/mitrinium_runtime_v8_predictor.js", import.meta.url)),
    stat(new URL("../src/client/calculator-v8/mitrinium-v8-core.js", import.meta.url)),
    stat(new URL("../src/client/calculator-v8/manifest_v8.json", import.meta.url)),
    readFile(new URL("../src/client/calculator-v8/mitrinium-v8-core.js", import.meta.url), "utf8"),
  ]);
  assert.ok(runtimeSize.size + predictorSize.size + coreSize.size + manifestSize.size < 50 * 1024 * 1024);
  assert.equal(bundle.runtime_simulation, false);
  assert.doesNotMatch(coreSource, /Math\.random|Monte[ -]?Carlo/i);
});
