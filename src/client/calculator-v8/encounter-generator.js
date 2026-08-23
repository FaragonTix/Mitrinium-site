export const DIFFICULTY_PRESETS = Object.freeze({
  easy: { label: "Легко", winRange: [0.95, 0.98], koRange: [0.05, 0.15] },
  medium: { label: "Нормально", winRange: [0.75, 0.87], koRange: [0.15, 0.25] },
  hard: { label: "Сложно", winRange: [0.60, 0.75], koRange: [0.25, 0.40] },
  deadly: { label: "Смертельно", winRange: [0, 0.50], koRange: [0.60, 1], strict: { winMax: true, koMin: true } },
});

export const ARCHETYPE_TUNING_CONFIG = Object.freeze({
  lambda: 0.015,
  damageSteps: ["d4", "d4+1", "d6", "d6+1", "d8", "d8+1", "d10", "d10+1", "d12"],
  weights: { body: 1, nerve: 1, pool: 2, damage: 2, armor: 4, penetration: 5, pz: 8 },
  defaults: {
    body: { preferred: 3, hard: 10, min: 1, max: 60 },
    nerve: { preferred: 3, hard: 8, min: 0, max: 40 },
    pool: { preferred: 1, hard: 3, min: 1, max: 8 },
    damage: { preferred: 1, hard: 3 },
    armor: { preferred: 1, hard: 2, min: 0, max: 8 },
    penetration: { preferred: 0, hard: 1, min: 0, max: 3 },
    pz: { preferred: 1, hard: 2, min: 2, max: 6 },
  },
});

