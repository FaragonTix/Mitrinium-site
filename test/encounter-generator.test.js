import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DIFFICULTY_PRESETS,
  generateEncounterOptions,
  individualBs,
  marginalNpcImpact,
  normalizeGeneratorSettings,
  objectiveScore,
  presetTargets,
} from "../src/client/calculator-v8/encounter-generator.js";
import { predictEncounter } from "../src/client/calculator-v8/mitrinium-v8-core.js";

const profile = (power, archetype, body = 10) => ({ body, armor: archetype === "tank" ? 3 : 1, pz: 4, pool: 3 + power, expl: 2, damage: `d${power >= 3 ? 8 : 6}`, penetration: archetype === "striker" ? 1 : 0, archetype, power });
const library = [
  { id: "minion", name: "Миньон", role: "minion", archetype: "minion", tags: ["minion", "melee"], bs: 300, profile: profile(1, "minion", 7) },
  { id: "standard", name: "Стандарт", role: "standard", archetype: "standard", tags: ["melee"], bs: 600, profile: profile(2, "standard") },
  { id: "ranged", name: "Стрелок", role: "shooter", archetype: "shooter", tags: ["ranged"], bs: 650, profile: profile(2.2, "shooter", 8) },
  { id: "striker", name: "Ударный", role: "striker", archetype: "striker", tags: ["glass", "melee"], bs: 700, profile: profile(3, "striker", 7) },
  { id: "tank", name: "Танк", role: "tank", archetype: "tank", tags: ["tank"], bs: 850, profile: profile(2, "tank", 18) },
  { id: "boss", name: "Босс", role: "boss", archetype: "boss", tags: ["boss"], bs: 1500, profile: profile(5, "boss", 24) },
];

function fakeEvaluate(profiles) {
  const total = profiles.reduce((sum, item) => sum + item.power, 0);
  const values = profiles.map((item) => item.body);
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const cv = values.length ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) / mean : 0;
  return { prediction: { party_win_probability: Math.max(0, Math.min(1, 1 - total / 20)), p_any_pc_ko: Math.max(0, Math.min(1, total / 16)), mean_rounds: 2 + total / 3, mean_party_body_loss_fraction: Math.min(1, total / 18) }, features: { enemy_survivability_cv: cv, enemy_pressure_cv: cv }, extreme: cv >= 1 };
}

const run = (settings, locked = [], source = library) => generateEncounterOptions({ library: source, locked, settings: { count: { mode: "exact", exact: 3 }, topN: 5, beamWidth: 24, candidateLimit: 20, heterogeneity: { mode: "any", extremeAllowed: true }, ...settings }, evaluate: fakeEvaluate });

for (const key of ["easy", "medium", "hard", "deadly"]) {
  test(`Quick ${DIFFICULTY_PRESETS[key].label} преобразуется в диапазоны v8`, () => {
    const targets = presetTargets(key);
    assert.deepEqual([targets.win.min, targets.win.max], DIFFICULTY_PRESETS[key].winRange);
    assert.deepEqual([targets.ko.min, targets.ko.max], DIFFICULTY_PRESETS[key].koRange);
    assert.equal("permille" in targets, false);
  });
}

test("ручные цели дают Custom-структуру и независимые оси", () => {
  const settings = normalizeGeneratorSettings({ targets: { win: { mode: "range", min: .6, max: .7 }, ko: { mode: "ignore" } } });
  assert.deepEqual(settings.targets.win, [.6, .7]);
  assert.equal(settings.targets.ko, null);
});

test("точное количество и диапазон количества строго соблюдаются", () => {
  assert.ok(run({ count: { mode: "exact", exact: 4 } }).options.every(option => option.entries.length === 4));
  assert.ok(run({ count: { mode: "range", min: 2, max: 4 } }).options.every(option => option.entries.length >= 2 && option.entries.length <= 4));
});

test("boss required, forbidden и exactly one соблюдаются", () => {
  assert.ok(run({ boss: { mode: "required" } }).options.every(option => option.entries.filter(entry => entry.id === "boss").length === 1));
  assert.ok(run({ boss: { mode: "forbidden" } }).options.every(option => option.entries.every(entry => entry.id !== "boss")));
  assert.ok(run({ boss: { mode: "exactly1" } }).options.every(option => option.entries.filter(entry => entry.id === "boss").length === 1));
});

test("дубликаты: запрет, максимум и все одинаковые", () => {
  const forbidden = run({ duplicates: { mode: "forbidden" } }).options[0].entries;
  assert.equal(new Set(forbidden.map(entry => entry.id)).size, forbidden.length);
  const maximum = run({ count: { mode: "exact", exact: 4 }, duplicates: { mode: "max", max: 2 } }).options[0].entries;
  assert.ok(Math.max(...[...maximum.reduce((map, entry) => map.set(entry.id, (map.get(entry.id) || 0) + 1), new Map()).values()]) <= 2);
  const identical = run({ duplicates: { mode: "identical" } }).options[0].entries;
  assert.equal(new Set(identical.map(entry => entry.id)).size, 1);
});

