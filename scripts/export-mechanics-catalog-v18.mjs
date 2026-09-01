import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_MECHANICS_CATALOG_V18_PATH = path.join(
  root,
  "src",
  "client",
  "calculator-v8",
  "data",
  "mechanics_catalog_v18.json",
);

const TYPES = ["humanoid", "mechanism", "animal", "beast", "undead"];
const REACTION_KINDS = new Set([
  "hindrance_defense",
  "reroll_defense",
  "damage_reduction",
  "temporary_armor",
  "intercept",
  "movement_denial",
  "forced_movement",
  "condition_resistance",
]);
const TARGETING = new Set(["focus", "split", "split_or_focus"]);

function snakeCase(value) {
  return String(value).replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function normalizeKeys(value) {
  if (Array.isArray(value)) return value.map(normalizeKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [snakeCase(key), normalizeKeys(item)]),
  );
}

export function normalizeV18Mechanic(rawMechanic = {}) {
  const mechanic = normalizeKeys(rawMechanic);

  if (mechanic.extra_damage !== undefined) {
    mechanic.bonus_damage = mechanic.extra_damage;
    delete mechanic.extra_damage;
  }
  if (mechanic.fixed_damage !== undefined) {
    mechanic.damage_override = mechanic.fixed_damage;
    delete mechanic.fixed_damage;
  }
  if (mechanic.healing !== undefined) {
    if (typeof mechanic.healing === "string") mechanic.heal = mechanic.healing;
    else mechanic.heal_flat = mechanic.healing;
    delete mechanic.healing;
  }
  if (mechanic.penetration !== undefined) {
    mechanic.penetration_bonus = mechanic.penetration;
    delete mechanic.penetration;
  }
  if (mechanic.reduction_die !== undefined) {
    mechanic.reduction_expr = mechanic.reduction_die;
    delete mechanic.reduction_die;
  }
  if (mechanic.incoming_body_damage_delta !== undefined) {
    mechanic.bonus_body_damage = mechanic.incoming_body_damage_delta;
    delete mechanic.incoming_body_damage_delta;
  }
  if (mechanic.target_body_fraction_max !== undefined) {
    mechanic.target_hp_fraction_max = mechanic.target_body_fraction_max;
    delete mechanic.target_body_fraction_max;
  }
  if (mechanic.body_damage === 0) mechanic.deal_damage = false;
  if (mechanic.kind === "temporary_armor" && mechanic.armor_delta !== undefined) {
    mechanic.armor_bonus = mechanic.armor_delta;
    delete mechanic.armor_delta;
  }
  if (mechanic.kind === "multiattack") {
    const source = mechanic.multiattack || mechanic;
    mechanic.multiattack = {
      attacks: Number(source.attacks),
      targeting: String(source.targeting || "split_or_focus"),
      max_targets: Number(source.max_targets || source.attacks),
    };
    mechanic.max_targets = mechanic.multiattack.max_targets;
    delete mechanic.attacks;
    delete mechanic.targeting;
  }

  return mechanic;
}

function exportEntry(type, item, descriptionKey) {
  return {
    id: item.id,
    type,
    name: item.name,
    description: String(item[descriptionKey] || ""),
    ...normalizeV18Mechanic(item.mechanic),
  };
}

function validateCatalog(catalog) {
  const errors = [];
  for (const type of TYPES) {
    for (const section of ["actions", "specials", "reactions", "passives"]) {
      if (!Array.isArray(catalog[section]?.[type])) errors.push(`${section}.${type} is missing`);
    }
    for (const item of catalog.specials[type]) {
      if (!item.kind || !Number.isFinite(item.uses)) errors.push(`${item.id}: invalid special`);
      if (item.ultimate === true && item.uses < 1) errors.push(`${item.id}: unlimited ultimate`);
      if (item.kind === "multiattack") {
        const multi = item.multiattack;
        if (!multi || !Number.isInteger(multi.attacks) || multi.attacks < 2) errors.push(`${item.id}: invalid multiattack attacks`);
        if (!TARGETING.has(multi?.targeting)) errors.push(`${item.id}: invalid multiattack targeting`);
        if (!Number.isInteger(multi?.max_targets) || multi.max_targets < 1 || multi.max_targets > multi.attacks) errors.push(`${item.id}: invalid multiattack max_targets`);
      }
    }
    for (const item of catalog.reactions[type]) {
      if (!REACTION_KINDS.has(item.kind)) errors.push(`${item.id}: offensive/unknown reaction kind ${item.kind}`);
      if (!Number.isFinite(item.uses)) errors.push(`${item.id}: invalid reaction uses`);
    }
  }
  if (errors.length) throw new Error(`V18 mechanics catalog invalid:\n${errors.join("\n")}`);
}

export async function buildMechanicsCatalogV18() {
  const source = await readFile(path.join(root, "calculator-script-source", "Dict.html"), "utf8");
  const libraries = new Function(
    `${source.replace(/<\/?script>/g, "")}; return { attacks: ATTACK_LIBRARY, specials: SPECIAL_ACTION_LIBRARY, reactions: REACTION_LIBRARY, passives: PASSIVE_TRAITS };`,
  )();
  const catalog = {
    version: "mitrinium-mechanics-catalog-v18",
    schema: "mitrinium-v18-structured-mechanics",
    source: "calculator-script-source/Dict.html",
    runtime_contract: {
      production_predictor: "v15",
      generator_axes: ["party_win_probability", "mean_pc_ko_fraction"],
      enemy_nerve: {
        finite: true,
        spend: "normal_to_advantage_only",
        never_spend_for: ["hindrance_to_normal", "already_advantage"],
      },
      pacing: {
        target_rounds: [5, 6],
        heavy_fight_rounds_max: 7,
        pathological_rounds_over: 10,
        role: "quality_guardrail",
      },
    },
    actions: {},
    specials: {},
    reactions: {},
    passives: {},
  };
  for (const type of TYPES) {
    catalog.actions[type] = libraries.attacks[type].map((item) => exportEntry(type, item, "effect"));
    catalog.specials[type] = libraries.specials[type].map((item) => exportEntry(type, item, "effect"));
    catalog.reactions[type] = libraries.reactions[type].map((item) => exportEntry(type, item, "effect"));
    catalog.passives[type] = libraries.passives[type].map((item) => exportEntry(type, item, "text"));
  }
  validateCatalog(catalog);
  return catalog;
}

export async function exportMechanicsCatalogV18(outputPath = DEFAULT_MECHANICS_CATALOG_V18_PATH) {
  const catalog = await buildMechanicsCatalogV18();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  return catalog;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalog = await exportMechanicsCatalogV18();
  const count = (section) => Object.values(catalog[section]).flat().length;
  console.log(`Exported V18 mechanics catalog: ${count("actions")} actions, ${count("reactions")} reactions, ${count("passives")} passives.`);
}
