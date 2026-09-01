import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { archetypeVariants } from "../src/client/calculator-v8/encounter-generator.js";
import { weaponTFromDamage } from "../src/client/calculator-v8/generated-npc-invariants.js";

async function libraries() {
  const raw = await readFile(new URL("../calculator-script-source/Dict.html", import.meta.url), "utf8");
  return new Function(`${raw.replace(/<\/?script>/g, "")}; return { attacks: ATTACK_LIBRARY, reactions: REACTION_LIBRARY, legacy: LEGACY_REACTION_LIBRARY, specials: SPECIAL_ACTION_LIBRARY, passives: PASSIVE_TRAITS, migration: REACTION_MIGRATION_MAP };`)();
}

const flat = (groups) => Object.values(groups).flat();

test("generated REACTION_LIBRARY не содержит бесплатных атак или Body DPR", async () => {
  const { reactions } = await libraries();
  const forbiddenKinds = new Set(["normal_attack", "power_attack", "multiattack", "advantage_attack", "aoe_attack", "armor_break", "heal_attack"]);
  for (const reaction of flat(reactions)) {
    assert.ok(reaction.mechanic?.kind, `${reaction.name}: missing mechanic`);
    assert.ok(!forbiddenKinds.has(reaction.mechanic.kind), `${reaction.name}: attack mechanic in reaction`);
    assert.doesNotMatch(reaction.effect, /совершает (?:дополнительную |обычную )?атаку|наносит (?:ещ[её] )?(?:d\d+|\d+) (?:Body )?(?:урона|damage)|урон атаки увеличивается/i, reaction.name);
  }
});

test("перенесённые offensive reactions отсутствуют в active reactions", async () => {
  const { reactions, attacks } = await libraries();
  const activeNames = new Set(flat(reactions).map((item) => item.name));
  for (const name of ["Ответный выстрел", "Аварийный выстрел", "Отражённая агрессия", "Костяной выпад", "Предсмертный бросок", "Последний взмах"]) assert.ok(!activeNames.has(name), name);
  const actionNames = new Set(flat(attacks).map((item) => item.name));
  for (const name of ["Быстрая очередь", "Аварийная очередь", "Разъярённый удар", "Костяной выпад"]) assert.ok(actionNames.has(name), name);
});

test("сохранённые defensive/control reactions имеют точную structured semantics", async () => {
  const { reactions } = await libraries();
  const byName = new Map(flat(reactions).map((item) => [item.name, item]));
  assert.deepEqual(byName.get("Сбить прицел").mechanic, { kind: "hindrance_defense", uses: 2, targetScene: "hindrance", duration: "one_attack" });
  assert.equal(byName.get("Стиснуть зубы").mechanic.kind, "damage_reduction");
  assert.equal(byName.get("Разрыв пространства").mechanic.kind, "forced_movement");
  assert.equal(byName.get("Мёртвая хватка").mechanic.damage, 0);
  assert.match(byName.get("Мёртвая хватка").effect, /Урон не наносится/);
});

test("generated T следует damage die, а d12 остаётся authored-only", () => {
  assert.deepEqual(["d4", "d4+1", "d6", "d6+1", "d8", "d8+1", "d10", "d10+1"].map((damage) => weaponTFromDamage(damage)), [2, 2, 3, 3, 4, 4, 5, 5]);
  assert.equal(weaponTFromDamage("d12", 7), 7);
  const variants = archetypeVariants({ id: "damage-t", usage: "archetype", typeKey: "beast", profile: { body: 16, armor: 2, pz: 4, nerve: 8, pool: 5, expl: 2, damage: "d8", penetration: 0, archetype: "brute" } });
  assert.ok(variants.every((entry) => entry.profile.damage !== "d12"));
  assert.ok(variants.every((entry) => entry.profile.expl === weaponTFromDamage(entry.profile.damage)));
});

test("active specials/reactions имеют mechanic metadata, а caps закреплены в generator", async () => {
  const [{ specials, reactions }, script] = await Promise.all([
    libraries(),
    readFile(new URL("../calculator-script-source/Script.html", import.meta.url), "utf8"),
  ]);
  assert.ok(flat(specials).every((item) => item.mechanic?.kind && Number.isFinite(item.mechanic.uses)));
  assert.ok(flat(reactions).every((item) => item.mechanic?.kind && Number.isFinite(item.mechanic.uses)));
  assert.match(script, /tag==='boss'\?\{normal:2,special:2\}:tag==='chief'\?\{normal:2,special:1\}:\{normal:1,special:1\}/);
  assert.match(script, /chosen\.length>=4/);
  assert.match(script, /reactionCount=normalizedTag==='boss'\?2:1/);
  assert.match(script, /Math\.min\(2,count\)/);
});

test("migration map переносит ability ровно в один destination", async () => {
  const { attacks, reactions, passives, migration } = await libraries();
  const attackIds = new Set(flat(attacks).map((item) => item.id));
  const reactionIds = new Set(flat(reactions).map((item) => item.id));
  const passiveIds = new Set(flat(passives).map((item) => item.id));
  for (const [oldId, target] of Object.entries(migration)) {
    assert.ok(!reactionIds.has(oldId), `${oldId} remains reaction`);
    if (target.kind === "attack") assert.ok(attackIds.has(target.templateId), `${oldId} -> missing attack`);
    if (target.kind === "passive") assert.ok(passiveIds.has(target.templateId), `${oldId} -> missing passive`);
  }
});

test("death attacks удалены, а passive effects не занимают reaction slots", async () => {
  const { reactions, passives, migration } = await libraries();
  assert.equal(migration.animal_12.kind, "delete");
  assert.equal(migration.undead_3.kind, "delete");
  assert.ok(!flat(reactions).some((item) => /впервые падает до 0 Body|впервые падает до 0 Тела/i.test(item.trigger)));
  assert.ok(flat(passives).every((item) => item.mechanic?.kind));
});