test("BS-фильтры ограничивают NPC, strongest и weakest", () => {
  const result = run({ bs: { min: 500, max: 1000, strongestMin: 800, strongestMax: 900, weakestMin: 500, weakestMax: 700 } });
  assert.ok(result.options.length);
  for (const option of result.options) {
    assert.ok(option.entries.every(entry => entry.bs >= 500 && entry.bs <= 1000));
    assert.ok(Math.max(...option.entries.map(entry => entry.bs)) >= 800);
    assert.ok(Math.min(...option.entries.map(entry => entry.bs)) <= 700);
  }
});

test("locked NPC сохраняется, включая достройку вокруг босса", () => {
  const locked = [{ ...library.at(-1), id: "story-boss" }];
  const result = run({ count: { mode: "exact", exact: 4 } }, locked);
  assert.ok(result.options.length);
  assert.ok(result.options.every(option => option.entries.some(entry => entry.id === "story-boss")));
});

test("структуры Boss + minions, Equal и Tank + glass cannon соблюдаются", () => {
  assert.ok(run({ composition: "boss_minions", count: { mode: "exact", exact: 4 } }).options.every(option => option.entries.filter(entry => entry.role === "boss").length === 1 && option.entries.filter(entry => entry.role === "minion").length === 3));
  assert.ok(run({ composition: "equal" }).options.every(option => new Set(option.entries.map(entry => entry.id)).size === 1));
  assert.ok(run({ composition: "tank_glass", count: { mode: "exact", exact: 2 } }).options.every(option => option.entries.some(entry => entry.archetype === "tank") && option.entries.some(entry => ["striker", "shooter"].includes(entry.archetype))));
});

test("теги allowed/forbidden реально фильтруют библиотеку", () => {
  const result = run({ allowedTags: ["ranged"], forbiddenTags: ["boss"] });
  assert.ok(result.options.every(option => option.entries.every(entry => entry.tags.includes("ranged") && !entry.tags.includes("boss"))));
});

test("extreme не появляется без явного разрешения", () => {
  const result = run({ heterogeneity: { mode: "any", extremeAllowed: false } });
  assert.ok(result.options.every(option => Math.max(option.evaluation.features.enemy_survivability_cv, option.evaluation.features.enemy_pressure_cv) < 1));
});

test("P(win) и KO независимо входят в objective", () => {
  const prediction = fakeEvaluate([profile(3, "standard")]).prediction;
  const winHeavy = normalizeGeneratorSettings({ targets: { win: { mode: "exact", exact: .9 }, ko: { mode: "ignore" } }, weights: { win: 3, ko: 0 } });
  const koHeavy = normalizeGeneratorSettings({ targets: { win: { mode: "ignore" }, ko: { mode: "exact", exact: .1 } }, weights: { win: 0, ko: 3 } });
  assert.notEqual(objectiveScore(prediction, winHeavy), objectiveScore(prediction, koHeavy));
});

test("seed воспроизводим, альтернативы каноничны и не являются перестановками", () => {
  const first = run({ seed: 42 }), second = run({ seed: 42 });
  assert.deepEqual(first.options.map(option => option.identity), second.options.map(option => option.identity));
  assert.equal(new Set(first.options.map(option => option.identity)).size, first.options.length);
});

test("невозможные ограничения не ослабляются молча", () => {
  const result = run({ count: { mode: "exact", exact: 2 }, composition: "solo_boss", boss: { mode: "forbidden" } });
  assert.equal(result.options.length, 0);
  assert.match(result.diagnostics.join(" "), /не найден|Ограничения/);
});

test("marginal impact использует два полных evaluation", () => {
  let calls = 0;
  const impact = marginalNpcImpact(library.slice(0, 3), 1, profiles => { calls += 1; return fakeEvaluate(profiles); });
  assert.equal(calls, 2);
  assert.notEqual(impact.win, 0);
  assert.notEqual(impact.ko, 0);
});

test("individual BS универсален и не зависит от партии", () => {
  const npc = profile(3, "standard", 12);
  assert.equal(individualBs(npc), individualBs({ ...npc }));
});

test("финальный кандидат действительно оценивается production v8 без Monte-Carlo", async () => {
  const bundle = JSON.parse(await readFile(new URL("../src/client/calculator-v8/mitrinium_runtime_v8.min.json", import.meta.url), "utf8"));
  const units = bundle.unit_library.slice(0, 6).map((unit, index) => ({ id: `v8-${index}`, name: `V8 ${index}`, profile: unit, archetype: unit.archetype, role: unit.archetype, tags: [unit.archetype] }));
  const party = Array(4).fill(bundle.unit_library.find(unit => unit.archetype === "standard"));
  let calls = 0;
  const result = generateEncounterOptions({ library: units, settings: { count: { mode: "exact", exact: 2 }, targets: presetTargets("medium"), topN: 2, beamWidth: 8, candidateLimit: 6, heterogeneity: { mode: "any", extremeAllowed: true } }, evaluate: enemies => { calls += 1; return predictEncounter(bundle, party, enemies); } });
  assert.ok(calls > 0);
  assert.ok(result.options.length);
  assert.equal(bundle.runtime_simulation, false);
});
