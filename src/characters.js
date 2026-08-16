import { getCharacterDeletionPolicy } from "./settings.js";

function now() {
  return new Date().toISOString();
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizeCharacterLevel(value) {
  if (value === null || value === undefined || value === "") return 1;
  const level = Number(value);
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new Error("Уровень должен быть целым числом от 1 до 20.");
  }
  return level;
}

const CONTROL_METHOD_NAMES = ["Порох", "Пар", "Кристаллы", "Реагенты"];

const CLASS_CONTROL_BONUSES = {
  Психопат: { Реагенты: 3, Порох: 2 },
  Кустарь: { Пар: 3, Кристаллы: 2 },
  Воротила: { Порох: 2, Реагенты: 1, Кристаллы: 2 },
  Рекрут: { Порох: 3, Пар: 2 },
  Менталист: { Кристаллы: 3, Реагенты: 1, Порох: 1 },
  Натуралист: { Реагенты: 2, Кристаллы: 2, Порох: 1 },
};

const SKILL_RULES_VERSION = 5;
const ATTRIBUTE_RULES_VERSION = 2;

const SKILL_SCHEMA = {
  napor: ["fehtovanie", "atletika", "stoikost", "sila", "vyzhivanie"],
  snorovka: ["draka", "uklonenie", "skrytnost", "lovkostRuk", "obman"],
  nyuh: ["vnimatelnost", "strelba", "priroda", "znanieUlits", "psihologiya"],
  smetka: ["mehanizmy", "himiya", "medicina", "zakon", "erudiciya"],
  gospodstvo: ["ugrozy", "ubezhdenie", "komandovanie", "disciplina", "scena"],
};

const LEGACY_SKILL_PATHS = {
  "napor:stoikost": "napor:stoikost",
  "napor:sila": "napor:draka",
  "zhila:atletika": "napor:atletika",
  "zhila:disciplina": "napor:disciplina",
  "losk:vnushenie": "napor:vyzhivanie",
  "napor:draka": "snorovka:fehtovanie",
  "smetka:skrytnost": "snorovka:skrytnost",
  "smetka:lovkostRuk": "snorovka:lovkostRuk",
  "smetka:uklonenie": "snorovka:uklonenie",
  "nyuh:strelba": "snorovka:strelba",
  "nyuh:priroda": "nyuh:priroda",
  "nyuh:vnimatelnost": "nyuh:vnimatelnost",
  "nyuh:znanieUlits": "nyuh:znanieUlits",
  "losk:psiho": "nyuh:psihologiya",
  "losk:etiket": "nyuh:etiket",
  "smetka:mehanizmy": "smetka:mehanizmy",
  "nyuh:zakon": "smetka:zakon",
  "zhila:ekonomika": "smetka:ekonomika",
  "zhila:himiya": "smetka:himiya",
  "zhila:medicina": "smetka:medicina",
  "napor:ugrozy": "gospodstvo:ugrozy",
  "smetka:obman": "gospodstvo:obman",
  "napor:liderstvo": "gospodstvo:komandovanie",
  "losk:ubezhdenie": "gospodstvo:ubezhdenie",
  "losk:scena": "gospodstvo:scena",
};

const VERSION_4_SKILL_PATHS = {
  "napor:stoikost": "napor:stoikost",
  "napor:draka": "snorovka:draka",
  "napor:atletika": "napor:atletika",
  "napor:disciplina": "gospodstvo:disciplina",
  "napor:vyzhivanie": "napor:vyzhivanie",
  "snorovka:fehtovanie": "napor:fehtovanie",
  "snorovka:skrytnost": "snorovka:skrytnost",
  "snorovka:lovkostRuk": "snorovka:lovkostRuk",
  "snorovka:uklonenie": "snorovka:uklonenie",
  "snorovka:strelba": "nyuh:strelba",
  "nyuh:priroda": "nyuh:priroda",
  "nyuh:vnimatelnost": "nyuh:vnimatelnost",
  "nyuh:znanieUlits": "nyuh:znanieUlits",
  "nyuh:psihologiya": "nyuh:psihologiya",
  "smetka:mehanizmy": "smetka:mehanizmy",
  "smetka:zakon": "smetka:zakon",
  "smetka:ekonomika": "smetka:erudiciya",
  "smetka:himiya": "smetka:himiya",
  "smetka:medicina": "smetka:medicina",
  "gospodstvo:ugrozy": "gospodstvo:ugrozy",
  "gospodstvo:obman": "snorovka:obman",
  "gospodstvo:komandovanie": "gospodstvo:komandovanie",
  "gospodstvo:ubezhdenie": "gospodstvo:ubezhdenie",
  "gospodstvo:scena": "gospodstvo:scena",
};

