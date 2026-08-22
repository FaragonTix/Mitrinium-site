import { predictMitriniumV8 } from "./mitrinium_runtime_v8_predictor.js";

export const BASE_FEATURE_ORDER = Object.freeze([
  "log_clear_time_ratio",
  "log_count_ratio",
  "enemy_durability_hhi",
  "party_durability_hhi",
  "party_survivability_cv",
  "enemy_survivability_cv",
  "enemy_pressure_cv",
  "enemy_survival_pressure_corr",
  "log_pressure_integral_ratio",
]);

export const V8_DIFFICULTY_THRESHOLDS = Object.freeze([
  { key: "easy", label: "Легко", minWin: 0.82, maxKo: 0.35 },
  { key: "medium", label: "Средне", minWin: 0.62, maxKo: 0.62 },
  { key: "hard", label: "Сложно", minWin: 0.38, maxKo: 0.82 },
  { key: "deadly", label: "Смертельно", minWin: 0, maxKo: 1 },
]);

const EPSILON = 1e-12;
const hitDistributionCache = new Map();
const damageDistributionCache = new Map();
let runtimePromise;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function pzFromAttributes(agility, wits) {
  return 2 + Math.ceil((finite(agility, 0) + finite(wits, 0)) / 2);
}

const CHARACTER_ATTRIBUTE_LABELS = Object.freeze({
  "напор": "napor",
  "сноровка": "snorovka",
  "нюх": "nyuh",
  "сметка": "smetka",
  "господство": "gospodstvo",
});

const CHARACTER_SKILL_LABELS = Object.freeze({
  "фехтование": ["napor", "fehtovanie"],
  "драка": ["napor", "draka"],
  "метание": ["napor", "metanie"],
  "стойкость": ["napor", "stoikost"],
  "сила": ["napor", "sila"],
  "выживание": ["napor", "vyzhivanie"],
  "координация": ["snorovka", "koordinatsiya"],
  "вождение": ["snorovka", "vozhdenie"],
  "уклонение": ["snorovka", "uklonenie"],
  "скрытность": ["snorovka", "skrytnost"],
  "ловкость рук": ["snorovka", "lovkostRuk"],
  "взлом": ["snorovka", "vzlom"],
  "внимательность": ["nyuh", "vnimatelnost"],
  "стрельба": ["nyuh", "strelba"],
  "природа": ["nyuh", "priroda"],
  "знание улиц": ["nyuh", "znanieUlits"],
  "психология": ["nyuh", "psihologiya"],
  "восприятие": ["nyuh", "vospriyatie"],
  "механизмы": ["smetka", "mehanizmy"],
  "химия": ["smetka", "himiya"],
  "медицина": ["smetka", "medicina"],
  "закон": ["smetka", "zakon"],
  "эрудиция": ["smetka", "erudiciya"],
  "экономика": ["smetka", "ekonomika"],
  "угрозы": ["gospodstvo", "ugrozy"],
  "убеждение": ["gospodstvo", "ubezhdenie"],
  "командование": ["gospodstvo", "komandovanie"],
  "обман": ["gospodstvo", "obman"],
  "дисциплина": ["gospodstvo", "disciplina"],
  "публика": ["gospodstvo", "publika"],
});

