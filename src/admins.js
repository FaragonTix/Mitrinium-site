function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Укажите корректный Google email.");
  }
  return email;
}

function configuredAdmins(env) {
  return new Set(
    String(env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function assertAdmin(user) {
  if (!user.isAdmin) throw new Error("Действие доступно только администратору.");
}

export async function listAdmins(db, env, user) {
  assertAdmin(user);
  const baseAdmins = configuredAdmins(env);
  const { results = [] } = await db
    .prepare(
      `SELECT email, created_at, created_by
       FROM admin_roles ORDER BY created_at ASC`,
    )
    .all();

  const items = [...baseAdmins].map((email) => ({
    email,
    permanent: true,
    createdAt: null,
    createdBy: "Конфигурация владельца",
  }));
  for (const row of results) {
    if (baseAdmins.has(row.email)) continue;
    items.push({
      email: row.email,
      permanent: false,
      createdAt: row.created_at,
      createdBy: row.created_by,
    });
  }
  return { admins: items };
}

export async function grantAdmin(db, user, email) {
  assertAdmin(user);
  const normalized = normalizeEmail(email);
  await db
    .prepare(
      `INSERT INTO admin_roles (email, created_at, created_by)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(email) DO NOTHING`,
    )
    .bind(normalized, new Date().toISOString(), user.email)
    .run();
  return { success: true, email: normalized };
}

export async function revokeAdmin(db, env, user, email) {
  assertAdmin(user);
  const normalized = normalizeEmail(email);
  if (configuredAdmins(env).has(normalized)) {
    throw new Error("Основного владельца нельзя лишить прав администратора.");
  }
  if (normalized === user.email) {
    throw new Error("Нельзя снять права администратора с текущего аккаунта.");
  }
  await db
    .prepare("DELETE FROM admin_roles WHERE email = ?1")
    .bind(normalized)
    .run();
  return { success: true, email: normalized };
}