export function normalizeCharacterAttributes(character = {}) {
  const source = character.attributes && typeof character.attributes === "object"
    ? character.attributes
    : {};
  const legacy = Number(character.attributeRulesVersion || 0) < ATTRIBUTE_RULES_VERSION;
  const pick = (key, legacyKey = key) => clamp(
    Math.round(numberOr(legacy ? source[legacyKey] : source[key], 1)),
    1,
    3,
  );
  return {
    ...character,
    attributes: {
      napor: pick("napor"),
      snorovka: pick("snorovka", "smetka"),
      nyuh: pick("nyuh"),
      smetka: pick("smetka", "zhila"),
      gospodstvo: pick("gospodstvo", "losk"),
    },
    attributeRulesVersion: ATTRIBUTE_RULES_VERSION,
  };
}

export function calculateCharacterResources(attributes = {}) {
  return {
    body: 4 + (numberOr(attributes.napor, 1) + numberOr(attributes.snorovka, 1)) * 2,
    mainNerve: numberOr(attributes.gospodstvo, 1) + numberOr(attributes.nyuh, 1),
    bonusNerve: 3,
  };
}

export function normalizeCharacterSkills(character = {}) {
  const sourceSkills =
    character.skills && typeof character.skills === "object"
      ? character.skills
      : {};
  const savedValues = Object.values(sourceSkills).flatMap((group) =>
    group && typeof group === "object" ? Object.values(group) : [],
  );
  const savedVersion = Number(character.skillRulesVersion || 0);
  const allSkillsAtLeastOne =
    savedValues.length > 0 &&
    savedValues.every((value) => Number.isFinite(Number(value)) && Number(value) >= 1);
  const savedTotal = savedValues.reduce(
    (total, value) => total + numberOr(value, 0),
    0,
  );
  const legacySkills =
    allSkillsAtLeastOne &&
    (savedVersion < 2 ||
      (savedVersion === 2 &&
        !character.advancedEditMode &&
        savedTotal > 21));
  const normalizedSource = {};
  for (const [groupKey, group] of Object.entries(sourceSkills)) {
    for (const [skillKey, value] of Object.entries(group || {})) {
      normalizedSource[`${groupKey}:${skillKey}`] = clamp(
        Math.round(numberOr(value, legacySkills ? 1 : 0)) - (legacySkills ? 1 : 0),
        0, 3,
      );
    }
  }
  const migrated = {};
  for (const [path, value] of Object.entries(normalizedSource)) {
    const version4Path = savedVersion < 4 ? (LEGACY_SKILL_PATHS[path] || path) : path;
    const currentPath = savedVersion < 5 ? (VERSION_4_SKILL_PATHS[version4Path] || version4Path) : version4Path;
    migrated[currentPath] = value;
  }
  const skills = {};
  for (const [groupKey, keys] of Object.entries(SKILL_SCHEMA)) {
    skills[groupKey] = {};
    for (const skillKey of keys) skills[groupKey][skillKey] = migrated[`${groupKey}:${skillKey}`] || 0;
  }

  return {
    ...character,
    skills,
    skillRulesVersion: SKILL_RULES_VERSION,
  };
}

export function normalizeCharacterControl(value, className = "") {
  const classBonuses = CLASS_CONTROL_BONUSES[String(className || "")] || {};
  const source =
    value && typeof value === "object"
      ? value.methods && typeof value.methods === "object"
        ? value.methods
        : value
      : {};
  const methods = {};

  for (const name of CONTROL_METHOD_NAMES) {
    const saved =
      source[name] && typeof source[name] === "object" ? source[name] : {};
    methods[name] = {
      level: clamp(Math.round(numberOr(saved.level, 1)), 1, 5),
      bonus: clamp(
        Math.round(numberOr(saved.bonus, classBonuses[name] || 0)),
        -20,
        20,
      ),
    };
  }

  return { methods };
}

