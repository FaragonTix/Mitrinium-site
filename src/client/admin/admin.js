const elements = Object.fromEntries(
  [
    "identity", "summary", "notice", "characterList", "searchInput",
    "visibilityFilter", "refreshButton", "createButton", "characterDialog",
    "characterForm", "cancelButton", "dialogEyebrow", "dialogTitle",
    "characterId", "characterName", "playerName", "className",
    "characterLevel", "ownerEmail",
    "characterFolder",
    "currentBody", "currentMainNerve", "currentBonusNerve", "currentArmor",
    "maxArmor", "gold", "farthings", "pekkels", "notes", "hidden",
    "characterJson",
    "adminForm", "adminEmail", "adminList",
    "selectVisibleButton", "exportSelectedButton", "deletionPolicy",
    "folderForm", "folderName", "folderList", "folderFilter",
  ].map((id) => [id, document.getElementById(id)]),
);

let characters = [];
let admins = [];
let folders = [];
const selectedCharacterIds = new Set();

async function rpc(method, ...args) {
  const response = await fetch("/api/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method, args }),
  });
  const payload = await response.json();
  if (response.status === 401) {
    const returnTo = `${location.pathname}${location.search}`;
    location.assign(`/login/?return=${encodeURIComponent(returnTo)}`);
    throw new Error("Переход на страницу входа…");
  }
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Ошибка запроса.");
  }
  return payload.result;
}

function showNotice(message, error = false) {
  elements.notice.textContent = message;
  elements.notice.classList.toggle("error", error);
  elements.notice.hidden = !message;
}

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = String(value ?? "");
  return node.innerHTML;
}

function filteredCharacters() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const visibility = elements.visibilityFilter.value;
  const folderId = elements.folderFilter.value;
  return characters.filter((item) => {
    if (visibility === "visible" && item.hidden) return false;
    if (visibility === "hidden" && !item.hidden) return false;
    if (folderId === "none" && item.folderId) return false;
    if (folderId !== "all" && folderId !== "none" && item.folderId !== folderId) return false;
    return !query || [
      item.name,
      item.player,
      item.ownerEmail,
      item.className,
      item.level,
    ]
      .some((value) => String(value || "").toLowerCase().includes(query));
  });
}

function folderOptions(selectedId = "", includeAll = false) {
  const base = includeAll
    ? '<option value="all">Все папки</option><option value="none">Без папки</option>'
    : '<option value="">Без папки</option>';
  return base + folders.map((folder) => `
    <option value="${escapeHtml(folder.id)}" ${folder.id === selectedId ? "selected" : ""}>
      ${escapeHtml(folder.name)}
    </option>`).join("");
}

function syncFolderSelects() {
  const currentFilter = elements.folderFilter.value || "all";
  elements.folderFilter.innerHTML = folderOptions(currentFilter, true);
  elements.folderFilter.value = ["all", "none", ...folders.map((folder) => folder.id)]
    .includes(currentFilter) ? currentFilter : "all";
  elements.characterFolder.innerHTML = folderOptions(elements.characterFolder.value || "");
}