function normalizedRussianLabel(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

function characterPoolFromText(poolText, character = {}) {
  const attributes = character.attributes || {};
  const skills = character.skills || {};
  const alternatives = String(poolText || "").split(/\s+или\s+/i);
  const values = alternatives.map((alternative) => {
    const match = alternative.match(/([А-ЯЁа-яё ]+)\s*\+\s*([А-ЯЁа-яё ]+)/);
    if (!match) return null;
    const attributeKey = CHARACTER_ATTRIBUTE_LABELS[normalizedRussianLabel(match[1])];
    const skillPath = CHARACTER_SKILL_LABELS[normalizedRussianLabel(match[2])];
    if (!attributeKey || !skillPath) return null;
    return finite(attributes[attributeKey], 0) + finite(skills[skillPath[0]]?.[skillPath[1]], 0);
  }).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function equipmentPenetration(item = {}) {
  const tag = (item.tags || []).find((value) => /пробитие\s*\d+/i.test(String(value)));
  return tag ? finite(String(tag).match(/\d+/)?.[0], 0) : finite(item.penetration, 0);
}

function characterWeapons(character = {}, equipmentCatalog = []) {
  const selected = new Set(Array.isArray(character.equipment) ? character.equipment.map(String) : []);
  return equipmentCatalog
    .filter((item) => selected.has(String(item.id)) && /^\d*d\d+(?:[+-]\d+)?$/i.test(String(item.damage || "").replace(/\s+/g, "")))
    .map((item) => {
      const pool = characterPoolFromText(item.pool, character);
      if (!Number.isFinite(pool)) return null;
      const damage = parseDamage(item.damage);
      const penetration = equipmentPenetration(item);
      const expl = finite(item.exploitation, 3);
      const averageDamage = damage.dice * (damage.sides + 1) / 2 + damage.modifier;
      return {
        id: String(item.id),
        name: String(item.name || item.id),
        pool: clamp(Math.round(pool), 2, 8),
        expl: clamp(Math.round(expl), 0, 12),
        damage: damage.text,
        penetration: clamp(Math.round(penetration), 0, 20),
        score: pool * 2 - expl + averageDamage + penetration * 2,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, "ru"));
}

export function characterSheetToCombatProfile(character = {}, equipmentCatalog = [], weaponId = "") {
  const attributes = character.attributes || {};
  const resources = character.resources || {};
  const state = character.state || {};
  const catalogArmor = equipmentCatalog
    .filter((item) => (character.equipment || []).includes(item.id))
    .reduce((maximum, item) => Math.max(maximum, finite(item.armor, 0)), 0);
  const weapons = characterWeapons(character, equipmentCatalog);
  const weapon = weapons.find((item) => item.id === String(weaponId)) || weapons[0] || null;
  const initialized = state.initialized === true;
  const profile = normalizeCombatProfile({
    name: character.name,
    body: initialized ? state.currentBody : resources.body,
    armor: initialized
      ? state.currentArmor
      : finite(state.maxArmor, catalogArmor),
    agility: attributes.snorovka,
    wits: attributes.smetka,
    pz: resources.protection,
    pool: weapon?.pool ?? 4,
    expl: weapon?.expl ?? 3,
    damage: weapon?.damage ?? "d8",
    penetration: weapon?.penetration ?? 0,
  });
  return {
    profile: {
      ...profile,
      agility: finite(attributes.snorovka, 0),
      wits: finite(attributes.smetka, 0),
    },
    weapons,
    selectedWeaponId: weapon?.id || "",
    isComplete: character.isComplete !== false,
    usesCurrentState: initialized,
  };
}

export function parseDamage(value = "d8") {
  const text = String(value).trim().toLowerCase().replace(/\s+/g, "");
  const match = text.match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!match) throw new Error(`Некорректный урон: ${value}`);
  const dice = clamp(finite(match[1] || 1, 1), 1, 6);
  const sides = clamp(finite(match[2], 8), 2, 20);
  const modifier = finite(match[3] || 0, 0);
  return { dice, sides, modifier, text: `${dice === 1 ? "" : dice}d${sides}${modifier > 0 ? `+${modifier}` : modifier < 0 ? modifier : ""}` };
}

export function normalizeCombatProfile(raw = {}) {
  const damage = parseDamage(raw.damage ?? raw.damageDie ?? "d8");
  const calculatedPz = raw.pz === undefined || raw.pz === null || raw.pz === ""
    ? pzFromAttributes(raw.agility ?? raw.snorovka, raw.wits ?? raw.smekalka)
    : finite(raw.pz, 4);
  return {
    body: Math.max(1, Math.round(finite(raw.body ?? raw.hp ?? raw.maxHp, 12))),
    armor: clamp(Math.round(finite(raw.armor ?? raw.maxArmor, 0)), 0, 20),
    pz: clamp(Math.round(calculatedPz), 2, 20),
    pool: clamp(Math.round(finite(raw.pool ?? raw.attackPool, 4)), 2, 8),
    expl: clamp(Math.round(finite(raw.expl, 3)), 0, 12),
    damage: damage.text,
    penetration: clamp(Math.round(finite(raw.penetration ?? raw.pen ?? (raw.penetrating ? 1 : 0), 0)), 0, 20),
    archetype: String(raw.archetype ?? raw.tagKey ?? raw.typeKey ?? "custom"),
    name: String(raw.name ?? "Участник"),
  };
}

function damageDistribution(expression) {
  const parsed = parseDamage(expression);
  if (damageDistributionCache.has(parsed.text)) return damageDistributionCache.get(parsed.text);
  let states = new Map([[0, 1]]);
  for (let die = 0; die < parsed.dice; die += 1) {
    const next = new Map();
    for (const [total, probability] of states) {
      for (let face = 1; face <= parsed.sides; face += 1) {
        next.set(total + face, (next.get(total + face) || 0) + probability / parsed.sides);
      }
    }
    states = next;
  }
  const shifted = new Map();
  for (const [total, probability] of states) {
    const damage = Math.max(0, total + parsed.modifier);
    shifted.set(damage, (shifted.get(damage) || 0) + probability);
  }
  damageDistributionCache.set(parsed.text, shifted);
  return shifted;
}

function sceneEvent(values) {
  if (values.every((value) => value % 2 === 0)) return "breakthrough";
  if (values.every((value) => value % 2 === 1)) return "complication";
  return "none";
}

function enumerateScene(index, values, callback) {
  const sides = [4, 6, 8];
  if (index === sides.length) {
    callback(values, 1 / (4 * 6 * 8));
    return;
  }
  for (let face = 1; face <= sides[index]; face += 1) enumerateScene(index + 1, [...values, face], callback);
}

function hitMetricsFallback(pool, difficulty) {
  const key = `${pool}|${difficulty}`;
  if (hitDistributionCache.has(key)) return hitDistributionCache.get(key);
  const totals = { p_hit: 0, p_breakthrough_and_hit: 0, p_complication_and_hit: 0, p_complication_total: 0 };
  enumerateScene(0, [], (scene, sceneProbability) => {
    const event = sceneEvent(scene);
    if (event === "complication") totals.p_complication_total += sceneProbability;
    let states = new Map([[scene.join(","), { values: scene, probability: sceneProbability }]]);
    for (let die = 0; die < pool; die += 1) {
      const next = new Map();
      for (const state of states.values()) {
        for (let face = 1; face <= 6; face += 1) {
          const values = [...state.values, face].sort((a, b) => a - b);
          const stateKey = values.join(",");
          const node = next.get(stateKey) || { values, probability: 0 };
          node.probability += state.probability / 6;
          next.set(stateKey, node);
        }
      }
      states = next;
    }
    for (const state of states.values()) {
      const values = state.values;
      const efficiency = values.at(-1) + values.at(-2) - values[0] - values[1];
      if (efficiency < difficulty) continue;
      totals.p_hit += state.probability;
      if (event === "breakthrough") totals.p_breakthrough_and_hit += state.probability;
      if (event === "complication") totals.p_complication_and_hit += state.probability;
    }
  });
  hitDistributionCache.set(key, totals);
  return totals;
}

function createExactCore(bundle) {
  const hitIndex = new Map(bundle.exact_core.hit_table.map((row) => [`${row.pool}|${row.difficulty}`, row]));

  function hitMetrics(pool, difficulty) {
    return hitIndex.get(`${pool}|${difficulty}`) || hitMetricsFallback(pool, difficulty);
  }

  function initialDamageMetrics(attacker, defender) {
    const effectiveArmor = Math.max(0, defender.armor - attacker.penetration);
    let expected = 0;
    let positive = 0;
    for (const [rawDamage, probability] of damageDistribution(attacker.damage)) {
      const bodyDamage = Math.max(0, rawDamage - effectiveArmor);
      expected += bodyDamage * probability;
      if (bodyDamage > 0) positive += probability;
    }
    return { expectedBodyDamage: expected, pBodyDamage: positive };
  }

  function expectedActionsToKo(attacker, defender, pHit) {
    const distribution = damageDistribution(attacker.damage);
    const memo = new Map();
    function solve(body, armor) {
      if (body <= 0) return 0;
      const key = `${body}|${armor}`;
      if (memo.has(key)) return memo.get(key);
      memo.set(key, 0);
      let noProgress = 1 - pHit;
      let numerator = 1;
      const effectiveArmor = Math.max(0, armor - attacker.penetration);
      for (const [rawDamage, damageProbability] of distribution) {
        const probability = pHit * damageProbability;
        const bodyDamage = Math.max(0, rawDamage - effectiveArmor);
        if (bodyDamage <= 0) {
          noProgress += probability;
          continue;
        }
        numerator += probability * solve(body - bodyDamage, Math.max(0, armor - 1));
      }
      const result = numerator / Math.max(EPSILON, 1 - noProgress);
      memo.set(key, result);
      return result;
    }
    return solve(defender.body, defender.armor);
  }

  function pair(attacker, defender) {
    const difficulty = defender.pz + attacker.expl;
    const hit = hitMetrics(attacker.pool, difficulty);
    const damage = initialDamageMetrics(attacker, defender);
    return {
      hitDifficulty: difficulty,
      pHit: hit.p_hit,
      pBreakthroughAndHit: hit.p_breakthrough_and_hit,
      pComplicationAndHit: hit.p_complication_and_hit,
      expectedBodyDamageInitial: damage.expectedBodyDamage,
      pBodyDamageInitial: damage.pBodyDamage,
      expectedActionsToKo: expectedActionsToKo(attacker, defender, hit.p_hit),
    };
  }

  return { pair };
}

function coefficientOfVariation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (Math.abs(mean) < EPSILON) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function correlation(left, right) {
  if (left.length < 2 || left.length !== right.length) return 0;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] - leftMean;
    const b = right[index] - rightMean;
    covariance += a * b;
    leftVariance += a * a;
    rightVariance += b * b;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator < EPSILON ? 0 : covariance / denominator;
}

function durability(attackerTeam, defenderTeam, pair) {
  const survivalValues = defenderTeam.map((defender) => {
    const focusRate = attackerTeam.reduce((sum, attacker) => sum + 1 / pair(attacker, defender).expectedActionsToKo, 0);
    return 1 / Math.max(EPSILON, focusRate);
  });
  const total = survivalValues.reduce((sum, value) => sum + value, 0);
  const hhi = survivalValues.reduce((sum, value) => sum + (value / total) ** 2, 0);
  return { survivalValues, total, hhi, cv: coefficientOfVariation(survivalValues) };
}

function pressureValues(attackerTeam, defenderTeam, pair) {
  return attackerTeam.map((attacker) => defenderTeam.reduce((sum, defender) => {
    const metrics = pair(attacker, defender);
    return sum + metrics.pHit * metrics.expectedBodyDamageInitial;
  }, 0) / defenderTeam.length);
}

function dynamicPressureIntegral(party, enemies, pair) {
  let livingParty = party.map((unit) => ({ unit, work: 1 }));
  let livingEnemies = enemies.map((unit) => ({ unit, work: 1 }));
  let partyPressureIntegral = 0;
  let enemyPressureIntegral = 0;

  function target(attackers, defenders) {
    return defenders.map((defender) => {
      const rate = attackers.reduce((sum, attacker) => sum + 1 / pair(attacker.unit, defender.unit).expectedActionsToKo, 0);
      return { defender, rate, time: defender.work / Math.max(EPSILON, rate) };
    }).sort((left, right) => left.time - right.time)[0];
  }

  for (let event = 0; event < party.length + enemies.length && livingParty.length && livingEnemies.length; event += 1) {
    const partyTarget = target(livingParty, livingEnemies);
    const enemyTarget = target(livingEnemies, livingParty);
    const duration = Math.min(partyTarget.time, enemyTarget.time);
    partyPressureIntegral += duration * livingParty.reduce((sum, attacker) => {
      const metrics = pair(attacker.unit, partyTarget.defender.unit);
      return sum + metrics.pHit * metrics.expectedBodyDamageInitial;
    }, 0);
    enemyPressureIntegral += duration * livingEnemies.reduce((sum, attacker) => {
      const metrics = pair(attacker.unit, enemyTarget.defender.unit);
      return sum + metrics.pHit * metrics.expectedBodyDamageInitial;
    }, 0);
    partyTarget.defender.work -= duration * partyTarget.rate;
    enemyTarget.defender.work -= duration * enemyTarget.rate;
    if (partyTarget.defender.work <= EPSILON) livingEnemies = livingEnemies.filter((item) => item !== partyTarget.defender);
    if (enemyTarget.defender.work <= EPSILON) livingParty = livingParty.filter((item) => item !== enemyTarget.defender);
  }
  return { partyPressureIntegral, enemyPressureIntegral };
}

export function computeEncounterFeatures(bundle, partyInput, enemyInput) {
  const party = partyInput.map(normalizeCombatProfile);
  const enemies = enemyInput.map(normalizeCombatProfile);
  if (!party.length || !enemies.length) throw new Error("Для расчёта нужны обе стороны столкновения.");
  const core = createExactCore(bundle);
  const pairCache = new Map();
  const unitKey = (unit) => [unit.body, unit.armor, unit.pz, unit.pool, unit.expl, unit.damage, unit.penetration].join("|");
  const pair = (attacker, defender) => {
    const key = `${unitKey(attacker)}>${unitKey(defender)}`;
    if (!pairCache.has(key)) pairCache.set(key, core.pair(attacker, defender));
    return pairCache.get(key);
  };
  const enemyDurability = durability(party, enemies, pair);
  const partyDurability = durability(enemies, party, pair);
  const enemyPressure = pressureValues(enemies, party, pair);
  const pressure = dynamicPressureIntegral(party, enemies, pair);
  const pressureRatio = pressure.enemyPressureIntegral / Math.max(EPSILON, pressure.partyPressureIntegral);
  const vector = [
    Math.log(enemyDurability.total / Math.max(EPSILON, partyDurability.total)),
    Math.log(enemies.length / party.length),
    enemyDurability.hhi,
    partyDurability.hhi,
    partyDurability.cv,
    enemyDurability.cv,
    coefficientOfVariation(enemyPressure),
    correlation(enemyDurability.survivalValues, enemyPressure),
    Math.log(pressureRatio),
  ];
  return {
    party,
    enemies,
    vector,
    features: Object.fromEntries(BASE_FEATURE_ORDER.map((name, index) => [name, vector[index]])),
    diagnostics: {
      partyClearTime: enemyDurability.total,
      enemyClearTime: partyDurability.total,
      enemySurvivalValues: enemyDurability.survivalValues,
      partySurvivalValues: partyDurability.survivalValues,
      enemyPressureValues: enemyPressure,
      ...pressure,
    },
    extreme: party.some((unit) => unit.pz >= 7) || enemies.some((unit) => unit.pz >= 7),
  };
}

function predictExtremeReference(bundle, vector) {
  const reference = bundle.extreme_reference;
  if (!reference?.count) throw new Error("В runtime v8 отсутствует extreme reference.");
  const means = BASE_FEATURE_ORDER.map((_, featureIndex) => {
    let total = 0;
    for (let point = 0; point < reference.count; point += 1) total += reference.features_flat[point * reference.feature_stride + featureIndex];
    return total / reference.count;
  });
  const scales = BASE_FEATURE_ORDER.map((_, featureIndex) => {
    let total = 0;
    for (let point = 0; point < reference.count; point += 1) {
      const delta = reference.features_flat[point * reference.feature_stride + featureIndex] - means[featureIndex];
      total += delta * delta;
    }
    return Math.sqrt(total / reference.count) || 1;
  });
  let nearest = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let point = 0; point < reference.count; point += 1) {
    let distance = 0;
    for (let feature = 0; feature < reference.feature_stride; feature += 1) {
      const delta = (vector[feature] - reference.features_flat[point * reference.feature_stride + feature]) / scales[feature];
      distance += delta * delta;
    }
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = point;
    }
  }
  const prediction = Object.fromEntries(reference.outcome_order.map((name, outcomeIndex) => [
    name,
    reference.outcomes_flat[nearest * reference.outcome_stride + outcomeIndex],
  ]));
  return { prediction, referenceIndex: nearest, referenceDistance: Math.sqrt(nearestDistance) };
}

export function predictEncounter(bundle, party, enemies) {
  const computed = computeEncounterFeatures(bundle, party, enemies);
  if (computed.extreme) {
    const reference = predictExtremeReference(bundle, computed.vector);
    return { ...computed, ...reference, mode: "extreme-reference" };
  }
  return { ...computed, prediction: predictMitriniumV8(bundle, computed.vector), mode: "normal-v8" };
}

export function difficultyLabel(prediction, thresholds = V8_DIFFICULTY_THRESHOLDS) {
  return (thresholds.find((band) => prediction.party_win_probability >= band.minWin && prediction.p_any_pc_ko <= band.maxKo) || thresholds.at(-1)).label;
}

export function loadMitriniumV8(url = "./mitrinium_runtime_v8.min.json") {
  if (!runtimePromise) runtimePromise = fetch(url).then((response) => {
    if (!response.ok) throw new Error(`Mitrinium v8 runtime: HTTP ${response.status}`);
    return response.json();
  });
  return runtimePromise;
}
