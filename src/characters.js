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

function validateCharacter(character) {
  if (!character || typeof character !== "object") {
    throw new Error("Данные персонажа отсутствуют.");
  }

  if (!String(character.name || "").trim()) {
    throw new Error("Укажите имя персонажа.");
  }

  for (const value of Object.values(character.attributes || {})) {
    const stat = numberOr(value, NaN);
    if (!Number.isFinite(stat) || stat < 1 || stat > 3) {
      throw new Error("Значение Атрибута должно быть от 1 до 3.");
    }
  }

  for (const group of Object.values(character.skills || {})) {
    for (const value of Object.values(group || {})) {
      const stat = numberOr(value, NaN);
      if (!Number.isFinite(stat) || stat < 1 || stat > 3) {
        throw new Error("Значение Навыка должно быть от 1 до 3.");
      }
    }
  }
}

function sanitizeState(state, resources) {
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
  };
}

async function getRecord(db, id) {
  return db
    .prepare(
      `SELECT id, created_at, updated_at, owner_email, data_json, hidden
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
  validateCharacter(input);

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
    ownerEmail,
  };
  delete data.state;

  await db
    .prepare(
      `INSERT INTO characters (
         id, created_at, updated_at, name, player, class_name,
         owner_email, data_json, hidden
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0)
       ON CONFLICT(id) DO UPDATE SET
         updated_at = excluded.updated_at,
         name = excluded.name,
         player = excluded.player,
         class_name = excluded.class_name,
         data_json = excluded.data_json`,
    )
    .bind(
      id,
      existing?.created_at || timestamp,
      timestamp,
      String(input.name || ""),
      String(input.player || ""),
      String(input.className || ""),
      ownerEmail,
      JSON.stringify(data),
    )
    .run();

  return {
    success: true,
    id,
    ownerEmail,
    isAdmin: user.isAdmin,
  };
}

export async function listVisibleCharacters(db, user) {
  const query = user.isAdmin
    ? `SELECT id, created_at, updated_at, name, player, class_name, owner_email
       FROM characters WHERE hidden = 0 ORDER BY updated_at DESC`
    : `SELECT id, created_at, updated_at, name, player, class_name, owner_email
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
    characters: results.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      name: row.name,
      player: row.player,
      className: row.class_name,
      ownerEmail: row.owner_email,
    })),
    isAdmin: user.isAdmin,
    hiddenCount: Number(hiddenRow?.count || 0),
  };
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

  const stateRow = await db
    .prepare("SELECT data_json FROM character_states WHERE character_id = ?1")
    .bind(String(id))
    .first();

  let storedState = character.state || {};
  if (stateRow?.data_json) {
    try {
      storedState = JSON.parse(stateRow.data_json);
    } catch {
      storedState = {};
    }
  }

  character.state = sanitizeState(storedState, character.resources || {});
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
              c.class_name, c.owner_email, c.hidden, c.data_json,
              s.data_json AS state_json
       FROM characters c
       LEFT JOIN character_states s ON s.character_id = c.id
       ORDER BY c.updated_at DESC`,
    )
    .all();

  return {
    characters: results.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      name: row.name,
      player: row.player,
      className: row.class_name,
      ownerEmail: row.owner_email,
      hidden: Boolean(row.hidden),
      data: JSON.parse(row.data_json || "{}"),
      state: row.state_json ? JSON.parse(row.state_json) : null,
    })),
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
  const data = {
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
    ownerEmail,
  };
  delete data.state;
  validateCharacter(data);

  const timestamp = now();
  await db
    .prepare(
      `INSERT INTO characters (
         id, created_at, updated_at, name, player, class_name,
         owner_email, data_json, hidden
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT(id) DO UPDATE SET
         updated_at = excluded.updated_at,
         name = excluded.name,
         player = excluded.player,
         class_name = excluded.class_name,
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
