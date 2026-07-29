const MAX_PAYLOAD_CHARS = 400000;
const allowedTypes = new Set([
  "humanoid",
  "mechanism",
  "animal",
  "beast",
  "undead",
]);

function now() {
  return new Date().toISOString();
}

function cleanText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function clampNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

function normalizeTagKey(value) {
  const key = String(value || "").toLowerCase();
  if (["boss", "chief", "minion"].includes(key)) return key;
  if (key === "support") return "minion";
  return "chief";
}

function isTechnicalWeaponName(name) {
  return /(?:^|\s)(?:пистол(?:ь|ет|и|й)?|карабин(?:ы|а|ом|у)?)(?:$|\s|[.,;:()—-])/i.test(
    ` ${String(name || "").trim()} `,
  );
}

function normalizeDamage(value, fallback) {
  const text = cleanText(value, 40).replace(/\s+/g, "");
  return /^(\d*)d\d+([+-]\d+)?$/i.test(text) ? text : fallback;
}

function normalizeAttacks(value, typeKey) {
  const source = Array.isArray(value) ? value : [];
  const count = Math.max(2, Math.min(5, source.length || 2));
  return Array.from({ length: count }, (_, index) => {
    const raw = source[index] || {};
    const poolMatch = String(raw.pool ?? "").match(/(\d+)\s*d6/i);
    const pool = clampNumber(
      poolMatch ? poolMatch[1] : raw.pool,
      1,
      8,
      index === 0 ? 4 : 3,
    );
    const technical =
      typeKey === "humanoid" &&
      (Boolean(raw.technical) || isTechnicalWeaponName(raw.name));
    return {
      templateId: cleanText(raw.templateId, 120),
      name:
        cleanText(raw.name, 160) ||
        (index === 0 ? "Основная атака" : `Атака ${index + 1}`),
      category: cleanText(raw.category || raw.type, 160) || "Обычная",
      pool,
      damage: normalizeDamage(raw.damage, index === 0 ? "d6" : "d4"),
      range:
        cleanText(raw.range, 120) ||
        (index === 0 ? "Средняя" : "Ближняя"),
      penetrating: Boolean(raw.penetrating || raw.piercing),
      text: cleanText(raw.text || raw.effect, 2500),
      restriction: cleanText(raw.restriction, 1200),
      uses: clampNumber(raw.uses, 0, 99, 0),
      technical,
      controlBonus: technical
        ? clampNumber(raw.controlBonus, 2, 7, 2)
        : 0,
      maxDurability: technical
        ? clampNumber(raw.maxDurability || raw.durability, 2, 99, 2)
        : 0,
    };
  });
}

function normalizeReactions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 5)
    .map((raw = {}) => ({
      templateId: cleanText(raw.templateId, 120),
      name: cleanText(raw.name, 200),
      trigger: cleanText(raw.trigger, 1200),
      effect: cleanText(raw.effect || raw.text, 2500),
      uses: clampNumber(raw.uses, 0, 99, 0),
      power: cleanText(raw.power, 40) || "simple",
      tags: Array.isArray(raw.tags)
        ? raw.tags.map((tag) => cleanText(tag, 60)).filter(Boolean).slice(0, 12)
        : [],
    }))
    .filter((reaction) => reaction.name);
}

export function normalizeEnemyTemplate(enemy) {
  if (!enemy || typeof enemy !== "object") {
    throw new Error("Статблок не передан.");
  }
  const name = cleanText(enemy.name, 120);
  if (!name) throw new Error("Укажите название противника.");
  const typeKey = allowedTypes.has(enemy.typeKey)
    ? enemy.typeKey
    : "humanoid";
  const attacks = normalizeAttacks(enemy.attacks, typeKey);
  const tagKey = normalizeTagKey(enemy.tagKey || enemy.roleKey);
  const durability =
    typeKey === "humanoid"
      ? Math.max(0, ...attacks.map((attack) => attack.maxDurability || 0))
      : 0;

  return {
    id: cleanText(enemy.id, 100) || crypto.randomUUID(),
    name,
    typeKey,
    classKey: cleanText(enemy.classKey, 40) || "none",
    tagKey,
    roleKey: tagKey,
    level: clampNumber(enemy.level, 1, 20, 1),
    bp: clampNumber(enemy.bp, 20, 5000, 1000),
    difficultyKey: cleanText(enemy.difficultyKey, 20) || "medium",
    hp: clampNumber(enemy.hp, 1, 999, 10),
    nerve: clampNumber(enemy.nerve, 0, 999, 0),
    armor: clampNumber(enemy.armor, 0, 8, 0),
    pz: clampNumber(enemy.pz, 3, 10, 4),
    physicalDefensePool: clampNumber(
      enemy.physicalDefensePool,
      1,
      8,
      attacks[0].pool,
    ),
    mentalDefensePool: clampNumber(
      enemy.mentalDefensePool,
      1,
      8,
      attacks[0].pool,
    ),
    pool: attacks[0].pool,
    speed: clampNumber(enemy.speed, 0, 8, 3),
    reactionLimit: clampNumber(enemy.reactionLimit, 0, 4, 1),
    durability,
    attacks,
    reactions: normalizeReactions(enemy.reactions),
    properties: Array.isArray(enemy.properties)
      ? enemy.properties
          .map((item) => cleanText(item, 500))
          .filter(Boolean)
          .slice(0, 30)
      : [],
    notes: cleanText(enemy.notes, 5000),
    createdAt: cleanText(enemy.createdAt, 80),
    updatedAt: cleanText(enemy.updatedAt, 80),
  };
}

