export const TACTICAL_ROLES = Object.freeze([
  "brute", "shooter", "skirmisher", "tank",
  "controller", "striker", "support", "artillery",
]);

const CONTEXT_REQUIREMENTS = new Set([
  "adjacent_ally", "ally_present", "automaton_ally", "marked_or_debuffed_target",
  "marked_target", "movement_seen", "prey_nearby", "target_nearby", "territory",
  "threatened_at_close", "wounded_target",
]);

const TAG_CAPABILITIES = Object.freeze({
  melee: ["melee_attack"], ranged: ["ranged_attack"], movement: ["mobility"],
  mobile: ["mobility"], escape: ["mobility"], control: ["control_zone"], zone: ["control_zone"],
});

const array = (value) => Array.isArray(value) ? value : [];

function kitCapabilities(kit) {
  const capabilities = new Set();
  for (const action of [kit.primary, kit.secondary]) {
    array(action?.provides).forEach((value) => capabilities.add(value));
    array(action?.tags).forEach((tag) => array(TAG_CAPABILITIES[tag]).forEach((value) => capabilities.add(value)));
  }
  return capabilities;
}

export function validateTacticalKit(kit, expectedRole) {
  const errors = [];
  if (!kit || typeof kit !== "object") return ["kit must be an object"];
  if (!kit.id) errors.push("id is required");
  if (kit.role !== expectedRole) errors.push(`role ${kit.role || "missing"} does not match ${expectedRole}`);
  for (const field of ["primary", "secondary", "reaction", "special", "semantic_contract", "tactics", "scale_fit"]) {
    if (!kit[field] || typeof kit[field] !== "object") errors.push(`${field} is required`);
  }
  if (!String(kit.primary?.name || "").trim()) errors.push("primary.name is required");
  if (!String(kit.secondary?.name || "").trim()) errors.push("secondary.name is required");
  if (!String(kit.reaction?.name || "").trim()) errors.push("reaction.name is required");
  if (!String(kit.reaction?.trigger || "").trim()) errors.push("reaction.trigger is required");
  if (!String(kit.special?.name || "").trim()) errors.push("special.name is required");
  if (!String(kit.tactical_identity || "").trim()) errors.push("tactical_identity is required");
  if (!String(kit.chassis || "").trim()) errors.push("chassis is required");
  const contract = kit.semantic_contract || {};
  if (contract.primary_attack_semantics !== "explicit") errors.push("primary_attack_semantics must be explicit");
  const capabilities = kitCapabilities(kit);
  for (const requirement of array(contract.must_provide)) {
    if (!capabilities.has(requirement)) errors.push(`must_provide unresolved: ${requirement}`);
  }
  for (const requirement of [...array(contract.reaction_requires), ...array(contract.forbid_if_missing)]) {
    if (!capabilities.has(requirement) && !CONTEXT_REQUIREMENTS.has(requirement)) errors.push(`reaction requirement unresolved: ${requirement}`);
  }
  return errors;
}

export function validateTacticalBank(bank) {
  const errors = [];
  if (bank?.version !== "mitrinium-tactical-pregen-bank-v1") errors.push("unexpected bank version");
  const groups = array(bank?.roles);
  if (groups.length !== TACTICAL_ROLES.length) errors.push(`expected 8 roles, got ${groups.length}`);
  const ids = new Set();
  let total = 0;
  for (const role of TACTICAL_ROLES) {
    const group = groups.find((item) => item.role === role);
    if (!group) { errors.push(`missing role: ${role}`); continue; }
    const kits = array(group.kits);
    if (kits.length !== 40) errors.push(`${role}: expected 40 kits, got ${kits.length}`);
    total += kits.length;
    for (const kit of kits) {
      if (ids.has(kit.id)) errors.push(`duplicate id: ${kit.id}`);
      ids.add(kit.id);
      validateTacticalKit(kit, role).forEach((error) => errors.push(`${kit.id || role}: ${error}`));
    }
  }
  if (total !== 320) errors.push(`expected 320 kits, got ${total}`);
  return { ok: errors.length === 0, errors, roleCount: groups.length, kitCount: total, uniqueIdCount: ids.size };
}

export function flattenTacticalBank(bank) {
  return array(bank?.roles).flatMap((group) => array(group.kits));
}

export function tacticalKitsForRole(bank, role) {
  return array(bank?.roles).find((group) => group.role === role)?.kits || [];
}

export function findTacticalPregen(bank, id) {
  return flattenTacticalBank(bank).find((kit) => kit.id === id) || null;
}

function hashUnit(value) {
  let hash = 2166136261;
  for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) / 4294967296;
}

