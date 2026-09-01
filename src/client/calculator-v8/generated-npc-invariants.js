export const GENERATED_NPC_LIMITS = Object.freeze({
  body: Object.freeze({ min: 4 }),
  pz: Object.freeze({ min: 3, max: 6 }),
  nerve: Object.freeze({
    humanoid: Object.freeze({ min: 3, max: 6 }),
    animal: Object.freeze({ min: 1, max: 3 }),
    beast: Object.freeze({ min: 5, max: Infinity }),
    mechanism: Object.freeze({ exact: 0 }),
    undead: Object.freeze({ exact: 0 }),
  }),
});

const WEAPON_T_BY_DIE = Object.freeze({ 4: 2, 6: 3, 8: 4, 10: 5 });

// T depends on the base damage die, not on its flat modifier. There is no
// generated d12 rule yet; authored d12 profiles retain their stored value.
export function weaponTFromDamage(damage, fallback = null) {
  const match = String(damage || "").trim().toLowerCase().replace(/\s+/g, "").match(/^(?:\d+)?d(\d+)(?:[+-]\d+)?$/);
  const value = match ? WEAPON_T_BY_DIE[Number(match[1])] : undefined;
  if (value !== undefined) return value;
  return Number.isFinite(Number(fallback)) ? Math.max(0, Math.round(Number(fallback))) : null;
}

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function normalizeGeneratedNpc(profile, type) {
  const source = { ...(profile || {}) };
  const nerveLimit = GENERATED_NPC_LIMITS.nerve[type];
  const weaponT = weaponTFromDamage(source.damage, source.expl);
  let nerve = finite(source.nerve, nerveLimit?.exact ?? nerveLimit?.min ?? 0);
  if (nerveLimit?.exact !== undefined) nerve = nerveLimit.exact;
  else if (nerveLimit) nerve = clamp(nerve, nerveLimit.min, nerveLimit.max);
  return {
    ...source,
    body: Math.max(GENERATED_NPC_LIMITS.body.min, finite(source.body, GENERATED_NPC_LIMITS.body.min)),
    pz: clamp(finite(source.pz, GENERATED_NPC_LIMITS.pz.min), GENERATED_NPC_LIMITS.pz.min, GENERATED_NPC_LIMITS.pz.max),
    nerve,
    ...(weaponT === null ? {} : { expl: weaponT }),
  };
}

export function validateGeneratedNpc(profile, type) {
  const errors = [];
  const body = Number(profile?.body);
  const pz = Number(profile?.pz);
  const nerve = Number(profile?.nerve);
  if (!Number.isFinite(body) || body < GENERATED_NPC_LIMITS.body.min) errors.push(`body=${profile?.body}`);
  if (!Number.isFinite(pz) || pz < GENERATED_NPC_LIMITS.pz.min || pz > GENERATED_NPC_LIMITS.pz.max) errors.push(`pz=${profile?.pz}`);
  const nerveLimit = GENERATED_NPC_LIMITS.nerve[type];
  if (nerveLimit?.exact !== undefined && nerve !== nerveLimit.exact) errors.push(`nerve=${profile?.nerve}, expected ${nerveLimit.exact}`);
  else if (nerveLimit && (!Number.isFinite(nerve) || nerve < nerveLimit.min || nerve > nerveLimit.max)) errors.push(`nerve=${profile?.nerve}`);
  if (errors.length) throw new Error(`Generated NPC invariant failed (${type || "unknown"}): ${errors.join(", ")}`);
  return true;
}

export function finalizeGeneratedNpc(profile, type) {
  const normalized = normalizeGeneratedNpc(profile, type);
  validateGeneratedNpc(normalized, type);
  return normalized;
}