function render() {
  const items = filteredCharacters();
  const hiddenCount = characters.filter((item) => item.hidden).length;
  elements.summary.textContent =
    `${characters.length} всего · ${hiddenCount} скрыто от игроков · ${selectedCharacterIds.size} выбрано`;
  elements.exportSelectedButton.disabled = selectedCharacterIds.size === 0;

  if (!items.length) {
    elements.characterList.innerHTML =
      '<div class="empty">Персонажи по выбранному фильтру не найдены.</div>';
    return;
  }

  elements.characterList.innerHTML = items.map((item) => `
    <article class="character-card ${item.hidden ? "hidden-card" : ""}">
      <label class="character-select" title="Выбрать для экспорта">
        <input type="checkbox" data-select-id="${item.id}" ${selectedCharacterIds.has(item.id) ? "checked" : ""}>
      </label>
      <div>
        <h3 class="character-name">${escapeHtml(item.name || "Без имени")}
          ${item.hidden ? '<span class="badge">скрыт от игрока</span>' : ""}
          ${item.isComplete === false ? '<span class="badge draft">черновик</span>' : ""}
          ${item.folderName ? `<span class="badge folder-badge">${escapeHtml(item.folderName)}</span>` : ""}
        </h3>
        <div class="meta">${escapeHtml(item.className || "Без класса")}
          · уровень ${escapeHtml(item.level || 1)}
          · игрок: ${escapeHtml(item.player || "не указан")}</div>
      </div>
      <div class="owner">
        <div>${escapeHtml(item.ownerEmail)}</div>
        <div class="meta">Изменён ${new Date(item.updatedAt).toLocaleString("ru-RU")}</div>
        <label class="card-folder-select">
          <span>Папка</span>
          <select data-character-folder="${item.id}">
            ${folderOptions(item.folderId || "")}
          </select>
        </label>
      </div>
      <div class="card-actions">
        <button class="button ghost" data-action="edit" data-id="${item.id}">Изменить</button>
        <button class="button ghost" data-action="visibility" data-id="${item.id}">
          ${item.hidden ? "Показывать игроку" : "Скрыть от игрока"}
        </button>
        <button class="button danger" data-action="delete" data-id="${item.id}">Удалить</button>
      </div>
    </article>`).join("");
}

function renderFolders() {
  if (!folders.length) {
    elements.folderList.innerHTML = '<div class="empty compact">Папок пока нет.</div>';
    return;
  }
  elements.folderList.innerHTML = folders.map((folder) => `
    <div class="admin-item folder-item">
      <div>
        <strong>${escapeHtml(folder.name)}</strong>
        <div class="meta">Персонажей: ${folder.characterCount}</div>
      </div>
      <div class="folder-actions">
        <button class="button ghost" type="button" data-folder-action="rename" data-folder-id="${folder.id}">Переименовать</button>
        <button class="button danger" type="button" data-folder-action="delete" data-folder-id="${folder.id}">Удалить папку</button>
      </div>
    </div>`).join("");
}

function renderAdmins() {
  elements.adminList.innerHTML = admins.map((item) => `
    <div class="admin-item">
      <div>
        <strong>${escapeHtml(item.email)}</strong>
        <div class="meta">
          ${item.permanent
            ? "Основной владелец"
            : `Назначил: ${escapeHtml(item.createdBy)}`}
        </div>
      </div>
      ${item.permanent
        ? '<span class="badge">постоянный</span>'
        : `<button class="button danger" type="button"
             data-remove-admin="${escapeHtml(item.email)}">Снять права</button>`}
    </div>`).join("");
}

function numberValue(element) {
  return element.value === "" ? 0 : Number(element.value);
}

function openDialog(character = null) {
  elements.characterForm.reset();
  const isNew = !character;
  const data = structuredClone(character?.data || {});
  const state = character?.state || data.state || {};
  const money = state.money || {};

  elements.dialogEyebrow.textContent = isNew ? "Новый лист" : "Редактирование";
  elements.dialogTitle.textContent = isNew ? "Добавить персонажа" : character.name;
  elements.characterId.value = character?.id || "";
  elements.characterName.value = character?.name || "";
  elements.playerName.value = character?.player || "";
  elements.className.value = character?.className || "Рекрут";
  elements.characterLevel.value = character?.level || data.level || 1;
  elements.ownerEmail.value = character?.ownerEmail || "";
  elements.characterFolder.innerHTML = folderOptions(character?.folderId || "");
  elements.characterFolder.value = character?.folderId || "";
  elements.hidden.checked = Boolean(character?.hidden);
  elements.currentBody.value = state.currentBody ?? "";
  elements.currentMainNerve.value = state.currentMainNerve ?? "";
  elements.currentBonusNerve.value = state.currentBonusNerve ?? "";
  elements.currentArmor.value = state.currentArmor ?? "";
  elements.maxArmor.value = state.maxArmor ?? "";
  elements.gold.value = money.gold ?? "";
  elements.farthings.value = money.farthings ?? "";
  elements.pekkels.value = money.pekkels ?? "";
  elements.notes.value = state.notes || "";
  delete data.state;
  elements.characterJson.value = JSON.stringify(data, null, 2);
  elements.characterDialog.showModal();
}

