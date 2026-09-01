import { finalizeGeneratedNpc } from "./generated-npc-invariants.js";

const array = (value) => Array.isArray(value) ? value : [];

const CREATURE_DAMAGE_STEPS = ["d4", "d4+1", "d6", "d6+1", "d8", "d8+1", "d10", "d10+1", "d12"];
const MAX_GENERATED_DAMAGE_INDEX = CREATURE_DAMAGE_STEPS.indexOf("d10+1");

export const LEVEL_ONE_ARCHETYPE_PROFILES = Object.freeze({
  minion: Object.freeze({ body: 8, armor: 1, pool: 3, damage: "d6+1" }),
  standard: Object.freeze({ body: 12, armor: 2, pool: 4, damage: "d8" }),
  striker: Object.freeze({ body: 10, armor: 1, pool: 5, damage: "d8+1" }),
  tank: Object.freeze({ body: 16, armor: 3, pool: 3, damage: "d6+1" }),
  shooter: Object.freeze({ body: 10, armor: 2, pool: 5, damage: "d8" }),
  brute: Object.freeze({ body: 14, armor: 2, pool: 4, damage: "d8+1" }),
  elite: Object.freeze({ body: 14, armor: 3, pool: 5, damage: "d8+1" }),
  boss: Object.freeze({ body: 22, armor: 3, pool: 5, damage: "d8+1" }),
});

