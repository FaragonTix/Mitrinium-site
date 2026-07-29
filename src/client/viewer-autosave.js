(() => {
  const STORAGE_PREFIX = "mitrinium_viewer_state_v1:";
  const CLOUD_SAVE_INTERVAL_MS = 5 * 60 * 1000;
  let cloudSaveInFlight = false;

  const originalMarkViewerStateUnsaved =
    window.markViewerStateUnsaved;
  const originalSetViewerStateFromCharacter =
    window.setViewerStateFromCharacter;
  const originalEnsureViewerState =
    window.ensureViewerState;

  function storageKey(characterId) {
    return `${STORAGE_PREFIX}${characterId}`;
  }

  function stateSnapshot() {
    return JSON.parse(JSON.stringify(viewerState));
  }

  function persistViewerStateLocally() {
    if (!viewerState || !viewerStateCharacterId) return false;

    try {
      localStorage.setItem(
        storageKey(viewerStateCharacterId),
        JSON.stringify({
          version: 1,
          characterId: viewerStateCharacterId,
          savedAt: new Date().toISOString(),
          state: stateSnapshot(),
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  function readLocalViewerState(characterId) {
    if (!characterId) return null;

    try {
      const stored = JSON.parse(
        localStorage.getItem(storageKey(characterId)) || "null",
      );
      if (
        stored?.version !== 1 ||
        stored?.characterId !== characterId ||
        !stored?.state ||
        typeof stored.state !== "object"
      ) {
        return null;
      }
      return stored;
    } catch {
      return null;
    }
  }

  function clearLocalViewerState(characterId) {
    if (!characterId) return;
    try {
      localStorage.removeItem(storageKey(characterId));
    } catch {
      // Облачное сохранение уже выполнено; ошибка очистки не критична.
    }
  }

  function characterWithLocalState(character) {
    const characterId =
      character?.id || currentCharacterId || null;
    const local = readLocalViewerState(characterId);
    if (!local) return { character, restored: false };

    return {
      character: {
        ...(character || {}),
        id: characterId,
        state: local.state,
      },
      restored: true,
    };
  }

  window.setViewerStateFromCharacter = function (character) {
    const prepared = characterWithLocalState(character);
    originalSetViewerStateFromCharacter(prepared.character);

    if (prepared.restored) {
      viewerStateDirty = true;
      updateViewerSaveStatus(
        "Восстановлена локальная копия. В облако — автоматически в течение 5 минут.",
      );
    }
  };

  window.ensureViewerState = function (character) {
    const characterId =
      character?.id || currentCharacterId || null;
    const needsInitialization =
      !viewerState || viewerStateCharacterId !== characterId;
    const prepared = needsInitialization
      ? characterWithLocalState(character)
      : { character, restored: false };
    const result = originalEnsureViewerState(prepared.character);

    if (prepared.restored) {
      viewerStateDirty = true;
    }
    return result;
  };

  window.markViewerStateUnsaved = function () {
    originalMarkViewerStateUnsaved();
    const savedLocally = persistViewerStateLocally();
    updateViewerSaveStatus(
      savedLocally
        ? "Сохранено локально. В облако — автоматически в течение 5 минут."
        : "Не удалось сохранить локально. Используйте кнопку сохранения.",
      !savedLocally,
    );
  };

  window.saveViewerState = function (options = {}) {
    const automatic = Boolean(options.automatic);

    if (cloudSaveInFlight || (automatic && !viewerStateDirty)) {
      return;
    }

    if (!currentCharacterId || !viewerState) {
      if (!automatic) {
        updateViewerSaveStatus(
          !currentCharacterId
            ? "Сначала сохраните персонажа в редакторе."
            : "Нет состояния для сохранения.",
          true,
        );
      }
      return;
    }

    const characterId = currentCharacterId;
    const snapshot = stateSnapshot();
    const snapshotJson = JSON.stringify(snapshot);
    cloudSaveInFlight = true;

    updateViewerSaveStatus(
      automatic
        ? "Автосохранение в облако..."
        : "Сохраняю в облако...",
    );

    google.script.run
      .withSuccessHandler(function (result) {
        cloudSaveInFlight = false;

        const stateUnchanged =
          currentCharacterId === characterId &&
          viewerState &&
          JSON.stringify(viewerState) === snapshotJson;

        if (stateUnchanged) {
          viewerState = result?.state || snapshot;
          viewerStateDirty = false;
          clearLocalViewerState(characterId);
          updateViewerArmorInputs();
          updateViewerSaveStatus(
            `Сохранено в облаке в ${new Date().toLocaleTimeString(
              "ru-RU",
              { hour: "2-digit", minute: "2-digit" },
            )}.`,
          );
          return;
        }

        viewerStateDirty = true;
        persistViewerStateLocally();
        updateViewerSaveStatus(
          "Новые изменения сохранены локально. Следующая синхронизация — в течение 5 минут.",
        );
      })
      .withFailureHandler(function (error) {
        cloudSaveInFlight = false;
        viewerStateDirty = true;
        persistViewerStateLocally();
        updateViewerSaveStatus(
          `${
            error?.message || "Ошибка облачного сохранения."
          } Локальная копия сохранена.`,
          true,
        );
      })
      .saveCharacterState(characterId, snapshot);
  };

  window.setInterval(function () {
    window.saveViewerState({ automatic: true });
  }, CLOUD_SAVE_INTERVAL_MS);

  window.addEventListener("pagehide", persistViewerStateLocally);
})();