function validateCharacter(character, { allowIncomplete = false } = {}) {
  if (!character || typeof character !== "object") {
    throw new Error("Данные персонажа отсутствуют.");
  }

  if (!allowIncomplete && !String(character.name || "").trim()) {
    throw new Error("Укажите имя персонажа.");
  }

  normalizeCharacterLevel(character.level);

  for (const value of Object.values(character.attributes || {})) {
    const stat = numberOr(value, NaN);
    if (!Number.isFinite(stat) || stat < 1 || stat > 3) {
      throw new Error("Значение Атрибута должно быть от 1 до 3.");
    }
  }

  for (const group of Object.values(character.skills || {})) {
    for (const value of Object.values(group || {})) {
      const stat = numberOr(value, NaN);
      if (!Number.isFinite(stat) || stat < 0 || stat > 3) {
        throw new Error("Значение Навыка должно быть от 0 до 3.");
      }
    }
  }
}

export function sanitizeState(state, resources) {
  const safeState = state || {};
  const safeResources = resources || {};
  const money = safeState.money || {};
  const maxBody = Math.max(0, numberOr(safeResources.body, 0));
  const maxMainNerve = Math.max(0, numberOr(safeResources.mainNerve, 0));
  const maxBonusNerve = Math.max(0, numberOr(safeResources.bonusNerve, 0));
  const maxArmor = Math.max(0, numberOr(safeState.maxArmor, 0));

  return {
    currentBody: clamp(numberOr(safeState.currentBody, maxBody), 0, maxBody),
    currentArmor: clamp(
      numberOr(safeState.currentArmor, maxArmor),
      0,
      maxArmor,
    ),
    maxArmor,
    currentMainNerve: clamp(
      numberOr(safeState.currentMainNerve, maxMainNerve),
      0,
      maxMainNerve,
    ),
    currentBonusNerve: clamp(
      numberOr(safeState.currentBonusNerve, maxBonusNerve),
      0,
      maxBonusNerve,
    ),
    money: {
      gold: Math.max(0, numberOr(money.gold, 0)),
      farthings: Math.max(0, numberOr(money.farthings, 0)),
      pekkels: Math.max(0, numberOr(money.pekkels, 0)),
    },
    notes: String(safeState.notes || "").slice(0, 10000),
    initialized: true,
  };
}

async function getRecord(db, id) {
  return db
    .prepare(
      `SELECT id, created_at, updated_at, owner_email, level, data_json, hidden
       FROM characters WHERE id = ?1`,
    )
    .bind(String(id))
    .first();
}

function assertOwner(record, user, message) {
  if (!record) throw new Error("Персонаж не найден.");
  if (record.owner_email !== user.email && !user.isAdmin) {
    throw new Error(message);
  }
}

function assertAdmin(user) {
  if (!user.isAdmin) {
    throw new Error("Действие доступно только администратору.");
  }
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Укажите корректный email владельца.");
  }
  return email;
}

export async function saveCharacter(db, user, input) {
  input = normalizeCharacterSkills(normalizeCharacterAttributes(input || {}));
  const level = normalizeCharacterLevel(input?.level);
  const control = normalizeCharacterControl(input?.control, input?.className);
  const isComplete = input?.isComplete !== false;
  validateCharacter({ ...input, level, control }, { allowIncomplete: !isComplete });

  const id = String(input.id || crypto.randomUUID());
  const existing = await getRecord(db, id);
  if (existing) {
    assertOwner(existing, user, "Нельзя редактировать чужого персонажа.");
  }

  const timestamp = now();
  const ownerEmail = existing?.owner_email || user.email;
  const data = {
    ...input,
    id,
    level,
    control,
    isComplete,
    ownerEmail,
    resources: calculateCharacterResources(input.attributes),
  };
  delete data.state;

  await db
    .prepare(
      `INSERT INTO characters (
         id, created_at, updated_at, name, player, class_name, level,
         owner_email, data_json, hidden
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0)
       ON CONFLICT(id) DO UPDATE SET
         updated_at = excluded.updated_at,
         name = excluded.name,
         player = excluded.player,
         class_name = excluded.class_name,
         level = excluded.level,
         data_json = excluded.data_json`,
    )
    .bind(
      id,
      existing?.created_at || timestamp,
      timestamp,
      String(input.name || ""),
      String(input.player || ""),
      String(input.className || ""),
      level,
      ownerEmail,
      JSON.stringify(data),
    )
    .run();

  if (input.state && typeof input.state === "object") {
    await saveCharacterState(db, user, id, input.state);
  }

  return {
    success: true,
    id,
    isComplete,
    ownerEmail,
    isAdmin: user.isAdmin,
  };
}

