const array = (value) => Array.isArray(value) ? value : [];

export function flattenCreaturePregens(bank) {
  return array(bank?.creatureTypes).flatMap((group) => array(group.pregens));
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
  const attacks = resolveRefs(pregen.hardIdentity?.attacks, catalogs?.attacks?.[type], "атака", pregen.id);
  const reactions = resolveRefs(pregen.hardIdentity?.reactions, catalogs?.reactions?.[type], "реакция", pregen.id);
  const archetype = inferCreatureArchetype(pregen, attacks);
  return {
    ...pregen,
    archetype,
    role: archetype,
    resolvedAttacks: attacks,
    resolvedReactions: reactions,
    hardIdentity: { name: pregen.name, type, attacks, reactions },
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
