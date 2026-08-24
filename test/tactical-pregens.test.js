import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  TACTICAL_ROLES,
  findTacticalPregen,
  flattenTacticalBank,
  resolveTacticalKitRuntime,
  selectTacticalPregen,
  tacticalKitsForRole,
  validateResolvedTacticalEnemy,
  validateTacticalBank,
  validateTacticalKit,
} from "../src/client/calculator-v8/tactical-pregens.js";
import { BASE_FEATURE_ORDER, predictEncounter } from "../src/client/calculator-v8/mitrinium-v8-core.js";

const bank = JSON.parse(await readFile(new URL("../src/client/calculator-v8/data/tactical-pregens-v1.json", import.meta.url), "utf8"));
const runtime = JSON.parse(await readFile(new URL("../src/client/calculator-v8/mitrinium_runtime_v15.min.json", import.meta.url), "utf8"));
const numeric = { pool: 5, expl: 3, damage: "d8", penetrating: false, range: "Средняя" };

test("tactical bank: 8 ролей, 40 наборов в каждой и 320 уникальных id", () => {
  const validation = validateTacticalBank(bank);
  assert.deepEqual(validation, { ok: true, errors: [], roleCount: 8, kitCount: 320, uniqueIdCount: 320 });
  assert.deepEqual(bank.roles.map((group) => group.role), TACTICAL_ROLES);
  for (const role of TACTICAL_ROLES) assert.equal(tacticalKitsForRole(bank, role).length, 40);
});

test("tactical bank: каждый набор семантически самодостаточен", () => {
  for (const kit of flattenTacticalBank(bank)) {
    assert.deepEqual(validateTacticalKit(kit, kit.role), [], kit.id);
    for (const field of ["primary", "secondary", "reaction", "special"]) assert.ok(kit[field]?.name, `${kit.id}: ${field}`);
    assert.ok(kit.reaction.trigger, `${kit.id}: reaction trigger`);
    assert.equal(kit.semantic_contract.primary_attack_semantics, "explicit");
  }
});

test("1000 генераций сохраняют цельный kit и допустимый scale-fit", () => {
  const existing = [];
  for (let index = 0; index < 1000; index += 1) {
    const role = TACTICAL_ROLES[index % TACTICAL_ROLES.length];
    const desiredScale = ["minion", "chief", "boss"][index % 3];
    const choice = selectTacticalPregen({ bank, role, desiredScale, existingEnemies: existing.slice(-12), seed: index });
    const resolved = resolveTacticalKitRuntime(choice.kit, { primary: numeric, secondary: numeric, special: numeric }, desiredScale);
    assert.equal(resolved.tacticalPregenId, choice.kit.id);
    assert.equal(resolved.tacticalRole, role);
    assert.deepEqual(resolved.actions.map((action) => action.name), [choice.kit.primary.name, choice.kit.secondary.name, choice.kit.special.name]);
    assert.equal(resolved.reaction.name, choice.kit.reaction.name);
    assert.equal(resolved.actions[0].tacticalKind, "primary");
    assert.equal(resolved.actions[0].uses, 0);
    assert.equal(resolved.actions[1].uses, 0);
    assert.equal(choice.scaleFallback, !choice.kit.scale_fit.allowed.includes(desiredScale) && choice.kit.scale_fit.recommended !== desiredScale);
    existing.push({ tacticalPregenId: choice.kit.id, chassis: choice.kit.chassis, diversityTags: choice.kit.diversity_tags });
  }
});

test("resolved enemy явно связывает primary с первой атакой; legacy остаётся валиден", () => {
  const kit = findTacticalPregen(bank, "brute_club_guard");
  const resolved = resolveTacticalKitRuntime(kit, { primary: numeric, secondary: numeric, special: numeric }, "chief");
  const attacks = resolved.actions.map((action, index) => ({ ...action, id: `attack-${index}` }));
  const enemy = { ...resolved, attacks, primaryAttackId: attacks[0].id };
  assert.deepEqual(validateResolvedTacticalEnemy(enemy), { ok: true, legacy: false, errors: [] });
  assert.deepEqual(validateResolvedTacticalEnemy({ attacks: [{ id: "old" }] }), { ok: true, legacy: true, errors: [] });
});

test("tactical metadata не подменяет production V15 и геометрия остаётся полной", () => {
  const party = Array(4).fill(runtime.unit_library.find((unit) => unit.archetype === "standard"));
  const baseEnemy = runtime.unit_library.find((unit) => unit.archetype === "brute");
  const firstKit = tacticalKitsForRole(bank, "brute")[0];
  const secondKit = tacticalKitsForRole(bank, "brute")[1];
  const first = resolveTacticalKitRuntime(firstKit, { primary: baseEnemy }, "chief");
  const second = resolveTacticalKitRuntime(secondKit, { primary: baseEnemy }, "chief");
  const a = predictEncounter(runtime, party, [{ ...baseEnemy, tacticalPregenId: first.tacticalPregenId }]);
  const b = predictEncounter(runtime, party, [{ ...baseEnemy, tacticalPregenId: second.tacticalPregenId }]);
  assert.deepEqual(a.vector, b.vector, "flavour/tactics alone must not alter V15 numbers");
  assert.equal(a.vector.length, BASE_FEATURE_ORDER.length);
  assert.ok(a.vector.every(Number.isFinite));
  const stronger = predictEncounter(runtime, party, [{ ...baseEnemy, pool: baseEnemy.pool + 1 }]);
  assert.notDeepEqual(a.vector, stronger.vector, "a numeric primary change must reach V15");
});
