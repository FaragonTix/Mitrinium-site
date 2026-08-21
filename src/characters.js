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
  Психопат: { Реагенты: 1, Порох: 1, Пар: 1 },
  Кустарь: { Пар: 1, Кристаллы: 1, Реагенты: 1 },
  Воротила: { Порох: 1, Реагенты: 1, Кристаллы: 1 },
  Рекрут: { Порох: 1, Пар: 1, Реагенты: 1 },
  Менталист: { Кристаллы: 1, Реагенты: 1, Порох: 1 },
  Натуралист: { Реагенты: 1, Кристаллы: 1, Порох: 1 },
};

const SKILL_RULES_VERSION = 6;
const ATTRIBUTE_RULES_VERSION = 2;

const SKILL_SCHEMA = {
  napor: ["fehtovanie", "draka", "metanie", "stoikost", "sila", "vyzhivanie"],
  snorovka: ["koordinatsiya", "vozhdenie", "uklonenie", "skrytnost", "lovkostRuk", "obman"],
  nyuh: ["vnimatelnost", "strelba", "priroda", "znanieUlits", "psihologiya", "vospriyatie"],
  smetka: ["mehanizmy", "himiya", "medicina", "zakon", "erudiciya", "ekonomika"],
  gospodstvo: ["ugrozy", "ubezhdenie", "komandovanie", "disciplina", "scena", "etiket"],
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

const VERSION_5_SKILL_PATHS = {
  "napor:fehtovanie": "napor:fehtovanie",
  "napor:atletika": "snorovka:koordinatsiya",
  "napor:stoikost": "napor:stoikost",
  "napor:sila": "napor:sila",
  "napor:vyzhivanie": "napor:vyzhivanie",
  "snorovka:draka": "napor:draka",
  "snorovka:uklonenie": "snorovka:uklonenie",
  "snorovka:skrytnost": "snorovka:skrytnost",
  "snorovka:lovkostRuk": "snorovka:lovkostRuk",
  "snorovka:obman": "snorovka:obman",
  "nyuh:vnimatelnost": "nyuh:vnimatelnost",
  "nyuh:strelba": "nyuh:strelba",
  "nyuh:priroda": "nyuh:priroda",
  "nyuh:znanieUlits": "nyuh:znanieUlits",
  "nyuh:psihologiya": "nyuh:psihologiya",
  "smetka:mehanizmy": "smetka:mehanizmy",
  "smetka:himiya": "smetka:himiya",
  "smetka:medicina": "smetka:medicina",
  "smetka:zakon": "smetka:zakon",
  "smetka:erudiciya": "smetka:erudiciya",
  "gospodstvo:ugrozy": "gospodstvo:ugrozy",
  "gospodstvo:ubezhdenie": "gospodstvo:ubezhdenie",
  "gospodstvo:komandovanie": "gospodstvo:komandovanie",
  "gospodstvo:disciplina": "gospodstvo:disciplina",
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
    protection: 2 + Math.ceil(
      (numberOr(attributes.snorovka, 1) + numberOr(attributes.smetka, 1)) / 2,
    ),
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
    const version5Path = savedVersion < 5 ? (VERSION_4_SKILL_PATHS[version4Path] || version4Path) : version4Path;
    const currentPath = savedVersion < 6 ? (VERSION_5_SKILL_PATHS[version5Path] || version5Path) : version5Path;
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
      bonus: Math.max(
        classBonuses[name] || 0,
        clamp(
          Math.round(numberOr(saved.bonus, classBonuses[name] || 0)),
          0,
          20,
        ),
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

function assertPlayerCanAccess(record, user) {
  if (record?.hidden && !user.isAdmin) {
    throw new Error("Персонаж скрыт администратором.");
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

export function normalizeCharacterFolderName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Укажите название папки.");
  if (name.length > 80) {
    throw new Error("Название папки не должно превышать 80 символов.");
  }
  return name;
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
    assertPlayerCanAccess(existing, user);
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
    ? `SELECT c.id, c.created_at, c.updated_at, c.name, c.player,
              c.class_name, c.level, c.owner_email, c.data_json,
              fa.folder_id, f.name AS folder_name,
              CASE WHEN p.character_id IS NULL THEN 0 ELSE 1 END AS personally_hidden
       FROM characters c
       LEFT JOIN character_list_preferences p
         ON p.character_id = c.id AND p.user_email = ?1
       LEFT JOIN character_folder_assignments fa ON fa.character_id = c.id
       LEFT JOIN character_folders f ON f.id = fa.folder_id
       ORDER BY c.updated_at DESC`
    : `SELECT c.id, c.created_at, c.updated_at, c.name, c.player,
              c.class_name, c.level, c.owner_email, c.data_json,
              '' AS folder_id, '' AS folder_name,
              CASE WHEN p.character_id IS NULL THEN 0 ELSE 1 END AS personally_hidden
       FROM characters c
       LEFT JOIN character_list_preferences p
         ON p.character_id = c.id AND p.user_email = ?1
       WHERE c.hidden = 0 AND c.owner_email = ?1
       ORDER BY c.updated_at DESC`;

  const { results = [] } = await db.prepare(query).bind(user.email).all();

  const summaries = results.map((row) => {
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
      folderId: row.folder_id || "",
      folderName: row.folder_name || "",
      isComplete: data.isComplete !== false,
      personallyHidden: Boolean(row.personally_hidden),
    };
  });
  const visibleCharacters = summaries.filter((item) => !item.personallyHidden);
  const hiddenCharacters = summaries.filter((item) => item.personallyHidden);
  let folders = [];
  if (user.isAdmin) {
    const { results: folderRows = [] } = await db
      .prepare(
        `SELECT id, name
         FROM character_folders
         ORDER BY name COLLATE NOCASE ASC`,
      )
      .all();
    folders = folderRows.map((row) => ({ id: row.id, name: row.name }));
  }

  return {
    characters: visibleCharacters,
    hiddenCharacters,
    folders,
    isAdmin: user.isAdmin,
    deletionPolicy,
    hiddenCount: hiddenCharacters.length,
  };
}

export async function deleteOwnCharacter(db, user, id) {
  const record = await getRecord(db, id);
  assertOwner(record, user, "Нельзя удалить чужого персонажа.");
  assertPlayerCanAccess(record, user);
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
  assertPlayerCanAccess(record, user);

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
  assertPlayerCanAccess(record, user);

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
  const record = await getRecord(db, id);
  assertOwner(record, user, "Нельзя скрыть чужого персонажа.");
  assertPlayerCanAccess(record, user);

  await db
    .prepare(
      `INSERT INTO character_list_preferences (user_email, character_id, hidden_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(user_email, character_id) DO UPDATE SET
         hidden_at = excluded.hidden_at`,
    )
    .bind(user.email, String(id), now())
    .run();

  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM character_list_preferences p
       JOIN characters c ON c.id = p.character_id
       WHERE p.user_email = ?1
         AND (?2 = 1 OR (c.owner_email = ?1 AND c.hidden = 0))`,
    )
    .bind(user.email, user.isAdmin ? 1 : 0)
    .first();
  return { success: true, hiddenCount: Number(row?.count || 0) };
}

export async function restoreHiddenCharacters(db, user) {
  await db
    .prepare("DELETE FROM character_list_preferences WHERE user_email = ?1")
    .bind(user.email)
    .run();
  return { success: true, hiddenCount: 0 };
}

export async function restoreHiddenCharacter(db, user, id) {
  const record = await getRecord(db, id);
  assertOwner(record, user, "Нельзя вернуть чужого персонажа.");
  assertPlayerCanAccess(record, user);
  await db
    .prepare(
      `DELETE FROM character_list_preferences
       WHERE user_email = ?1 AND character_id = ?2`,
    )
    .bind(user.email, String(id))
    .run();
  return { success: true, id: String(id) };
}

export async function adminListCharacters(db, user) {
  assertAdmin(user);
  const { results = [] } = await db
    .prepare(
      `SELECT c.id, c.created_at, c.updated_at, c.name, c.player,
              c.class_name, c.level, c.owner_email, c.hidden, c.data_json,
              fa.folder_id, f.name AS folder_name,
              s.data_json AS state_json
       FROM characters c
       LEFT JOIN character_states s ON s.character_id = c.id
       LEFT JOIN character_folder_assignments fa ON fa.character_id = c.id
       LEFT JOIN character_folders f ON f.id = fa.folder_id
       ORDER BY c.updated_at DESC`,
    )
    .all();
  const { results: folderRows = [] } = await db
    .prepare(
      `SELECT f.id, f.name, f.created_at, f.updated_at, f.created_by,
              COUNT(a.character_id) AS character_count
       FROM character_folders f
       LEFT JOIN character_folder_assignments a ON a.folder_id = f.id
       GROUP BY f.id, f.name, f.created_at, f.updated_at, f.created_by
       ORDER BY f.name COLLATE NOCASE ASC`,
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
        folderId: row.folder_id || "",
        folderName: row.folder_name || "",
        isComplete: data.isComplete,
        data,
        state: row.state_json ? JSON.parse(row.state_json) : null,
      };
    }),
    folders: folderRows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      characterCount: Number(row.character_count || 0),
    })),
  };
}

async function setCharacterFolder(db, characterId, folderId) {
  const normalizedCharacterId = String(characterId || "");
  const normalizedFolderId = String(folderId || "").trim();
  if (!normalizedCharacterId) throw new Error("Персонаж не найден.");

  if (!normalizedFolderId) {
    await db
      .prepare("DELETE FROM character_folder_assignments WHERE character_id = ?1")
      .bind(normalizedCharacterId)
      .run();
    return "";
  }

  const folder = await db
    .prepare("SELECT id FROM character_folders WHERE id = ?1")
    .bind(normalizedFolderId)
    .first();
  if (!folder) throw new Error("Папка не найдена.");

  await db
    .prepare(
      `INSERT INTO character_folder_assignments (character_id, folder_id, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(character_id) DO UPDATE SET
         folder_id = excluded.folder_id,
         updated_at = excluded.updated_at`,
    )
    .bind(normalizedCharacterId, normalizedFolderId, now())
    .run();
  return normalizedFolderId;
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

  await setCharacterFolder(db, id, input.folderId);

  return { success: true, id, ownerEmail, folderId: String(input.folderId || "") };
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

export async function adminCreateCharacterFolder(db, user, name) {
  assertAdmin(user);
  const normalizedName = normalizeCharacterFolderName(name);
  const existing = await db
    .prepare("SELECT id FROM character_folders WHERE name = ?1 COLLATE NOCASE")
    .bind(normalizedName)
    .first();
  if (existing) throw new Error("Папка с таким названием уже существует.");

  const id = crypto.randomUUID();
  const timestamp = now();
  await db
    .prepare(
      `INSERT INTO character_folders (id, name, created_at, updated_at, created_by)
       VALUES (?1, ?2, ?3, ?3, ?4)`,
    )
    .bind(id, normalizedName, timestamp, user.email)
    .run();
  return { success: true, folder: { id, name: normalizedName, characterCount: 0 } };
}

export async function adminRenameCharacterFolder(db, user, id, name) {
  assertAdmin(user);
  const normalizedName = normalizeCharacterFolderName(name);
  const duplicate = await db
    .prepare(
      "SELECT id FROM character_folders WHERE name = ?1 COLLATE NOCASE AND id <> ?2",
    )
    .bind(normalizedName, String(id))
    .first();
  if (duplicate) throw new Error("Папка с таким названием уже существует.");

  const result = await db
    .prepare(
      "UPDATE character_folders SET name = ?2, updated_at = ?3 WHERE id = ?1",
    )
    .bind(String(id), normalizedName, now())
    .run();
  if (!result.meta.changes) throw new Error("Папка не найдена.");
  return { success: true, id: String(id), name: normalizedName };
}

export async function adminDeleteCharacterFolder(db, user, id) {
  assertAdmin(user);
  const result = await db
    .prepare("DELETE FROM character_folders WHERE id = ?1")
    .bind(String(id))
    .run();
  if (!result.meta.changes) throw new Error("Папка не найдена.");
  return { success: true, id: String(id) };
}

export async function adminSetCharacterFolder(db, user, characterId, folderId) {
  assertAdmin(user);
  const character = await getRecord(db, characterId);
  if (!character) throw new Error("Персонаж не найден.");
  const savedFolderId = await setCharacterFolder(db, characterId, folderId);
  return { success: true, id: String(characterId), folderId: savedFolderId };
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