async function loadCharacters() {
  showNotice("");
  const [user, result, adminResult, policyResult] = await Promise.all([
    rpc("getCurrentUserInfo"),
    rpc("adminListCharacters"),
    rpc("adminListAdmins"),
    rpc("adminGetCharacterDeletionPolicy"),
  ]);
  if (!user.isAdmin) throw new Error("У аккаунта нет прав администратора.");
  elements.identity.textContent = `Администратор: ${user.email}`;
  characters = result.characters;
  folders = result.folders || [];
  for (const id of [...selectedCharacterIds]) {
    if (!characters.some((item) => item.id === id)) selectedCharacterIds.delete(id);
  }
  admins = adminResult.admins;
  elements.deletionPolicy.value = policyResult.policy;
  syncFolderSelects();
  render();
  renderAdmins();
  renderFolders();
}

elements.characterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    let data = {};
    if (elements.characterJson.value.trim()) {
      data = JSON.parse(elements.characterJson.value);
    }
    const payload = {
      id: elements.characterId.value || undefined,
      name: elements.characterName.value,
      player: elements.playerName.value,
      className: elements.className.value,
      level: numberValue(elements.characterLevel),
      ownerEmail: elements.ownerEmail.value,
      folderId: elements.characterFolder.value,
      hidden: elements.hidden.checked,
      data,
      state: {
        currentBody: numberValue(elements.currentBody),
        currentMainNerve: numberValue(elements.currentMainNerve),
        currentBonusNerve: numberValue(elements.currentBonusNerve),
        currentArmor: numberValue(elements.currentArmor),
        maxArmor: numberValue(elements.maxArmor),
        money: {
          gold: numberValue(elements.gold),
          farthings: numberValue(elements.farthings),
          pekkels: numberValue(elements.pekkels),
        },
        notes: elements.notes.value,
      },
    };
    await rpc("adminSaveCharacter", payload);
    elements.characterDialog.close();
    await loadCharacters();
    showNotice("Изменения сохранены.");
  } catch (error) {
    showNotice(error.message, true);
  }
});

elements.characterList.addEventListener("click", async (event) => {
  const selection = event.target.closest("input[data-select-id]");
  if (selection) {
    selection.checked
      ? selectedCharacterIds.add(selection.dataset.selectId)
      : selectedCharacterIds.delete(selection.dataset.selectId);
    render();
    return;
  }
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const character = characters.find((item) => item.id === button.dataset.id);
  if (!character) return;

  if (button.dataset.action === "edit") {
    openDialog(character);
    return;
  }

  try {
    if (button.dataset.action === "visibility") {
      await rpc("adminSetCharacterVisibility", character.id, !character.hidden);
      await loadCharacters();
      showNotice(character.hidden
        ? "Персонаж снова виден игроку."
        : "Персонаж скрыт от игрока, но остаётся доступен в dashboard.");
    }
    if (button.dataset.action === "delete") {
      const confirmed = window.confirm(
        `Окончательно удалить персонажа «${character.name}»?\n` +
        "Будут также удалены его сохранённое состояние и связанные данные.",
      );
      if (!confirmed) return;
      await rpc("adminDeleteCharacter", character.id);
      await loadCharacters();
      showNotice("Персонаж удалён.");
    }
  } catch (error) {
    showNotice(error.message, true);
  }
});