export const GENERATOR_DEFAULTS = Object.freeze({
  topN: 5,
  beamWidth: 18,
  candidateLimit: 18,
  weights: { win: 1, ko: 1, rounds: 0, body: 0, deviation: ARCHETYPE_TUNING_CONFIG.lambda },
  tolerances: { probability: 0.01, rounds: 0.25, body: 0.02 },
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
const array = (value) => Array.isArray(value) ? value : [];
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const tagsOf = (entry) => new Set([entry.role, entry.archetype, ...array(entry.tags)].filter(Boolean));

export function averageDamage(expression) {
  const match = String(expression || "d6").replace(/\s+/g, "").match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!match) return Math.max(0, Number(expression) || 0);
  return (Number(match[1] || 1) * (Number(match[2]) + 1)) / 2 + Number(match[3] || 0);
}

// Универсальный индекс одного NPC. Он не зависит от партии и никогда не
// используется как prediction или additive encounter score.
export function individualBs(profile) {
  const body = Math.max(1, Number(profile.body) || 1);
  const nerve = Math.max(0, Number(profile.nerve) || 0);
  const armor = Math.max(0, Number(profile.armor) || 0);
  const pz = Math.max(2, Number(profile.pz) || 2);
  const pool = Math.max(1, Number(profile.pool) || 1);
  const expl = Math.max(0, Number(profile.expl) || 0);
  const penetration = Math.max(0, Number(profile.penetration) || 0);
  const durability = body * (1 + nerve * 0.025) * (1 + armor * 0.22) * (1 + (pz - 2) * 0.09);
  const pressure = (pool + expl * 0.55) * (averageDamage(profile.damage) + penetration * 1.5);
  return Math.max(20, Math.round(Math.sqrt(durability * pressure) * 24));
}

export function makeLibraryEntry(input, index = 0) {
  const profile = { ...(input.profile || input) };
  const idealProfile = { ...(input.idealProfile || profile) };
  const archetype = String(input.archetype || profile.archetype || "standard");
  const role = String(input.role || input.tagKey || archetype);
  const usage = input.usage === "archetype" ? "archetype" : "exact";
  const id = String(input.id || `npc-${index}`);
  return {
    ...input,
    id,
    baseId: String(input.baseId || id),
    name: String(input.name || `NPC ${index + 1}`),
    profile,
    idealProfile,
    archetype,
    role,
    usage,
    hardIdentity: input.hardIdentity ? clone(input.hardIdentity) : {
      name: String(input.name || `NPC ${index + 1}`),
      type: input.typeKey || input.chassis || "unknown",
      attacks: clone(array(input.attacks)),
      reactions: clone(array(input.reactions)),
    },
    tags: [...new Set([role, archetype, ...array(input.tags)].filter(Boolean))],
    bs: individualBs(profile),
    deviation: Math.max(0, Number(input.deviation) || 0),
    tuningDiff: array(input.tuningDiff),
  };
}

function damageIndex(value) {
  const index = ARCHETYPE_TUNING_CONFIG.damageSteps.indexOf(String(value || "d6"));
  return index < 0 ? ARCHETYPE_TUNING_CONFIG.damageSteps.indexOf("d6") : index;
}

function tuningLimit(input, key) {
  return { ...ARCHETYPE_TUNING_CONFIG.defaults[key], ...(input.tuningLimits?.[key] || {}) };
}

function tuneNumber(value, delta, limit, phase) {
  const span = phase === "preferred" ? limit.preferred : limit.hard;
  const boundedDelta = Array.isArray(span) ? delta : clamp(delta, -(Number(span) || 0), Number(span) || 0);
  const hardRange = Array.isArray(limit.hard) ? limit.hard : [limit.min, limit.max];
  return clamp(Math.round((Number(value) || 0) + boundedDelta), Number(hardRange[0]), Number(hardRange[1]));
}

function resolvedArchetypeVariant(entry, changes, phase) {
  const ideal = entry.idealProfile;
  const profile = { ...ideal };
  for (const [key, delta] of Object.entries(changes)) {
    const limit = tuningLimit(entry, key);
    if (key === "damage") {
      const span = phase === "preferred" ? limit.preferred : limit.hard;
      const boundedDelta = Array.isArray(span) ? delta : clamp(delta, -(Number(span) || 0), Number(span) || 0);
      const hardRange = Array.isArray(limit.hard) ? limit.hard.map(damageIndex) : [0, ARCHETYPE_TUNING_CONFIG.damageSteps.length - 1];
      profile.damage = ARCHETYPE_TUNING_CONFIG.damageSteps[clamp(damageIndex(ideal.damage) + boundedDelta, hardRange[0], hardRange[1])];
    } else if (ideal[key] !== undefined || key !== "nerve") {
      profile[key] = tuneNumber(ideal[key], delta, limit, phase);
    }
  }
  const tuningDiff = [];
  let deviation = 0;
  for (const key of ["body", "nerve", "pool", "damage", "armor", "penetration", "pz"]) {
    if (ideal[key] === undefined && profile[key] === undefined) continue;
    const before = key === "damage" ? damageIndex(ideal[key]) : Number(ideal[key]) || 0;
    const after = key === "damage" ? damageIndex(profile[key]) : Number(profile[key]) || 0;
    const delta = Math.abs(after - before);
    if (!delta) continue;
    const hardLimit = tuningLimit(entry, key).hard;
    const hard = Math.max(1, Array.isArray(hardLimit) ? Math.abs((key === "damage" ? damageIndex(hardLimit[1]) - damageIndex(hardLimit[0]) : Number(hardLimit[1]) - Number(hardLimit[0]))) : Number(hardLimit) || 1);
    deviation += ARCHETYPE_TUNING_CONFIG.weights[key] * delta / hard;
    tuningDiff.push({ key, from: ideal[key], to: profile[key] });
  }
  const suffix = tuningDiff.map((item) => `${item.key}:${item.to}`).join(",") || "ideal";
  return { ...entry, profile, bs: individualBs(profile), deviation, tuningDiff, tuningPhase: phase, variantKey: `${entry.baseId}@${suffix}` };
}

export function archetypeVariants(rawEntry) {
  const entry = makeLibraryEntry(rawEntry);
  if (entry.usage !== "archetype") return [{ ...entry, variantKey: `${entry.baseId}@exact` }];
  // Defense and offense are intentionally independent. This lets the search
  // lower KO pressure while retaining encounter durability (and vice versa),
  // instead of moving both outcome axes in lockstep.
  const defenses = [
    { changes: {}, phase: "ideal" },
    { changes: { body: -3, nerve: -3, armor: -1, pz: -1 }, phase: "preferred" },
    { changes: { body: 3, nerve: 3, armor: 1, pz: 1 }, phase: "preferred" },
    { changes: { body: -10, nerve: -8, armor: -2, pz: -2 }, phase: "hard" },
    { changes: { body: 10, nerve: 8, armor: 2, pz: 2 }, phase: "hard" },
  ];
  const offenses = [
    { changes: {}, phase: "ideal" },
    { changes: { pool: -1, damage: -1 }, phase: "preferred" },
    { changes: { pool: 1, damage: 1 }, phase: "preferred" },
    { changes: { pool: -3, damage: -3 }, phase: "hard" },
    { changes: { pool: 3, damage: 3 }, phase: "hard" },
  ];
  const variants = defenses.flatMap((defense) => offenses.map((offense) => resolvedArchetypeVariant(
    entry,
    { ...defense.changes, ...offense.changes },
    defense.phase === "hard" || offense.phase === "hard" ? "hard" : defense.phase === "ideal" && offense.phase === "ideal" ? "ideal" : "preferred",
  )));
  return [...new Map(variants.map((variant) => [variant.variantKey, variant])).values()];
}

export function pregenDeviation(entries) {
  const tunable = array(entries).filter((entry) => entry.usage === "archetype");
  return tunable.length ? tunable.reduce((sum, entry) => sum + (Number(entry.deviation) || 0), 0) / tunable.length : 0;
}

export function seededRandom(seed = 1) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizedRange(target, fallback, bounds = [0, 1]) {
  if (!target || target.mode === "ignore") return null;
  if (target.mode === "exact") {
    const exact = clamp(target.exact ?? target.min ?? fallback[0], bounds[0], bounds[1]);
    return [exact, exact];
  }
  const min = clamp(target.min ?? fallback[0], bounds[0], bounds[1]);
  const max = clamp(target.max ?? fallback[1], bounds[0], bounds[1]);
  return min <= max ? [min, max] : [max, min];
}

export function presetTargets(key = "medium") {
  const preset = DIFFICULTY_PRESETS[key] || DIFFICULTY_PRESETS.medium;
  return {
    win: { mode: "range", min: preset.winRange[0], max: preset.winRange[1] },
    ko: { mode: "range", min: preset.koRange[0], max: preset.koRange[1] },
    rounds: { mode: "ignore" },
    body: { mode: "ignore" },
  };
}

export function normalizeGeneratorSettings(raw = {}) {
  const preset = DIFFICULTY_PRESETS[raw.difficulty] || DIFFICULTY_PRESETS.medium;
  const presetDefaults = presetTargets(raw.difficulty);
  const countMode = raw.count?.mode || "any";
  const countExact = clamp(raw.count?.exact ?? 3, 1, 12);
  let countMin = countMode === "exact" ? countExact : clamp(raw.count?.min ?? 1, 1, 12);
  let countMax = countMode === "exact" ? countExact : clamp(raw.count?.max ?? 6, 1, 12);
  if (countMin > countMax) [countMin, countMax] = [countMax, countMin];
  const targets = raw.targets || presetDefaults;
  return {
    mode: raw.mode || "quick",
    source: raw.source || "mixed",
    difficulty: raw.difficulty || "medium",
    targets: {
      win: normalizedRange(targets.win, preset.winRange),
      ko: normalizedRange(targets.ko, preset.koRange),
      rounds: normalizedRange(targets.rounds, [0, 20], [0, 50]),
      body: normalizedRange(targets.body, [0, 1]),
    },
    count: { mode: countMode, min: countMin, max: countMax },
    composition: raw.composition || "any",
    boss: { mode: raw.boss?.mode || "any", max: clamp(raw.boss?.max ?? 1, 0, 12) },
    duplicates: { mode: raw.duplicates?.mode || "allowed", max: clamp(raw.duplicates?.max ?? 2, 1, 12) },
    heterogeneity: { mode: raw.heterogeneity?.mode || "any", extremeAllowed: Boolean(raw.heterogeneity?.extremeAllowed) },
    bs: {
      min: Math.max(0, Number(raw.bs?.min) || 0), max: Math.max(0, Number(raw.bs?.max) || 999999),
      strongestMin: Math.max(0, Number(raw.bs?.strongestMin) || 0), strongestMax: Math.max(0, Number(raw.bs?.strongestMax) || 999999),
      weakestMin: Math.max(0, Number(raw.bs?.weakestMin) || 0), weakestMax: Math.max(0, Number(raw.bs?.weakestMax) || 999999),
    },
    allowedTags: array(raw.allowedTags).filter(Boolean),
    forbiddenTags: array(raw.forbiddenTags).filter(Boolean),
    slots: array(raw.slots),
    weights: { ...GENERATOR_DEFAULTS.weights, ...(raw.weights || {}) },
    seed: Number(raw.seed) || 1,
    topN: clamp(raw.topN ?? GENERATOR_DEFAULTS.topN, 1, 5),
    beamWidth: clamp(raw.beamWidth ?? GENERATOR_DEFAULTS.beamWidth, 8, 100),
    candidateLimit: clamp(raw.candidateLimit ?? GENERATOR_DEFAULTS.candidateLimit, 8, 60),
  };
}

export function distanceToRange(value, range) {
  if (!range) return 0;
  if (value < range[0]) return range[0] - value;
  if (value > range[1]) return value - range[1];
  return 0;
}

export function objectiveScore(prediction, settings) {
  const target = settings.targets;
  const weights = settings.weights;
  return weights.win * distanceToRange(prediction.party_win_probability, target.win)
    + weights.ko * distanceToRange(prediction.p_any_pc_ko, target.ko)
    + weights.rounds * distanceToRange(prediction.mean_rounds, target.rounds) / 10
    + weights.body * distanceToRange(prediction.mean_party_body_loss_fraction, target.body);
}

function scoredObjective(prediction, settings, entries) {
  // Requested outcomes are primary. Pregen deviation only breaks close ties;
  // it must never make a visibly wrong difficulty preferable to a tuned fit.
  return objectiveScore(prediction, settings) * 10
    + (Number(settings.weights.deviation) || 0) * pregenDeviation(entries);
}

export function matchesDifficultyPreset(key, prediction) {
  const preset = DIFFICULTY_PRESETS[key];
  if (!preset) return false;
  const win = Number(prediction.party_win_probability);
  const ko = Number(prediction.p_any_pc_ko);
  const winOk = preset.strict?.winMax
    ? win >= preset.winRange[0] && win < preset.winRange[1]
    : win >= preset.winRange[0] && win <= preset.winRange[1];
  const koOk = preset.strict?.koMin
    ? ko > preset.koRange[0] && ko <= preset.koRange[1]
    : ko >= preset.koRange[0] && ko <= preset.koRange[1];
  return winOk && koOk;
}

function canonicalIdentity(entries) {
  return entries.map((entry) => entry.variantKey || `${entry.baseId || entry.id}@exact`).sort().join("|");
}

function duplicateCounts(entries) {
  const counts = new Map();
  entries.forEach((entry) => counts.set(entry.baseId || entry.id, (counts.get(entry.baseId || entry.id) || 0) + 1));
  return counts;
}

function bossCount(entries) {
  return entries.filter((entry) => tagsOf(entry).has("boss")).length;
}

function matchesSlot(entry, slot = {}) {
  if (slot.npcId && entry.id !== slot.npcId) return false;
  if (slot.tag && !tagsOf(entry).has(slot.tag)) return false;
  if (Number.isFinite(Number(slot.bsMin)) && entry.bs < Number(slot.bsMin)) return false;
  if (Number.isFinite(Number(slot.bsMax)) && entry.bs > Number(slot.bsMax)) return false;
  return true;
}

function partialAllowed(entries, settings) {
  const bosses = bossCount(entries);
  if (settings.boss.mode === "forbidden" && bosses) return false;
  if (["exactly1", "required"].includes(settings.boss.mode) && bosses > 1) return false;
  if (settings.boss.mode === "maximum" && bosses > settings.boss.max) return false;
  const counts = duplicateCounts(entries);
  if (settings.duplicates.mode === "forbidden" && [...counts.values()].some((count) => count > 1)) return false;
  if (settings.duplicates.mode === "max" && [...counts.values()].some((count) => count > settings.duplicates.max)) return false;
  if (settings.duplicates.mode === "identical" && counts.size > 1) return false;
  return entries.every((entry, index) => !settings.slots[index] || matchesSlot(entry, settings.slots[index]));
}

function compositionAllowed(entries, composition) {
  const roles = entries.map((entry) => entry.archetype || entry.role);
  const bosses = entries.filter((entry) => tagsOf(entry).has("boss"));
  if (composition === "equal") return new Set(entries.map((entry) => entry.baseId || entry.id)).size === 1;
  if (composition === "few_strong") return entries.length <= 3;
  if (composition === "boss_minions") return bosses.length === 1 && entries.every((entry) => tagsOf(entry).has("boss") || tagsOf(entry).has("minion"));
  if (composition === "solo_boss") return entries.length === 1 && bosses.length === 1;
  if (composition === "swarm") return entries.length >= 4 && entries.every((entry) => tagsOf(entry).has("minion"));
  if (composition === "mixed") return new Set(roles).size >= 2;
  if (composition === "tank_glass") return roles.includes("tank") && roles.some((role) => ["striker", "shooter"].includes(role));
  return true;
}

function heterogeneityAllowed(features, settings) {
  const value = Math.max(Number(features.enemy_survivability_cv) || 0, Number(features.enemy_pressure_cv) || 0);
  if (!settings.heterogeneity.extremeAllowed && value >= 1) return false;
  if (settings.heterogeneity.mode === "low") return value <= 0.25;
  if (settings.heterogeneity.mode === "medium") return value > 0.25 && value <= 0.55;
  if (settings.heterogeneity.mode === "high") return value > 0.55 && value < 1;
  if (settings.heterogeneity.mode === "extreme") return value >= 1;
  return true;
}

function finalAllowed(entries, evaluation, settings) {
  if (!partialAllowed(entries, settings) || !compositionAllowed(entries, settings.composition)) return false;
  const bosses = bossCount(entries);
  if (["required", "exactly1"].includes(settings.boss.mode) && bosses !== 1) return false;
  const strengths = entries.map((entry) => entry.bs);
  const strongest = Math.max(...strengths), weakest = Math.min(...strengths);
  if (strongest < settings.bs.strongestMin || strongest > settings.bs.strongestMax) return false;
  if (weakest < settings.bs.weakestMin || weakest > settings.bs.weakestMax) return false;
  return heterogeneityAllowed(evaluation.features || {}, settings);
}

function targetStatus(value, range) {
  if (!range) return { ok: true, delta: 0, ignored: true };
  const delta = value < range[0] ? value - range[0] : value > range[1] ? value - range[1] : 0;
  return { ok: delta === 0, delta, ignored: false };
}

function presetTargetStatus(value, range, strictEdge) {
  const status = targetStatus(value, range);
  if (!range || !strictEdge) return status;
  if (strictEdge === "max" && value === range[1]) return { ok: false, delta: Number.EPSILON, ignored: false };
  if (strictEdge === "min" && value === range[0]) return { ok: false, delta: -Number.EPSILON, ignored: false };
  return status;
}

function structuralSignature(entries) {
  return entries.map((entry) => entry.baseId || entry.archetype || entry.role).sort().join("|");
}

function prepareLibrary(library, settings, random) {
  const allowed = new Set(settings.allowedTags), forbidden = new Set(settings.forbiddenTags);
  const eligible = library.map(makeLibraryEntry).filter((entry) => {
    const tags = tagsOf(entry);
    if (entry.bs < settings.bs.min || entry.bs > settings.bs.max) return false;
    if (allowed.size && ![...allowed].some((tag) => tags.has(tag))) return false;
    if ([...forbidden].some((tag) => tags.has(tag))) return false;
    return true;
  });
  const buckets = new Map();
  eligible.forEach((entry) => {
    const key = entry.archetype || entry.role || "other";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ entry, order: random() });
  });
  const strengthSpread = (items) => {
    const sorted = [...items].sort((a, b) => a.entry.bs - b.entry.bs || a.order - b.order);
    if (sorted.length < 3) return sorted;
    const indices = [Math.floor((sorted.length - 1) / 2), 0, sorted.length - 1];
    for (let denominator = 4; indices.length < sorted.length; denominator *= 2) {
      for (let numerator = 1; numerator < denominator && indices.length < sorted.length; numerator += 2) {
        indices.push(Math.round((sorted.length - 1) * numerator / denominator));
      }
    }
    return [...new Set(indices)].map((index) => sorted[index]);
  };
  const groups = [...buckets.values()].map(strengthSpread);
  const selected = [];
  const baseLimit = Math.min(eligible.length, Math.max(groups.length, Math.ceil(settings.candidateLimit / 2)));
  for (let depth = 0; selected.length < baseLimit && groups.some((group) => group[depth]); depth += 1) {
    for (const group of groups) {
      if (group[depth]) selected.push(group[depth].entry);
      if (selected.length >= baseLimit) break;
    }
  }
  return selected.flatMap((entry) => archetypeVariants(entry));
}