export async function listVisibleCharacters(db, user) {
  const deletionPolicy = await getCharacterDeletionPolicy(db);
  const query = user.isAdmin
    ? `SELECT id, created_at, updated_at, name, player, class_name, level, owner_email, data_json
       FROM characters WHERE hidden = 0 ORDER BY updated_at DESC`
    : `SELECT id, created_at, updated_at, name, player, class_name, level, owner_email, data_json
       FROM characters
       WHERE hidden = 0 AND owner_email = ?1
       ORDER BY updated_at DESC`;

  const statement = db.prepare(query);
  const { results = [] } = user.isAdmin
    ? await statement.all()
    : await statement.bind(user.email).all();

  const hiddenRow = user.isAdmin
    ? await db
        .prepare("SELECT COUNT(*) AS count FROM characters WHERE hidden = 1")
        .first()
    : { count: 0 };

  return {
    characters: results.map((row) => {
      let data = {};
      try { data = JSON.parse(row.data_json || "{}"); } catch { data = {}; }
      return {
        id: row.id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        name: row.name,
        player: row.player,
        className: row.class_name,
        level: normalizeCharacterLevel(row.level),
        ownerEmail: row.owner_email,
        isComplete: data.isComplete !== false,
      };
    }),
    isAdmin: user.isAdmin,
    deletionPolicy,
    hiddenCount: Number(hiddenRow?.count || 0),
  };
}

export async function deleteOwnCharacter(db, user, id) {
  const record = await getRecord(db, id);
  assertOwner(record, user, "Нельзя удалить чужого персонажа.");
  const policy = await getCharacterDeletionPolicy(db);
  if (policy === "forbidden" && !user.isAdmin) {
    throw new Error("Администратор запретил пользователям удалять персонажей.");
  }
  if (policy === "archive" && !user.isAdmin) {
    await db.prepare("UPDATE characters SET hidden = 1, updated_at = ?2 WHERE id = ?1")
      .bind(String(id), now()).run();
    return { success: true, id: String(id), archived: true };
  }
  const result = await db.prepare("DELETE FROM characters WHERE id = ?1")
    .bind(String(id)).run();
  if (!result.meta.changes) throw new Error("Персонаж не найден.");
  return { success: true, id: String(id), archived: false };
}

export async function loadCharacter(db, user, id) {
  const record = await getRecord(db, id);
  assertOwner(record, user, "Нельзя открыть чужого персонажа.");

  let character;
  try {
    character = JSON.parse(record.data_json);
  } catch {
    throw new Error("Не удалось прочитать JSON персонажа.");
  }

  character = normalizeCharacterSkills(normalizeCharacterAttributes(character));
  character.isComplete = character.isComplete !== false;

  character.level = normalizeCharacterLevel(
    character.level ?? record.level,
  );
  character.control = normalizeCharacterControl(
    character.control,
    character.className,
  );
  character.resources = calculateCharacterResources(character.attributes);

  const stateRow = await db
    .prepare("SELECT data_json FROM character_states WHERE character_id = ?1")
    .bind(String(id))
    .first();

  let storedState = character.state || {};
  let hasStoredState = Object.keys(storedState).length > 0;
  if (stateRow?.data_json) {
    try {
      storedState = JSON.parse(stateRow.data_json);
      hasStoredState = true;
    } catch {
      storedState = {};
      hasStoredState = false;
    }
  }

  character.state = sanitizeState(storedState, character.resources || {});
  character.state.initialized = hasStoredState;
  return character;
}

export async function saveCharacterState(db, user, id, state) {
  const record = await getRecord(db, id);
  assertOwner(record, user, "Нельзя менять состояние чужого персонажа.");

  const character = JSON.parse(record.data_json);
  const sanitized = sanitizeState(state, character.resources || {});

  await db
    .prepare(
      `INSERT INTO character_states (character_id, updated_at, data_json)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(character_id) DO UPDATE SET
         updated_at = excluded.updated_at,
         data_json = excluded.data_json`,
    )
    .bind(String(id), now(), JSON.stringify(sanitized))
    .run();

  return {
    success: true,
    id: String(id),
    state: sanitized,
  };
}

export async function hideCharacter(db, user, id) {
  if (!user.isAdmin) {
    throw new Error("Скрывать персонажей может только администратор.");
  }

  const result = await db
    .prepare("UPDATE characters SET hidden = 1 WHERE id = ?1")
    .bind(String(id))
    .run();

  if (!result.meta.changes) throw new Error("Персонаж не найден.");

  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM characters WHERE hidden = 1")
    .first();
  return { success: true, hiddenCount: Number(row?.count || 0) };
}

