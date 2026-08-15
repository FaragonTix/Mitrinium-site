const DELETION_POLICIES = new Set(["forbidden", "allowed", "archive"]);

function assertAdmin(user) {
  if (!user?.isAdmin) throw new Error("Недостаточно прав администратора.");
}

export async function getCharacterDeletionPolicy(db) {
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE key = 'character_deletion_policy'")
    .first();
  return DELETION_POLICIES.has(row?.value) ? row.value : "forbidden";
}

export async function adminGetCharacterDeletionPolicy(db, user) {
  assertAdmin(user);
  return { policy: await getCharacterDeletionPolicy(db) };
}

export async function adminSetCharacterDeletionPolicy(db, user, policy) {
  assertAdmin(user);
  const normalized = String(policy || "");
  if (!DELETION_POLICIES.has(normalized)) throw new Error("Неизвестная политика удаления.");
  await db.prepare(
    `INSERT INTO app_settings (key, value, updated_at, updated_by)
     VALUES ('character_deletion_policy', ?1, ?2, ?3)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  ).bind(normalized, new Date().toISOString(), user.email).run();
  return { success: true, policy: normalized };
}