export function generateEncounterOptions({ library, locked = [], settings: rawSettings, evaluate }) {
  if (typeof evaluate !== "function") throw new TypeError("evaluate is required");
  const settings = normalizeGeneratorSettings(rawSettings);
  const random = seededRandom(settings.seed);
  const candidates = prepareLibrary(array(library), settings, random);
  const lockedEntries = array(locked).map((entry, index) => makeLibraryEntry({ ...entry, usage: "exact" }, index));
  const diagnostics = [];
  if (!candidates.length && !lockedEntries.length) return { settings, options: [], diagnostics: ["Нет NPC, подходящих под фильтры библиотеки."] };
  if (lockedEntries.length > settings.count.max) return { settings, options: [], diagnostics: ["Заблокированных NPC больше, чем разрешено ограничением количества."] };
  const evaluated = new Map();
  const evaluateEntries = (entries) => {
    const key = canonicalIdentity(entries);
    if (!evaluated.has(key)) evaluated.set(key, evaluate(entries.map((entry) => entry.profile)));
    return evaluated.get(key);
  };
  const finals = [];
  for (let desired = Math.max(settings.count.min, lockedEntries.length); desired <= settings.count.max; desired += 1) {
    let beam = [{ entries: [...lockedEntries], score: lockedEntries.length ? scoredObjective(evaluateEntries(lockedEntries).prediction, settings, lockedEntries) : 0 }];
    while (beam.length && beam[0].entries.length < desired) {
      const next = new Map();
      for (const node of beam) for (const candidate of candidates) {
        const entries = [...node.entries, candidate];
        if (!partialAllowed(entries, settings)) continue;
        const key = canonicalIdentity(entries);
        if (next.has(key)) continue;
        const evaluation = evaluateEntries(entries);
        next.set(key, { entries, evaluation, score: scoredObjective(evaluation.prediction, settings, entries) });
      }
      beam = [...next.values()].sort((a, b) => a.score - b.score || random() - 0.5).slice(0, settings.beamWidth);
    }
    for (const node of beam) {
      const evaluation = node.evaluation || evaluateEntries(node.entries);
      if (!finalAllowed(node.entries, evaluation, settings)) continue;
      finals.push({
        entries: node.entries,
        evaluation,
        score: scoredObjective(evaluation.prediction, settings, node.entries),
        targetError: objectiveScore(evaluation.prediction, settings),
        pregenDeviation: pregenDeviation(node.entries),
        identity: canonicalIdentity(node.entries),
        signature: structuralSignature(node.entries),
        status: {
          win: presetTargetStatus(evaluation.prediction.party_win_probability, settings.targets.win, settings.difficulty === "deadly" ? "max" : null),
          ko: presetTargetStatus(evaluation.prediction.p_any_pc_ko, settings.targets.ko, settings.difficulty === "deadly" ? "min" : null),
          rounds: targetStatus(evaluation.prediction.mean_rounds, settings.targets.rounds),
          body: targetStatus(evaluation.prediction.mean_party_body_loss_fraction, settings.targets.body),
        },
      });
    }
  }
  finals.sort((a, b) => a.score - b.score || a.identity.localeCompare(b.identity));
  const options = [];
  const identities = new Set(), signatures = new Map();
  for (const option of finals) {
    if (identities.has(option.identity)) continue;
    const signatureUses = signatures.get(option.signature) || 0;
    if (signatureUses >= 2 && finals.some((other) => other.signature !== option.signature && !identities.has(other.identity))) continue;
    identities.add(option.identity);
    signatures.set(option.signature, signatureUses + 1);
    options.push(option);
    if (options.length >= settings.topN) break;
  }
  if (!options.length) diagnostics.push("Точного структурного варианта при текущих ограничениях не найдено. Ограничения не были ослаблены.");
  else if (options[0].targetError > 1e-9) diagnostics.push("Точного совпадения с целевыми исходами при текущих ограничениях не найдено; показаны ближайшие варианты.");
  return { settings, options, diagnostics, evaluatedCount: evaluated.size };
}