function boundedRound(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function damageStepIndex(value) {
  const index = CREATURE_DAMAGE_STEPS.indexOf(String(value || "d6"));
  return index < 0 ? CREATURE_DAMAGE_STEPS.indexOf("d6") : index;
}

// Creature pregens describe identity. Their authored numeric profile is
// projected onto the selected level baseline before difficulty tuning.
// PZ and Nerve remain authored identity values; in particular Nerve is never
// scaled together with durability or damage.
export function scaleCreatureProfileForLevel(profile, archetype, level, levelBaselines, creatureType = profile?.creatureType || profile?.typeKey) {
  const source = { ...profile };
  const canonical = LEVEL_ONE_ARCHETYPE_PROFILES[archetype] || LEVEL_ONE_ARCHETYPE_PROFILES.standard;
  const baselines = array(levelBaselines);
  const base = baselines[1] || { hp: 22, armor: 1, pool: 4, damage: "d6" };
  const safeLevel = boundedRound(level, 1, Math.max(1, baselines.length - 1));
  const target = baselines[safeLevel] || base;
  const bodyOffset = boundedRound((Number(source.body) || canonical.body) - canonical.body, -4, 4);
  const armorOffset = boundedRound((Number(source.armor) || 0) - canonical.armor, -1, 1);
  const poolOffset = boundedRound((Number(source.pool) || canonical.pool) - canonical.pool, -1, 1);
  const damageOffset = boundedRound(damageStepIndex(source.damage) - damageStepIndex(canonical.damage), -1, 1);
  const levelDamageDelta = damageStepIndex(target.damage) - damageStepIndex(base.damage);
  return finalizeGeneratedNpc({
    ...source,
    body: boundedRound(canonical.body * (Number(target.hp || base.hp) / Number(base.hp || 22)) + bodyOffset, 4, 60),
    armor: boundedRound(canonical.armor + (Number(target.armor) - Number(base.armor)) + armorOffset, 0, 8),
    pool: boundedRound(canonical.pool + (Number(target.pool) - Number(base.pool)) + poolOffset, 1, 8),
    damage: CREATURE_DAMAGE_STEPS[boundedRound(damageStepIndex(canonical.damage) + levelDamageDelta + damageOffset, 0, MAX_GENERATED_DAMAGE_INDEX)],
    pz: Number(source.pz),
    nerve: Number(source.nerve) || 0,
  }, creatureType);
}

export function flattenCreaturePregens(bank) {
  return array(bank?.creatureTypes).flatMap((group) => array(group.pregens));
}

export function migrateCreaturePregenBank(bank, catalogs = {}) {
  const migrated = JSON.parse(JSON.stringify(bank));
  for (const group of array(migrated?.creatureTypes)) {
    const attacks = new Map(array(catalogs?.attacks?.[group.type]).map((item) => [item.id, item]));
    const reactions = new Map(array(catalogs?.reactions?.[group.type]).map((item) => [item.id, item]));
    const passives = new Map(array(catalogs?.passives?.[group.type]).map((item) => [item.id, item]));
    for (const pregen of array(group.pregens)) {
      const identity = pregen.hardIdentity ||= {};
      const nextAttacks = [...array(identity.attacks)];
      const nextReactions = [];
      const nextPassives = [...array(identity.passives)];
      for (const ref of array(identity.reactions)) {
        if (reactions.has(ref.ref)) {
          nextReactions.push(ref);
          continue;
        }
        const migration = catalogs?.reactionMigrationMap?.[ref.ref];
        if (migration?.kind === "attack") {
          const item = attacks.get(migration.templateId);
          if (item && !nextAttacks.some((entry) => entry.ref === item.id)) nextAttacks.push({ ref: item.id, name: item.name });
        } else if (migration?.kind === "passive") {
          const item = passives.get(migration.templateId);
          if (item && !nextPassives.some((entry) => entry.ref === item.id)) nextPassives.push({ ref: item.id, name: item.name });
        }
      }
      identity.attacks = nextAttacks;
      identity.reactions = nextReactions.slice(0, 2);
      identity.passives = nextPassives;
    }
  }
  return migrated;
}

export function validateCreaturePregenBank(bank, catalogs = null) {
  const errors = [];
  if (bank?.version !== "mitrinium-creature-pregen-bank-v2") errors.push("unexpected bank version");
  const groups = array(bank?.creatureTypes);
  if (groups.length !== 5) errors.push(`expected 5 creature types, got ${groups.length}`);
  const ids = new Set();
  for (const group of groups) {
    if (array(group.pregens).length !== 25) errors.push(`${group.type}: expected 25 pregens`);
    const attacks = new Map(array(catalogs?.attacks?.[group.type]).map((item) => [item.id, item]));
    const reactions = new Map(array(catalogs?.reactions?.[group.type]).map((item) => [item.id, item]));
    const passives = new Map(array(catalogs?.passives?.[group.type]).map((item) => [item.id, item]));
    for (const pregen of array(group.pregens)) {
      if (!pregen.id || ids.has(pregen.id)) errors.push(`duplicate or missing id: ${pregen.id || "unknown"}`);
      ids.add(pregen.id);
      if (pregen.creatureType !== group.type) errors.push(`${pregen.id}: creature type mismatch`);
      if (!pregen.name || !pregen.description || !pregen.idealProfile) errors.push(`${pregen.id}: incomplete pregen`);
      if (catalogs) {
        for (const ref of array(pregen.hardIdentity?.attacks)) {
          const item = attacks.get(ref.ref);
          if (!item) errors.push(`${pregen.id}: missing attack ${ref.ref}`);
          else if (item.name !== ref.name) errors.push(`${pregen.id}: attack name drift ${ref.ref}`);
        }
        for (const ref of array(pregen.hardIdentity?.reactions)) {
          const item = reactions.get(ref.ref);
          if (!item) errors.push(`${pregen.id}: missing reaction ${ref.ref}`);
          else if (item.name !== ref.name) errors.push(`${pregen.id}: reaction name drift ${ref.ref}`);
        }
        for (const ref of array(pregen.hardIdentity?.passives)) {
          const item = passives.get(ref.ref);
          if (!item) errors.push(`${pregen.id}: missing passive ${ref.ref}`);
          else if (item.name !== ref.name) errors.push(`${pregen.id}: passive name drift ${ref.ref}`);
        }
      }
    }
  }
  if (ids.size !== 125) errors.push(`expected 125 unique pregens, got ${ids.size}`);
  return { ok: errors.length === 0, errors, count: ids.size };
}

function resolveRefs(refs, catalog, kind, pregenId) {
  const byId = new Map(array(catalog).map((item) => [item.id, item]));
  return array(refs).map((ref) => {
    const item = byId.get(ref.ref);
    if (!item) throw new Error(`${pregenId}: ${kind} ${ref.ref} не найден`);
    if (item.name !== ref.name) throw new Error(`${pregenId}: название ${kind} ${ref.ref} изменилось`);
    return JSON.parse(JSON.stringify(item));
  });
}

function damageAverage(value) {
  const match = String(value || "d6").match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  return match ? Number(match[1] || 1) * (Number(match[2]) + 1) / 2 + Number(match[3] || 0) : Number(value) || 0;
}

export function inferCreatureArchetype(pregen, attacks = []) {
  const profile = pregen.idealProfile || {};
  const ranged = attacks.some((attack) => /средн|дальн|выстрел|турел|метатель/i.test(`${attack.range || ""} ${attack.name || ""}`));
  if ((Number(profile.body) >= 18 || Number(profile.armor) >= 4) && Number(profile.pool) >= 5) return "boss";
  if (Number(profile.body) <= 9 && Number(profile.armor) <= 1) return "minion";
  if (Number(profile.body) >= 16 || Number(profile.armor) >= 3) return "tank";
  if (ranged) return "shooter";
  if (Number(profile.pool) >= 5 && damageAverage(profile.damage) >= 4.5) return "striker";
  if (Number(profile.body) >= 14) return "brute";
  return "standard";
}

export function resolveCreaturePregen(pregen, catalogs) {
  const type = pregen.creatureType;
  const authoredAttacks = resolveRefs(pregen.hardIdentity?.attacks, catalogs?.attacks?.[type], "атака", pregen.id);
  const reactions = resolveRefs(pregen.hardIdentity?.reactions, catalogs?.reactions?.[type], "реакция", pregen.id);
  const passives = resolveRefs(pregen.hardIdentity?.passives, catalogs?.passives?.[type], "пассив", pregen.id);
  const archetype = inferCreatureArchetype(pregen, authoredAttacks);
  const normalLimit = archetype === "minion" ? 1 : 2;
  const specialLimit = archetype === "boss" || archetype === "elite" ? 2 : 1;
  const normals = authoredAttacks.filter((item) => Number(item.uses) === 0).slice(0, normalLimit);
  const migratedSpecial = (item) => /_(?:special|action)_/.test(String(item?.id || ""));
  const authoredSpecials = authoredAttacks
    .filter((entry) => Number(entry.uses) > 0)
    .sort((left, right) => Number(migratedSpecial(right)) - Number(migratedSpecial(left)));
  const specials = [];
  for (const item of authoredSpecials) {
    if (specials.length >= specialLimit) break;
    if (!specials.some((entry) => entry.mechanic?.kind === item.mechanic?.kind)) specials.push(item);
  }
  const attacks = [...normals, ...specials].slice(0, 4);
  return {
    ...pregen,
    archetype,
    role: archetype,
    resolvedAttacks: attacks,
    resolvedReactions: reactions,
    resolvedPassives: passives,
    hardIdentity: { name: pregen.name, type, attacks, reactions, passives },
  };
}

export async function loadCreaturePregenBank(url = "./data/creature-pregens-v2.json") {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Creature pregen bank недоступен (${response.status}).`);
  const bank = await response.json();
  const validation = validateCreaturePregenBank(bank);
  if (!validation.ok) throw new Error(`Creature pregen bank повреждён: ${validation.errors.slice(0, 5).join("; ")}`);
  return bank;
}