export async function restoreHiddenCharacters(db, user) {
  if (!user.isAdmin) {
    throw new Error("Возвращать персонажей может только администратор.");
  }
  await db.prepare("UPDATE characters SET hidden = 0 WHERE hidden = 1").run();
  return { success: true, hiddenCount: 0 };
}

export async function adminListCharacters(db, user) {
  assertAdmin(user);
  const { results = [] } = await db
    .prepare(
      `SELECT c.id, c.created_at, c.updated_at, c.name, c.player,
              c.class_name, c.level, c.owner_email, c.hidden, c.data_json,
              s.data_json AS state_json
       FROM characters c
       LEFT JOIN character_states s ON s.character_id = c.id
       ORDER BY c.updated_at DESC`,
    )
    .all();

  return {
    characters: results.map((row) => {
      let data = normalizeCharacterSkills(normalizeCharacterAttributes(JSON.parse(row.data_json || "{}")));
      const level = normalizeCharacterLevel(data.level ?? row.level);
      data.level = level;
      data.control = normalizeCharacterControl(data.control, data.className);
      data.resources = calculateCharacterResources(data.attributes);
      data.isComplete = data.isComplete !== false;
      return {
        id: row.id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        name: row.name,
        player: row.player,
        className: row.class_name,
        level,
        ownerEmail: row.owner_email,
        hidden: Boolean(row.hidden),
        isComplete: data.isComplete,
        data,
        state: row.state_json ? JSON.parse(row.state_json) : null,
      };
    }),
  };
}

export async function adminSaveCharacter(db, user, input = {}) {
  assertAdmin(user);
  const ownerEmail = normalizeEmail(input.ownerEmail);
  const id = String(input.id || crypto.randomUUID());
  const existing = await getRecord(db, id);
  const currentData = existing?.data_json
    ? JSON.parse(existing.data_json)
    : {};
  const suppliedData =
    input.data && typeof input.data === "object" ? input.data : {};
  let data = {
    ...currentData,
    ...suppliedData,
    id,
    name: String(input.name ?? suppliedData.name ?? currentData.name ?? "").trim(),
    player: String(
      input.player ?? suppliedData.player ?? currentData.player ?? "",
    ).trim(),
    className: String(
      input.className ??
        suppliedData.className ??
        currentData.className ??
        "Рекрут",
    ).trim(),
    level: normalizeCharacterLevel(
      input.level ?? suppliedData.level ?? currentData.level,
    ),
    ownerEmail,
  };
  data = normalizeCharacterSkills(normalizeCharacterAttributes(data));
  data.resources = calculateCharacterResources(data.attributes);
  data.isComplete = input.isComplete ?? suppliedData.isComplete ?? currentData.isComplete ?? true;
  data.control = normalizeCharacterControl(data.control, data.className);
  delete data.state;
  validateCharacter(data, { allowIncomplete: data.isComplete === false });

  const timestamp = now();
  await db
    .prepare(
      `INSERT INTO characters (
         id, created_at, updated_at, name, player, class_name, level,
         owner_email, data_json, hidden
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
       ON CONFLICT(id) DO UPDATE SET
         updated_at = excluded.updated_at,
         name = excluded.name,
         player = excluded.player,
         class_name = excluded.class_name,
         level = excluded.level,
         owner_email = excluded.owner_email,
         data_json = excluded.data_json,
         hidden = excluded.hidden`,
    )
    .bind(
      id,
      existing?.created_at || timestamp,
      timestamp,
      data.name,
      data.player,
      data.className,
      data.level,
      ownerEmail,
      JSON.stringify(data),
      input.hidden ? 1 : 0,
    )
    .run();

  if (input.state && typeof input.state === "object") {
    await saveCharacterState(db, user, id, input.state);
  }

  return { success: true, id, ownerEmail };
}

export async function adminSetCharacterVisibility(db, user, id, hidden) {
  assertAdmin(user);
  const result = await db
    .prepare(
      "UPDATE characters SET hidden = ?2, updated_at = ?3 WHERE id = ?1",
    )
    .bind(String(id), hidden ? 1 : 0, now())
    .run();
  if (!result.meta.changes) throw new Error("Персонаж не найден.");
  return { success: true, id: String(id), hidden: Boolean(hidden) };
}

export async function adminDeleteCharacter(db, user, id) {
  assertAdmin(user);
  const result = await db
    .prepare("DELETE FROM characters WHERE id = ?1")
    .bind(String(id))
    .run();
  if (!result.meta.changes) throw new Error("Персонаж не найден.");
  return { success: true, id: String(id) };
}