export function marginalNpcImpact(entries, index, evaluate) {
  const normalized = entries.map(makeLibraryEntry);
  const withEnemy = evaluate(normalized.map((entry) => entry.profile)).prediction;
  const withoutEnemy = evaluate(normalized.filter((_, itemIndex) => itemIndex !== index).map((entry) => entry.profile)).prediction;
  return {
    win: withEnemy.party_win_probability - withoutEnemy.party_win_probability,
    ko: withEnemy.p_any_pc_ko - withoutEnemy.p_any_pc_ko,
    withEnemy,
    withoutEnemy,
  };
}

export function replaceGeneratedSlot({ entries, index, library, settings, evaluate }) {
  const current = array(entries).map(makeLibraryEntry);
  const target = current[index];
  if (!target || target.locked || target.source === "locked") {
    return { option: null, diagnostics: ["Заблокированный слот нельзя заменить."] };
  }
  const locked = current.filter((_, itemIndex) => itemIndex !== index).map((entry) => ({ ...entry, usage: "exact", source: "locked" }));
  const alternatives = array(library).filter((entry) => String(entry.baseId || entry.id) !== String(target.baseId || target.id));
  const result = generateEncounterOptions({
    library: alternatives.length ? alternatives : library,
    locked,
    settings: { ...settings, seed: (Number(settings?.seed) || 1) + 1, count: { mode: "exact", exact: current.length }, topN: 1 },
    evaluate,
  });
  const found = result.options[0];
  if (!found) return { option: null, diagnostics: result.diagnostics };
  // generateEncounterOptions always keeps locked entries first and appends the
  // newly selected candidate, even when it duplicates another locked identity.
  const replacement = found.entries.at(-1);
  if (!replacement) return { option: null, diagnostics: ["Замена для выбранного слота не найдена."] };
  const reordered = [...current];
  reordered[index] = replacement;
  const evaluation = evaluate(reordered.map((entry) => entry.profile));
  return {
    option: {
      ...found,
      entries: reordered,
      evaluation,
      score: scoredObjective(evaluation.prediction, normalizeGeneratorSettings(settings), reordered),
    },
    diagnostics: result.diagnostics,
  };
}