elements.characterList.addEventListener("change", async (event) => {
  const select = event.target.closest("select[data-character-folder]");
  if (!select) return;
  try {
    await rpc("adminSetCharacterFolder", select.dataset.characterFolder, select.value);
    await loadCharacters();
    showNotice(select.value ? "Персонаж перемещён в папку." : "Персонаж убран из папки.");
  } catch (error) {
    showNotice(error.message, true);
    await loadCharacters();
  }
});

elements.folderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await rpc("adminCreateCharacterFolder", elements.folderName.value);
    elements.folderForm.reset();
    await loadCharacters();
    showNotice("Папка создана.");
  } catch (error) {
    showNotice(error.message, true);
  }
});

elements.folderList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-folder-action]");
  if (!button) return;
  const folder = folders.find((item) => item.id === button.dataset.folderId);
  if (!folder) return;

  try {
    if (button.dataset.folderAction === "rename") {
      const name = window.prompt("Новое название папки", folder.name);
      if (name === null || name.trim() === folder.name) return;
      await rpc("adminRenameCharacterFolder", folder.id, name);
      await loadCharacters();
      showNotice("Папка переименована.");
    }
    if (button.dataset.folderAction === "delete") {
      const confirmed = window.confirm(
        `Удалить папку «${folder.name}»? Персонажи останутся в dashboard без папки.`,
      );
      if (!confirmed) return;
      await rpc("adminDeleteCharacterFolder", folder.id);
      await loadCharacters();
      showNotice("Папка удалена; персонажи сохранены.");
    }
  } catch (error) {
    showNotice(error.message, true);
  }
});

elements.adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await rpc("adminGrantAdmin", elements.adminEmail.value);
    elements.adminForm.reset();
    await loadCharacters();
    showNotice("Пользователь назначен администратором.");
  } catch (error) {
    showNotice(error.message, true);
  }
});

elements.adminList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-admin]");
  if (!button) return;
  const email = button.dataset.removeAdmin;
  if (!window.confirm(`Снять права администратора с ${email}?`)) return;
  try {
    await rpc("adminRevokeAdmin", email);
    await loadCharacters();
    showNotice("Права администратора сняты.");
  } catch (error) {
    showNotice(error.message, true);
  }
});

elements.searchInput.addEventListener("input", render);
elements.visibilityFilter.addEventListener("change", render);
elements.folderFilter.addEventListener("change", render);
elements.deletionPolicy.addEventListener("change", async () => {
  try {
    const result = await rpc("adminSetCharacterDeletionPolicy", elements.deletionPolicy.value);
    elements.deletionPolicy.value = result.policy;
    showNotice("Политика удаления обновлена.");
  } catch (error) {
    showNotice(error.message, true);
    await loadCharacters();
  }
});
elements.selectVisibleButton.addEventListener("click", () => {
  const visible = filteredCharacters();
  const allSelected = visible.length > 0 && visible.every((item) => selectedCharacterIds.has(item.id));
  visible.forEach((item) => allSelected
    ? selectedCharacterIds.delete(item.id)
    : selectedCharacterIds.add(item.id));
  render();
});
elements.exportSelectedButton.addEventListener("click", () => {
  const selected = characters.filter((item) => selectedCharacterIds.has(item.id));
  if (!selected.length) return;
  const payload = {
    format: "mitrinium-characters-v1",
    exportedAt: new Date().toISOString(),
    characters: selected,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `mitrinium-characters-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  showNotice(`Экспортировано персонажей: ${selected.length}.`);
});
elements.createButton.addEventListener("click", () => openDialog());
elements.refreshButton.addEventListener("click", () =>
  loadCharacters().catch((error) => showNotice(error.message, true)));
elements.cancelButton.addEventListener("click", () => elements.characterDialog.close());

loadCharacters().catch((error) => {
  elements.identity.textContent = "Доступ не подтверждён";
  showNotice(error.message, true);
});