export async function saveEncounter(db, user, payload) {
  if (typeof payload !== "string") throw new Error("Ожидалась строка JSON.");
  if (payload.length > MAX_PAYLOAD_CHARS) {
    throw new Error("Состояние боя слишком велико.");
  }
  JSON.parse(payload);
  const savedAt = now();
  await db
    .prepare(
      `INSERT INTO calculator_encounters (user_email, updated_at, data_json)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(user_email) DO UPDATE SET
         updated_at = excluded.updated_at,
         data_json = excluded.data_json`,
    )
    .bind(user.email, savedAt, payload)
    .run();
  return { ok: true, savedAt, chunks: 1 };
}

export async function loadEncounter(db, user) {
  const row = await db
    .prepare(
      `SELECT updated_at, data_json
       FROM calculator_encounters WHERE user_email = ?1`,
    )
    .bind(user.email)
    .first();
  if (!row) return { found: false, payload: null, savedAt: null };
  JSON.parse(row.data_json);
  return { found: true, payload: row.data_json, savedAt: row.updated_at };
}

export async function clearEncounter(db, user) {
  await db
    .prepare("DELETE FROM calculator_encounters WHERE user_email = ?1")
    .bind(user.email)
    .run();
  return { ok: true };
}

export async function getEnemyLibrary(db) {
  const { results = [] } = await db
    .prepare(
      `SELECT data_json FROM calculator_enemies
       ORDER BY updated_at DESC, name COLLATE NOCASE ASC`,
    )
    .all();
  return results.map((row) => JSON.parse(row.data_json));
}

export async function saveEnemyTemplate(db, user, input) {
  const normalized = normalizeEnemyTemplate(input);
  const existing = await db
    .prepare("SELECT created_at FROM calculator_enemies WHERE id = ?1")
    .bind(normalized.id)
    .first();
  const timestamp = now();
  const saved = {
    ...normalized,
    createdAt: existing?.created_at || normalized.createdAt || timestamp,
    updatedAt: timestamp,
  };
  await db
    .prepare(
      `INSERT INTO calculator_enemies (
         id, created_at, updated_at, updated_by, name, type_key, class_key,
         tag_key, level, bp, difficulty_key, data_json
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
       ON CONFLICT(id) DO UPDATE SET
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by,
         name = excluded.name,
         type_key = excluded.type_key,
         class_key = excluded.class_key,
         tag_key = excluded.tag_key,
         level = excluded.level,
         bp = excluded.bp,
         difficulty_key = excluded.difficulty_key,
         data_json = excluded.data_json`,
    )
    .bind(
      saved.id,
      saved.createdAt,
      saved.updatedAt,
      user.email,
      saved.name,
      saved.typeKey,
      saved.classKey,
      saved.tagKey,
      saved.level,
      saved.bp,
      saved.difficultyKey,
      JSON.stringify(saved),
    )
    .run();
  return saved;
}

export async function deleteEnemyTemplate(db, _user, id) {
  const safeId = cleanText(id, 100);
  if (!safeId) throw new Error("Не передан идентификатор противника.");
  const result = await db
    .prepare("DELETE FROM calculator_enemies WHERE id = ?1")
    .bind(safeId)
    .run();
  return { ok: true, deleted: Boolean(result.meta.changes) };
}