export function selectTacticalPregen({ bank, role, desiredScale = "chief", existingEnemies = [], seed = 1, optionalTags = [], allowDuplicates = false }) {
  const candidates = tacticalKitsForRole(bank, role);
  if (!candidates.length) throw new Error(`В tactical bank отсутствует роль ${role}.`);
  const usedIds = new Set(existingEnemies.map((enemy) => enemy.tacticalPregenId).filter(Boolean));
  const usedChassis = new Map(), usedTags = new Map();
  for (const enemy of existingEnemies) {
    if (enemy.chassis) usedChassis.set(enemy.chassis, (usedChassis.get(enemy.chassis) || 0) + 1);
    array(enemy.diversityTags).forEach((tag) => usedTags.set(tag, (usedTags.get(tag) || 0) + 1));
  }
  const wanted = new Set(optionalTags);
  const ranked = candidates.map((kit) => {
    const recommended = kit.scale_fit?.recommended === desiredScale;
    const allowed = array(kit.scale_fit?.allowed).includes(desiredScale);
    let score = recommended ? 8 : allowed ? 4 : -12;
    if (!allowDuplicates && usedIds.has(kit.id)) score -= 30;
    score -= (usedChassis.get(kit.chassis) || 0) * 0.8;
    score -= array(kit.diversity_tags).reduce((sum, tag) => sum + (usedTags.get(tag) || 0) * 0.15, 0);
    score += array(kit.diversity_tags).reduce((sum, tag) => sum + (wanted.has(tag) ? 2 : 0), 0);
    score += hashUnit(`${seed}:${kit.id}`) * 0.25;
    return { kit, score, scaleFallback: !recommended && !allowed };
  }).sort((a, b) => b.score - a.score || a.kit.id.localeCompare(b.kit.id));
  return ranked[0];
}

const copyStats = (stats = {}) => ({
  pool: Number(stats.pool) || 4,
  expl: Number.isFinite(Number(stats.expl)) ? Number(stats.expl) : 3,
  damage: String(stats.damage || "d6"),
  penetrating: Boolean(stats.penetrating),
  range: String(stats.range || "Особая"),
});

// The bank contains behavior, not combat rating. Numbers come from the existing scaler.
export function resolveTacticalKitRuntime(kit, numericActions = {}, desiredScale = "chief") {
  const kitErrors = validateTacticalKit(kit, kit?.role);
  if (kitErrors.length) throw new Error(`Tactical pregen ${kit?.id || "unknown"} invalid: ${kitErrors.join("; ")}`);
  const primaryStats = copyStats(numericActions.primary);
  const secondaryStats = copyStats(numericActions.secondary || numericActions.primary);
  const specialStats = copyStats(numericActions.special || numericActions.secondary || numericActions.primary);
  const specialUses = Math.max(0, Number(kit.special.uses) || 0) + (desiredScale === "boss" ? 1 : 0);
  return {
    tacticalPregenId: kit.id, tacticalRole: kit.role, tacticalTier: desiredScale, chassis: kit.chassis,
    preferredRange: kit.preferred_range, tacticalIdentity: kit.tactical_identity,
    scaleFit: kit.scale_fit,
    tacticalScaleFallback: kit.scale_fit?.recommended !== desiredScale && !array(kit.scale_fit?.allowed).includes(desiredScale),
    diversityTags: [...array(kit.diversity_tags)], semanticContract: { ...kit.semantic_contract },
    tactics: { ...kit.tactics }, primary: { ...kit.primary }, secondary: { ...kit.secondary },
    reaction: { ...kit.reaction }, special: { ...kit.special, uses: specialUses },
    actions: [
      { ...primaryStats, ...kit.primary, range: kit.preferred_range, tacticalKind: "primary", uses: 0 },
      { ...secondaryStats, ...kit.secondary, range: kit.preferred_range, tacticalKind: "secondary", uses: 0 },
      { ...specialStats, ...kit.special, tacticalKind: "special", uses: specialUses },
    ],
  };
}

export function validateResolvedTacticalEnemy(enemy) {
  if (!enemy?.tacticalPregenId) return { ok: true, legacy: true, errors: [] };
  const errors = [];
  if (!enemy.primaryAttackId || !array(enemy.attacks).some((attack) => attack.id === enemy.primaryAttackId)) errors.push("primaryAttackId does not resolve");
  if (!enemy.primary || !enemy.secondary || !enemy.reaction || !enemy.special) errors.push("resolved tactical actions are incomplete");
  if (enemy.attacks?.[0]?.id !== enemy.primaryAttackId) errors.push("primary attack is not first");
  const provides = new Set([...array(enemy.primary?.provides), ...array(enemy.secondary?.provides)]);
  for (const action of [enemy.primary, enemy.secondary]) {
    for (const tag of array(action?.tags)) for (const capability of array(TAG_CAPABILITIES[tag])) provides.add(capability);
  }
  for (const requirement of array(enemy.semanticContract?.must_provide)) if (!provides.has(requirement)) errors.push(`missing capability: ${requirement}`);
  for (const requirement of array(enemy.semanticContract?.reaction_requires)) {
    if (!provides.has(requirement) && !CONTEXT_REQUIREMENTS.has(requirement)) errors.push(`reaction requirement unresolved: ${requirement}`);
  }
  return { ok: errors.length === 0, legacy: false, errors };
}

let cachedBankPromise;
export async function loadTacticalPregenBank(url = "./data/tactical-pregens-v1.json") {
  if (!cachedBankPromise) cachedBankPromise = fetch(url).then(async (response) => {
    if (!response.ok) throw new Error(`Tactical pregen bank недоступен (${response.status}).`);
    const bank = await response.json();
    const validation = validateTacticalBank(bank);
    if (!validation.ok) throw new Error(`Tactical pregen bank повреждён: ${validation.errors.slice(0, 5).join("; ")}`);
    return bank;
  });
  return cachedBankPromise;
}
