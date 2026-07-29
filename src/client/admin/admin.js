const elements = Object.fromEntries(
  [
    "identity", "summary", "notice", "characterList", "searchInput",
    "visibilityFilter", "refreshButton", "createButton", "characterDialog",
    "characterForm", "cancelButton", "dialogEyebrow", "dialogTitle",
    "characterId", "characterName", "playerName", "className", "ownerEmail",
    "currentBody", "currentMainNerve", "currentBonusNerve", "currentArmor",
    "maxArmor", "gold", "farthings", "pekkels", "notes", "hidden",
    "characterJson",
  ].map((id) => [id, document.getElementById(id)]),
);

let characters = [];

async function rpc(method, ...args) {
  const response = await fetch("/api/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method, args }),
  });
  const payload = await response.json();
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
  return characters.filter((item) => {
    if (visibility === "visible" && item.hidden) return false;
    if (visibility === "hidden" && !item.hidden) return false;
    return !query || [item.name, item.player, item.ownerEmail, item.className]
      .some((value) => String(value || "").toLowerCase().includes(query));
  });
}

function render() {
  const items = filteredCharacters();
  const hiddenCount = characters.filter((item) => item.hidden).length;
  elements.summary.textContent =
    `${characters.length} всего · ${hiddenCount} скрыто`;

  if (!items.length) {
    elements.characterList.innerHTML =
      '<div class="empty">Персонажи по выбранному фильтру не найдены.</div>';
    return;
  }

  elements.characterList.innerHTML = items.map((item) => `
    <article class="character-card ${item.hidden ? "hidden-card" : ""}">
      <div>
        <h3 class="character-name">${escapeHtml(item.name)}
          ${item.hidden ? '<span class="badge">скрыт</span>' : ""}
        </h3>
        <div class="meta">${escapeHtml(item.className || "Без класса")}
          · игрок: ${escapeHtml(item.player || "не указан")}</div>
      </div>
      <div class="owner">
        <div>${escapeHtml(item.ownerEmail)}</div>
        <div class="meta">Изменён ${new Date(item.updatedAt).toLocaleString("ru-RU")}</div>
      </div>
      <div class="card-actions">
        <button class="button ghost" data-action="edit" data-id="${item.id}">Изменить</button>
        <button class="button ghost" data-action="visibility" data-id="${item.id}">
          ${item.hidden ? "Вернуть" : "Скрыть"}
        </button>
        <button class="button danger" data-action="delete" data-id="${item.id}">Удалить</button>
      </div>
    </article>`).join("");
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
  elements.ownerEmail.value = character?.ownerEmail || "";
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
  const [user, result] = await Promise.all([
    rpc("getCurrentUserInfo"),
    rpc("adminListCharacters"),
  ]);
  if (!user.isAdmin) throw new Error("У аккаунта нет прав администратора.");
  elements.identity.textContent = `Администратор: ${user.email}`;
  characters = result.characters;
  render();
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
      ownerEmail: elements.ownerEmail.value,
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
      showNotice(character.hidden ? "Персонаж возвращён." : "Персонаж скрыт.");
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

elements.searchInput.addEventListener("input", render);
elements.visibilityFilter.addEventListener("change", render);
elements.createButton.addEventListener("click", () => openDialog());
elements.refreshButton.addEventListener("click", () =>
  loadCharacters().catch((error) => showNotice(error.message, true)));
elements.cancelButton.addEventListener("click", () => elements.characterDialog.close());

loadCharacters().catch((error) => {
  elements.identity.textContent = "Доступ не подтверждён";
  showNotice(error.message, true);
});
