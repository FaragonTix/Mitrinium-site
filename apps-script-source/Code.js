const SPREADSHEET_ID = '1WYc2mQNBDIfphimoJCZrOpv8IfVTgnXu1jZdpH17PBA';

const CHARACTERS_SHEET_NAME = 'Characters';
const CHARACTER_STATES_SHEET_NAME = 'CharacterStates';

const ADMIN_EMAILS = [
  'daniil.a.kabanov@gmail.com'
];

/* =========================
   Веб-приложение
========================= */

function doGet() {
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Митриниум — создание персонажа');
}

function include(filename) {
  return HtmlService
    .createHtmlOutputFromFile(filename)
    .getContent();
}

/* =========================
   Пользователь и доступ
========================= */

function getCurrentUserEmail() {
  const email = Session.getActiveUser().getEmail();

  if (!email) {
    throw new Error(
      'Не удалось определить email пользователя. Проверь настройки развертывания веб-приложения.'
    );
  }

  return String(email).trim().toLowerCase();
}

function isAdminEmail(email) {
  const normalizedEmail = String(email || '')
    .trim()
    .toLowerCase();

  return ADMIN_EMAILS.some(adminEmail =>
    String(adminEmail || '').trim().toLowerCase() === normalizedEmail
  );
}

function getCurrentUserInfo() {
  const email = getCurrentUserEmail();

  return {
    email,
    isAdmin: isAdminEmail(email)
  };
}

/* =========================
   Таблица персонажей
========================= */

function getCharactersSheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(CHARACTERS_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CHARACTERS_SHEET_NAME);
  }

  ensureCharactersHeader(sheet);

  return sheet;
}

function ensureCharactersHeader(sheet) {
  const headers = [
    'ID',
    'Дата создания',
    'Дата изменения',
    'Имя персонажа',
    'Игрок',
    'Класс',
    'OwnerEmail',
    'JSON'
  ];

  const lastColumn = Math.max(
    sheet.getLastColumn(),
    headers.length
  );

  const currentHeaders = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0];

  const firstHeader = String(
    currentHeaders[0] || ''
  ).trim();

  if (!firstHeader) {
    sheet
      .getRange(1, 1, 1, headers.length)
      .setValues([headers]);

    return;
  }

  if (firstHeader !== 'ID') {
    sheet.insertRowBefore(1);

    sheet
      .getRange(1, 1, 1, headers.length)
      .setValues([headers]);

    return;
  }

  const ownerEmailColumn = currentHeaders.findIndex(
    header => String(header || '').trim() === 'OwnerEmail'
  );

  if (ownerEmailColumn === -1) {
    sheet.insertColumnBefore(7);
    sheet.getRange(1, 7).setValue('OwnerEmail');

    const lastRow = sheet.getLastRow();

    const fallbackOwner = String(
      ADMIN_EMAILS[0] || ''
    )
      .trim()
      .toLowerCase();

    if (lastRow >= 2 && fallbackOwner) {
      sheet
        .getRange(2, 7, lastRow - 1, 1)
        .setValue(fallbackOwner);
    }
  }

  sheet
    .getRange(1, 1, 1, headers.length)
    .setValues([headers]);
}

/* =========================
   Сохранение персонажа
========================= */

function saveCharacter(character) {
  validateCharacterForSave(character);

  const userInfo = getCurrentUserInfo();
  const sheet = getCharactersSheet();
  const now = new Date();

  const id = character.id
    ? String(character.id)
    : Utilities.getUuid();

  const lastRow = sheet.getLastRow();

  let rowToUpdate = -1;
  let existingOwnerEmail = '';
  let createdAt = now;

  if (lastRow >= 2) {
    const values = sheet
      .getRange(2, 1, lastRow - 1, 8)
      .getValues();

    for (let index = 0; index < values.length; index++) {
      const row = values[index];

      if (String(row[0]) !== id) {
        continue;
      }

      rowToUpdate = index + 2;
      createdAt = row[1] || now;

      existingOwnerEmail = String(row[6] || '')
        .trim()
        .toLowerCase();

      break;
    }
  }

  if (
    rowToUpdate !== -1 &&
    existingOwnerEmail &&
    existingOwnerEmail !== userInfo.email &&
    !userInfo.isAdmin
  ) {
    throw new Error('Нельзя редактировать чужого персонажа.');
  }

  const ownerEmail = rowToUpdate === -1
    ? userInfo.email
    : existingOwnerEmail || userInfo.email;

  const characterToSave = Object.assign({}, character, {
    id,
    ownerEmail
  });

  // Игровое состояние хранится отдельно.
  delete characterToSave.state;

  const rowValues = [
    id,
    createdAt,
    now,
    String(character.name || ''),
    String(character.player || ''),
    String(character.className || ''),
    ownerEmail,
    JSON.stringify(characterToSave)
  ];

  if (rowToUpdate === -1) {
    sheet.appendRow(rowValues);
  } else {
    sheet
      .getRange(rowToUpdate, 1, 1, rowValues.length)
      .setValues([rowValues]);
  }

  return {
    success: true,
    id,
    ownerEmail,
    isAdmin: userInfo.isAdmin
  };
}

/* =========================
   Список персонажей
========================= */

function listSavedCharacters() {
  const userInfo = getCurrentUserInfo();
  const sheet = getCharactersSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const values = sheet
    .getRange(2, 1, lastRow - 1, 8)
    .getValues();

  return values
    .filter(row => row[0])
    .filter(row => {
      const ownerEmail = String(row[6] || '')
        .trim()
        .toLowerCase();

      return (
        userInfo.isAdmin ||
        ownerEmail === userInfo.email
      );
    })
    .map(row => ({
      id: String(row[0]),
      createdAt: serializeDate_(row[1]),
      updatedAt: serializeDate_(row[2]),
      name: String(row[3] || ''),
      player: String(row[4] || ''),
      className: String(row[5] || ''),
      ownerEmail: String(row[6] || '')
    }))
    .sort((first, second) =>
      String(second.updatedAt).localeCompare(
        String(first.updatedAt)
      )
    );
}

/* =========================
   Загрузка персонажа
========================= */

function loadCharacter(characterId) {
  const userInfo = getCurrentUserInfo();

  const record = getCharacterRecordById_(
    characterId,
    userInfo,
    'Нельзя открыть чужого персонажа.'
  );

  const character = record.character;

  character.state = getCharacterStateById_(
    characterId,
    character.resources || {},
    character.state || {}
  );

  return character;
}

function getCharacterRecordById_(
  characterId,
  userInfo,
  accessErrorMessage
) {
  const sheet = getCharactersSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    throw new Error('Сохранённых персонажей нет.');
  }

  const values = sheet
    .getRange(2, 1, lastRow - 1, 8)
    .getValues();

  for (let index = 0; index < values.length; index++) {
    const row = values[index];

    const rowId = String(row[0]);

    const ownerEmail = String(row[6] || '')
      .trim()
      .toLowerCase();

    if (rowId !== String(characterId)) {
      continue;
    }

    if (
      ownerEmail !== userInfo.email &&
      !userInfo.isAdmin
    ) {
      throw new Error(accessErrorMessage);
    }

    const json = row[7];

    if (!json) {
      throw new Error(
        'У персонажа нет сохранённых данных JSON.'
      );
    }

    let character;

    try {
      character = JSON.parse(json);
    } catch (error) {
      throw new Error(
        'Не удалось прочитать JSON персонажа.'
      );
    }

    return {
      character,
      ownerEmail,
      rowNumber: index + 2
    };
  }

  throw new Error('Персонаж не найден.');
}

/* =========================
   Таблица игрового состояния
========================= */

function getCharacterStatesSheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);

  let sheet = spreadsheet.getSheetByName(
    CHARACTER_STATES_SHEET_NAME
  );

  if (!sheet) {
    sheet = spreadsheet.insertSheet(
      CHARACTER_STATES_SHEET_NAME
    );
  }

  ensureCharacterStatesHeader(sheet);

  return sheet;
}

function ensureCharacterStatesHeader(sheet) {
  const headers = [
    'CharacterID',
    'Дата изменения',
    'OwnerEmail',
    'UpdatedBy',
    'Тело',
    'Основной Нерв',
    'Бонусный Нерв',
    'Золото',
    'Фарантины',
    'Пеккели',
    'Заметки',
    'Текущая Броня',
    'Максимальная Броня'
  ];

  const currentHeaders = sheet
    .getRange(1, 1, 1, headers.length)
    .getValues()[0];

  const firstHeader = String(
    currentHeaders[0] || ''
  ).trim();

  if (!firstHeader) {
    sheet
      .getRange(1, 1, 1, headers.length)
      .setValues([headers]);

    return;
  }

  if (firstHeader !== 'CharacterID') {
    sheet.insertRowBefore(1);

    sheet
      .getRange(1, 1, 1, headers.length)
      .setValues([headers]);

    return;
  }

  headers.forEach((header, index) => {
    const currentHeader = String(
      currentHeaders[index] || ''
    ).trim();

    if (currentHeader !== header) {
      sheet
        .getRange(1, index + 1)
        .setValue(header);
    }
  });
}

/* =========================
   Сохранение состояния
========================= */

function saveCharacterState(characterId, state) {
  if (!characterId) {
    throw new Error('Не указан ID персонажа.');
  }

  const userInfo = getCurrentUserInfo();

  const characterRecord = getCharacterRecordById_(
    characterId,
    userInfo,
    'Нельзя менять состояние чужого персонажа.'
  );

  const character = characterRecord.character;
  const ownerEmail = characterRecord.ownerEmail;

  const sanitizedState = sanitizeCharacterState_(
    state || {},
    character.resources || {}
  );

  const sheet = getCharacterStatesSheet();
  const lastRow = sheet.getLastRow();

  let rowToUpdate = -1;

  if (lastRow >= 2) {
    const ids = sheet
      .getRange(2, 1, lastRow - 1, 1)
      .getValues();

    for (let index = 0; index < ids.length; index++) {
      if (
        String(ids[index][0]) === String(characterId)
      ) {
        rowToUpdate = index + 2;
        break;
      }
    }
  }

  const rowValues = [
    String(characterId),
    new Date(),
    ownerEmail,
    userInfo.email,
    sanitizedState.currentBody,
    sanitizedState.currentMainNerve,
    sanitizedState.currentBonusNerve,
    sanitizedState.money.gold,
    sanitizedState.money.farthings,
    sanitizedState.money.pekkels,
    sanitizedState.notes,
    sanitizedState.currentArmor,
    sanitizedState.maxArmor
  ];

  if (rowToUpdate === -1) {
    sheet.appendRow(rowValues);
  } else {
    sheet
      .getRange(rowToUpdate, 1, 1, rowValues.length)
      .setValues([rowValues]);
  }

  return {
    success: true,
    id: String(characterId),
    state: sanitizedState
  };
}

/* =========================
   Загрузка состояния
========================= */

function getCharacterStateById_(
  characterId,
  resources,
  fallbackState
) {
  const sheet = getCharacterStatesSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return sanitizeCharacterState_(
      fallbackState || {},
      resources || {}
    );
  }

  const values = sheet
    .getRange(2, 1, lastRow - 1, 13)
    .getValues();

  for (let index = 0; index < values.length; index++) {
    const row = values[index];

    if (String(row[0]) !== String(characterId)) {
      continue;
    }

    return sanitizeCharacterState_(
      {
        currentBody: row[4],
        currentMainNerve: row[5],
        currentBonusNerve: row[6],

        money: {
          gold: row[7],
          farthings: row[8],
          pekkels: row[9]
        },

        notes: row[10],
        currentArmor: row[11],
        maxArmor: row[12]
      },
      resources || {}
    );
  }

  return sanitizeCharacterState_(
    fallbackState || {},
    resources || {}
  );
}

/* =========================
   Нормализация состояния
========================= */

function sanitizeCharacterState_(state, resources) {
  state = state || {};
  resources = resources || {};

  const money = state.money || {};

  const maxBody = Math.max(
    0,
    numberOrDefault_(resources.body, 0)
  );

  const maxMainNerve = Math.max(
    0,
    numberOrDefault_(resources.mainNerve, 0)
  );

  const maxBonusNerve = Math.max(
    0,
    numberOrDefault_(resources.bonusNerve, 0)
  );

  // Броню полностью задаёт игрок.
  const maxArmor = Math.max(
    0,
    numberOrDefault_(state.maxArmor, 0)
  );

  const currentArmor = clampNumber_(
    numberOrDefault_(state.currentArmor, maxArmor),
    0,
    maxArmor
  );

  return {
    currentBody: clampNumber_(
      numberOrDefault_(state.currentBody, maxBody),
      0,
      maxBody
    ),

    currentArmor,
    maxArmor,

    currentMainNerve: clampNumber_(
      numberOrDefault_(
        state.currentMainNerve,
        maxMainNerve
      ),
      0,
      maxMainNerve
    ),

    currentBonusNerve: clampNumber_(
      numberOrDefault_(
        state.currentBonusNerve,
        maxBonusNerve
      ),
      0,
      maxBonusNerve
    ),

    money: {
      gold: Math.max(
        0,
        numberOrDefault_(money.gold, 0)
      ),

      farthings: Math.max(
        0,
        numberOrDefault_(money.farthings, 0)
      ),

      pekkels: Math.max(
        0,
        numberOrDefault_(money.pekkels, 0)
      )
    },

    notes: String(state.notes || '')
  };
}

/* =========================
   Валидация персонажа
========================= */

function validateCharacterForSave(character) {
  if (!character) {
    throw new Error('Нет данных персонажа.');
  }

  const isAdvancedEditMode = Boolean(
    character.advancedEditMode
  );

  if (!String(character.name || '').trim()) {
    throw new Error('Укажите имя персонажа.');
  }

  if (!String(character.className || '').trim()) {
    throw new Error('Выберите класс.');
  }

  const level = Number(character.level == null ? 1 : character.level);

  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new Error('Уровень должен быть целым числом от 1 до 20.');
  }

  validateAttributes_(
    character.attributes,
    isAdvancedEditMode
  );

  validateSkills_(
    character.skills,
    isAdvancedEditMode
  );

  validateAbilities_(
    character.abilities,
    isAdvancedEditMode
  );

  if (Number(character.equipmentSpent || 0) > 1000) {
    throw new Error(
      'Стоимость снаряжения превышает 1000 ф.'
    );
  }
}

function validateAttributes_(
  attributes,
  isAdvancedEditMode
) {
  if (!attributes || typeof attributes !== 'object') {
    throw new Error('Нет данных Атрибутов.');
  }

  const values = Object.values(attributes)
    .map(value => Number(value));

  if (
    values.length === 0 ||
    values.some(value => !isFinite(value))
  ) {
    throw new Error(
      'Некорректные значения Атрибутов.'
    );
  }

  const maximum = 3;

  if (
    values.some(value =>
      value < 1 || value > maximum
    )
  ) {
    throw new Error(
      `Значение Атрибута должно быть от 1 до ${maximum}.`
    );
  }

  const total = values.reduce(
    (sum, value) => sum + value,
    0
  );

  if (!isAdvancedEditMode && total !== 9) {
    throw new Error(
      'Сумма Атрибутов должна равняться 9.'
    );
  }
}

function validateSkills_(
  skills,
  isAdvancedEditMode
) {
  if (!skills || typeof skills !== 'object') {
    throw new Error('Нет данных Навыков.');
  }

  const maximum = isAdvancedEditMode ? 3 : 2;
  const values = [];

  Object.values(skills).forEach(group => {
    if (!group || typeof group !== 'object') {
      return;
    }

    Object.values(group).forEach(value => {
      values.push(Number(value));
    });
  });

  if (
    values.length === 0 ||
    values.some(value => !isFinite(value))
  ) {
    throw new Error(
      'Некорректные значения Навыков.'
    );
  }

  if (
    values.some(value =>
      value < 1 || value > maximum
    )
  ) {
    throw new Error(
      `Значение Навыка должно быть от 1 до ${maximum}.`
    );
  }

  if (!isAdvancedEditMode) {
    const spent = values.reduce(
      (sum, value) => sum + (value - 1),
      0
    );

    if (spent !== 6) {
      throw new Error(
        'На старте нужно распределить ровно 6 очков Навыков.'
      );
    }
  }
}

function validateAbilities_(
  abilities,
  isAdvancedEditMode
) {
  if (!Array.isArray(abilities)) {
    throw new Error('Нет данных способностей.');
  }

  if (
    !isAdvancedEditMode &&
    abilities.length !== 3
  ) {
    throw new Error(
      'На старте нужно выбрать ровно 3 способности.'
    );
  }
}

/* =========================
   Служебные функции
========================= */

function numberOrDefault_(value, fallback) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return Number(fallback || 0);
  }

  const number = Number(value);

  return isFinite(number)
    ? number
    : Number(fallback || 0);
}

function clampNumber_(value, minimum, maximum) {
  const number = numberOrDefault_(
    value,
    minimum
  );

  if (number < minimum) {
    return minimum;
  }

  if (number > maximum) {
    return maximum;
  }

  return number;
}

function serializeDate_(value) {
  if (!value) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

/* =========================
   Отладка
========================= */

function debugCharactersSheet() {
  const userInfo = getCurrentUserInfo();

  const charactersSheet = getCharactersSheet();
  const statesSheet = getCharacterStatesSheet();

  const characterValues = charactersSheet
    .getDataRange()
    .getValues();

  const stateValues = statesSheet
    .getDataRange()
    .getValues();

  return {
    spreadsheetId: SPREADSHEET_ID,
    currentUser: userInfo.email,
    isAdmin: userInfo.isAdmin,

    characters: {
      sheetName: charactersSheet.getName(),
      rows: characterValues.length,
      columns: characterValues[0]
        ? characterValues[0].length
        : 0,

      preview: characterValues
        .slice(0, 5)
        .map(row =>
          row.map(cell => String(cell))
        )
    },

    states: {
      sheetName: statesSheet.getName(),
      rows: stateValues.length,
      columns: stateValues[0]
        ? stateValues[0].length
        : 0,

      preview: stateValues
        .slice(0, 5)
        .map(row =>
          row.map(cell => String(cell))
        )
    }
  };
}

const MITRINIUM_HIDDEN_KEY = 'mitrinium.hiddenCharacters.v1';
const MITRINIUM_ROLL_LOG_SHEET = 'RollLog';
const MITRINIUM_CLASS_ICONS = {
  'Психопат': '⚗', 'Кустарь': '⚙', 'Воротила': '⚿',
  'Рекрут': '⯐', 'Менталист': 'Ψ', 'Натуралист': '◉'
};

/* =========================
   Скрытие персонажей владельцем
========================= */


function listVisibleCharacters() {
  const userInfo = getCurrentUserInfo();
  const characters = listSavedCharacters();


  if (!userInfo.isAdmin) {
    return {
      characters: characters,
      isAdmin: false,
      hiddenCount: 0
    };
  }


  const hiddenIds = getHiddenCharacterIds_();
  const hiddenLookup = {};


  hiddenIds.forEach(function (id) {
    hiddenLookup[String(id)] = true;
  });


  return {
    characters: characters.filter(function (character) {
      return !hiddenLookup[String(character.id || '')];
    }),
    isAdmin: true,
    hiddenCount: hiddenIds.length
  };
}


function hideCharacterFromList(characterId) {
  const userInfo = getCurrentUserInfo();


  if (!userInfo.isAdmin) {
    throw new Error('Скрывать персонажей может только владелец приложения.');
  }


  const id = String(characterId || '').trim();


  if (!id) {
    throw new Error('Не указан ID персонажа.');
  }


  const characterExists = listSavedCharacters().some(function (character) {
    return String(character.id || '') === id;
  });


  if (!characterExists) {
    throw new Error('Персонаж не найден.');
  }


  const hiddenIds = getHiddenCharacterIds_();


  if (hiddenIds.indexOf(id) === -1) {
    hiddenIds.push(id);
  }


  saveHiddenCharacterIds_(hiddenIds);


  return {
    success: true,
    hiddenCount: hiddenIds.length
  };
}


function restoreAllHiddenCharacters() {
  const userInfo = getCurrentUserInfo();


  if (!userInfo.isAdmin) {
    throw new Error('Возвращать скрытых персонажей может только владелец приложения.');
  }


  PropertiesService
    .getUserProperties()
    .deleteProperty(MITRINIUM_HIDDEN_KEY);


  return {
    success: true,
    hiddenCount: 0
  };
}


function getHiddenCharacterIds_() {
  const raw = PropertiesService
    .getUserProperties()
    .getProperty(MITRINIUM_HIDDEN_KEY);


  if (!raw) {
    return [];
  }


  try {
    const parsed = JSON.parse(raw);


    return Array.isArray(parsed)
      ? parsed.map(function (id) {
          return String(id || '');
        }).filter(Boolean)
      : [];
  } catch (error) {
    return [];
  }
}


function saveHiddenCharacterIds_(ids) {
  const uniqueIds = [];
  const lookup = {};


  (ids || []).forEach(function (id) {
    const normalizedId = String(id || '').trim();


    if (!normalizedId || lookup[normalizedId]) {
      return;
    }


    lookup[normalizedId] = true;
    uniqueIds.push(normalizedId);
  });


  PropertiesService
    .getUserProperties()
    .setProperty(
      MITRINIUM_HIDDEN_KEY,
      JSON.stringify(uniqueIds)
    );
}


/* =========================
   Броски эффективности
========================= */

function performEfficiencyRoll(request) {
  request = request || {};

  const sceneDiceMap = {
    hindrance: [4, 4],
    normal: [4, 6],
    advantage: [6, 6],
    exceptional: [8, 8]
  };

  const sceneKey =
    Object.prototype.hasOwnProperty.call(
      sceneDiceMap,
      request.sceneKey
    )
      ? request.sceneKey
      : 'normal';

  const firstComponent =
    sanitizeRollComponent_(
      request.firstComponent,
      'Первый компонент'
    );

  const secondComponent =
    sanitizeRollComponent_(
      request.secondComponent,
      'Второй компонент'
    );

  const dice = [];

  sceneDiceMap[sceneKey].forEach(
    function (sides, index) {
      dice.push({
        sides: sides,
        value: rollDie_(sides),
        source:
          'Куб сцены ' +
          (index + 1)
      });
    }
  );

  addD6Dice_(
    dice,
    firstComponent.value,
    firstComponent.label
  );

  addD6Dice_(
    dice,
    secondComponent.value,
    secondComponent.label
  );

  const originalDice =
    dice.map(function (die) {
      return Object.assign(
        {},
        die
      );
    });

  const originalEvaluation =
    evaluateEfficiencyDice_(
      originalDice
    );

  let replacementResult =
    request.useReplacement
      ? chooseReplacementByFour_(
          originalDice
        )
      : {
          dice:
            originalDice.map(
              function (die) {
                return Object.assign(
                  {},
                  die
                );
              }
            ),

          replacement: null,

          evaluation:
            originalEvaluation
        };

  /*
    Финальная серверная защита.

    Замена применяется только тогда,
    когда итоговая ЭФ строго выше
    исходной ЭФ.
  */
  if (
    replacementResult.replacement &&
    (
      !replacementResult.evaluation ||
      !isFinite(
        Number(
          replacementResult
            .evaluation.ef
        )
      ) ||
      Number(
        replacementResult
          .evaluation.ef
      ) <=
      Number(
        originalEvaluation.ef
      )
    )
  ) {
    replacementResult = {
      dice:
        originalDice.map(
          function (die) {
            return Object.assign(
              {},
              die
            );
          }
        ),

      replacement: null,

      evaluation:
        originalEvaluation
    };
  }

  const control =
    request.control &&
    request.control.enabled
      ? rollControl_(
          request.control
        )
      : null;

  const controlEfBonus =
    control &&
    control.natural20
      ? 1
      : 0;

  const baseEf =
    Number(
      replacementResult
        .evaluation.ef
    );

  const finalEf =
    baseEf +
    controlEfBonus;

  const result = {
    id:
      Utilities.getUuid(),

    timestamp:
      new Date().toISOString(),

    type:
      'efficiency',

    title:
      sanitizeRollText_(
        request.title,
        'Бросок эффективности',
        160
      ),

    characterId:
      sanitizeRollText_(
        request.characterId,
        '',
        100
      ),

    characterName:
      sanitizeRollText_(
        request.characterName,
        'Без имени',
        120
      ),

    className:
      sanitizeRollText_(
        request.className,
        '',
        80
      ),

    classIcon:
      MITRINIUM_CLASS_ICONS[
        String(
          request.className || ''
        )
      ] || '',

    sceneKey:
      sceneKey,

    components: [
      firstComponent,
      secondComponent
    ],

    originalDice:
      originalDice,

    dice:
      replacementResult.dice,

    replacement:
      replacementResult
        .replacement,

    originalEf:
      Number(
        originalEvaluation.ef
      ),

    baseEf:
      baseEf,

    finalEf:
      finalEf,

    efBonusFromControl:
      controlEfBonus,

    outcome:
      getEfOutcome_(
        finalEf
      ),

    ones:
      replacementResult
        .evaluation.ones,

    complication:
      replacementResult
        .evaluation
        .complication,

    criticalFaces:
      replacementResult
        .evaluation
        .criticalFaces,

    breakthrough:
      replacementResult
        .evaluation
        .breakthrough,

    topValues:
      replacementResult
        .evaluation
        .topValues,

    bottomValues:
      replacementResult
        .evaluation
        .bottomValues,

    control:
      control
  };

  appendRollLog_(
    result
  );

  return result;
}


function sanitizeRollComponent_(
  component,
  fallbackLabel
) {
  component =
    component || {};

  return {
    key:
      sanitizeRollText_(
        component.key,
        '',
        120
      ),

    label:
      sanitizeRollText_(
        component.label,
        fallbackLabel,
        120
      ),

    value:
      clampInteger_(
        component.value,
        1,
        3,
        1
      )
  };
}


function addD6Dice_(
  dice,
  count,
  source
) {
  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    dice.push({
      sides: 6,
      value: rollDie_(6),
      source: source
    });
  }
}


function evaluateEfficiencyDice_(
  dice
) {
  const values =
    (dice || []).map(
      function (die) {
        return (
          Number(die.value) ||
          0
        );
      }
    );

  const sortedValues =
    values
      .slice()
      .sort(
        function (
          first,
          second
        ) {
          return (
            first -
            second
          );
        }
      );

  const bottomValues =
    sortedValues.slice(
      0,
      2
    );

  const topValues =
    sortedValues.slice(
      -2
    );

  const bottomSum =
    bottomValues.reduce(
      function (
        sum,
        value
      ) {
        return (
          sum +
          value
        );
      },
      0
    );

  const topSum =
    topValues.reduce(
      function (
        sum,
        value
      ) {
        return (
          sum +
          value
        );
      },
      0
    );

  const ones =
    values.filter(
      function (value) {
        return (
          value === 1
        );
      }
    ).length;

  const criticalFaces =
    (dice || []).filter(
      function (die) {
        const sides =
          Number(
            die.sides
          ) || 0;

        const value =
          Number(
            die.value
          ) || 0;

        if (sides === 6) {
          return (
            value === 6
          );
        }

        if (sides === 8) {
          return (
            value >= 6
          );
        }

        return false;
      }
    ).length;

  return {
    ef:
      topSum -
      bottomSum,

    topValues:
      topValues,

    bottomValues:
      bottomValues,

    ones:
      ones,

    complication:
      getComplicationLabel_(
        ones
      ),

    criticalFaces:
      criticalFaces,

    breakthrough:
      getBreakthroughLabel_(
        criticalFaces
      )
  };
}


function chooseReplacementByFour_(
  dice
) {
  const originalDice =
    (dice || []).map(
      function (die) {
        return Object.assign(
          {},
          die
        );
      }
    );

  const originalEvaluation =
    evaluateEfficiencyDice_(
      originalDice
    );

  const originalEf =
    Number(
      originalEvaluation.ef
    );

  if (!isFinite(originalEf)) {
    return {
      dice:
        originalDice,

      replacement:
        null,

      evaluation:
        originalEvaluation
    };
  }

  let bestDice =
    null;

  let bestEvaluation =
    null;

  let bestReplacement =
    null;

  let bestEf =
    originalEf;

  originalDice.forEach(
    function (
      die,
      index
    ) {
      const previousValue =
        Number(
          die.value
        );

      if (
        !isFinite(
          previousValue
        ) ||
        previousValue === 4
      ) {
        return;
      }

      const candidateDice =
        originalDice.map(
          function (
            candidateDie
          ) {
            return Object.assign(
              {},
              candidateDie
            );
          }
        );

      candidateDice[index]
        .value = 4;

      candidateDice[index]
        .originalValue =
        previousValue;

      const candidateEvaluation =
        evaluateEfficiencyDice_(
          candidateDice
        );

      const candidateEf =
        Number(
          candidateEvaluation.ef
        );

      if (
        !isFinite(
          candidateEf
        )
      ) {
        return;
      }

      /*
        Главная проверка.

        Любая замена с равной
        или меньшей ЭФ запрещена.
      */
      if (
        candidateEf <=
        originalEf
      ) {
        return;
      }

      if (
        candidateEf >
        bestEf
      ) {
        bestEf =
          candidateEf;

        bestDice =
          candidateDice;

        bestEvaluation =
          candidateEvaluation;

        bestReplacement = {
          index:
            index,

          from:
            previousValue,

          to:
            4,

          source:
            candidateDice[index]
              .source,

          sides:
            candidateDice[index]
              .sides,

          originalEf:
            originalEf,

          resultingEf:
            candidateEf
        };

        return;
      }

      /*
        При одинаковой повышенной ЭФ
        выбираем лучший вторичный
        результат.
      */
      if (
        candidateEf ===
          bestEf &&
        bestEvaluation &&
        isReplacementTieBetter_(
          candidateEvaluation,
          bestEvaluation
        )
      ) {
        bestDice =
          candidateDice;

        bestEvaluation =
          candidateEvaluation;

        bestReplacement = {
          index:
            index,

          from:
            previousValue,

          to:
            4,

          source:
            candidateDice[index]
              .source,

          sides:
            candidateDice[index]
              .sides,

          originalEf:
            originalEf,

          resultingEf:
            candidateEf
        };
      }
    }
  );

  /*
    Если ни один вариант строго
    не повысил ЭФ, возвращаем
    исходные кубы.
  */
  if (
    !bestReplacement ||
    !bestEvaluation ||
    !bestDice ||
    Number(
      bestEvaluation.ef
    ) <= originalEf
  ) {
    return {
      dice:
        originalDice.map(
          function (die) {
            return Object.assign(
              {},
              die
            );
          }
        ),

      replacement:
        null,

      evaluation:
        originalEvaluation
    };
  }

  return {
    dice:
      bestDice,

    replacement:
      bestReplacement,

    evaluation:
      bestEvaluation
  };
}


function isReplacementTieBetter_(
  candidate,
  current
) {
  if (
    !candidate ||
    !current
  ) {
    return false;
  }

  const candidateEf =
    Number(
      candidate.ef
    );

  const currentEf =
    Number(
      current.ef
    );

  if (
    !isFinite(
      candidateEf
    ) ||
    !isFinite(
      currentEf
    ) ||
    candidateEf !==
      currentEf
  ) {
    return false;
  }

  const candidateRank =
    getComplicationRank_(
      Number(
        candidate.ones
      ) || 0
    );

  const currentRank =
    getComplicationRank_(
      Number(
        current.ones
      ) || 0
    );

  if (
    candidateRank !==
    currentRank
  ) {
    return (
      candidateRank <
      currentRank
    );
  }

  const candidateCriticalFaces =
    Number(
      candidate.criticalFaces
    ) || 0;

  const currentCriticalFaces =
    Number(
      current.criticalFaces
    ) || 0;

  if (
    candidateCriticalFaces !==
    currentCriticalFaces
  ) {
    return (
      candidateCriticalFaces >
      currentCriticalFaces
    );
  }

  return false;
}


function getComplicationRank_(
  ones
) {
  if (ones < 3) {
    return 0;
  }

  if (ones === 3) {
    return 1;
  }

  return 2;
}


function getComplicationLabel_(
  ones
) {
  if (ones >= 4) {
    return (
      'Тяжёлое осложнение'
    );
  }

  if (ones === 3) {
    return (
      'Осложнение'
    );
  }

  return 'Нет';
}


function getBreakthroughLabel_(
  criticalFaces
) {
  if (
    criticalFaces >= 4
  ) {
    return (
      'Большой Прорыв'
    );
  }

  if (
    criticalFaces === 3
  ) {
    return 'Прорыв';
  }

  return 'Нет';
}


function getEfOutcome_(
  ef
) {
  if (ef <= 3) {
    return 'Неудача';
  }

  if (ef <= 5) {
    return 'Элементарно';
  }

  if (ef <= 7) {
    return 'Обычный успех';
  }

  if (ef === 8) {
    return 'Сильный успех';
  }

  return (
    'Почти невозможное сделано'
  );
}


/* =========================
   Контроль
========================= */

function rollControl_(
  controlRequest
) {
  controlRequest =
    controlRequest || {};

  const methodKey =
    String(
      controlRequest.methodKey ||
      'fixed1'
    );

  const methodName =
    sanitizeRollText_(
      controlRequest.methodName,
      '',
      30
    );

  const methodSidesMap = {
    d4: 4,
    d6: 6,
    d8: 8,
    d10: 10
  };

  const d20 =
    rollDie_(20);

  let methodValue =
    1;

  let methodSides =
    0;

  if (
    Object.prototype
      .hasOwnProperty.call(
        methodSidesMap,
        methodKey
      )
  ) {
    methodSides =
      methodSidesMap[
        methodKey
      ];

    methodValue =
      rollDie_(
        methodSides
      );
  }

  const flatBonus =
    clampInteger_(
      controlRequest.flatBonus,
      -20,
      20,
      0
    );

  const difficulty =
    clampInteger_(
      controlRequest.difficulty,
      1,
      50,
      10
    );

  const total =
    d20 +
    methodValue +
    flatBonus;

  return {
    methodName:
      methodName,

    d20:
      d20,

    methodKey:
      methodKey,

    methodSides:
      methodSides,

    methodValue:
      methodValue,

    flatBonus:
      flatBonus,

    difficulty:
      difficulty,

    total:
      total,

    success:
      total >=
      difficulty,

    natural1:
      d20 === 1,

    natural20:
      d20 === 20
  };
}


/* =========================
   Случайный бросок / атака
========================= */

function performRandomRoll(
  request
) {
  request =
    request || {};

  const allowedSides = [
    2,
    4,
    6,
    8,
    10,
    12
  ];

  const requestedSides =
    Number(
      request.sides
    );

  const sides =
    allowedSides.indexOf(
      requestedSides
    ) !== -1
      ? requestedSides
      : 6;

  const count =
    clampInteger_(
      request.count,
      1,
      20,
      1
    );

  const modifier =
    clampInteger_(
      request.modifier,
      -1000,
      1000,
      0
    );

  const dice = [];

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    dice.push({
      sides:
        sides,

      value:
        rollDie_(
          sides
        ),

      source:
        'Случайный бросок'
    });
  }

  const diceSum =
    dice.reduce(
      function (
        sum,
        die
      ) {
        return (
          sum +
          die.value
        );
      },
      0
    );

  const total =
    diceSum +
    modifier;

  const result = {
    id:
      Utilities.getUuid(),

    timestamp:
      new Date().toISOString(),

    type:
      'random',

    title:
      sanitizeRollText_(
        request.title,
        'Случайный бросок',
        160
      ),

    characterId:
      sanitizeRollText_(
        request.characterId,
        '',
        100
      ),

    characterName:
      sanitizeRollText_(
        request.characterName,
        'Без имени',
        120
      ),

    className:
      sanitizeRollText_(
        request.className,
        '',
        80
      ),

    classIcon:
      MITRINIUM_CLASS_ICONS[
        String(
          request.className || ''
        )
      ] || '',

    count:
      count,

    sides:
      sides,

    modifier:
      modifier,

    dice:
      dice,

    diceSum:
      diceSum,

    total:
      total,

    finalResult:
      total
  };

  appendRollLog_(
    result
  );

  return result;
}


/* =========================
   Общий лог бросков
========================= */

function getRollLog(limit) {
  const userInfo =
    getCurrentUserInfo();

  const sheet =
    getRollLogSheet_();

  const lastRow =
    sheet.getLastRow();

  const safeLimit =
    clampInteger_(
      limit,
      1,
      200,
      100
    );

  if (lastRow < 2) {
    return {
      entries: [],
      isAdmin:
        userInfo.isAdmin
    };
  }

  const firstRow =
    Math.max(
      2,
      lastRow -
      safeLimit +
      1
    );

  const values =
    sheet
      .getRange(
        firstRow,
        1,
        lastRow -
          firstRow +
          1,
        15
      )
      .getValues();

  const entries =
    values
      .reverse()
      .map(
        function (row) {
          return {
            id:
              String(
                row[0] || ''
              ),

            timestamp:
              serializeDate_(
                row[1]
              ),

            userEmail:
              String(
                row[2] || ''
              ),

            characterId:
              String(
                row[3] || ''
              ),

            characterName:
              String(
                row[4] || ''
              ),

            className:
              String(
                row[5] || ''
              ),

            classIcon:
              String(
                row[6] || ''
              ),

            type:
              String(
                row[7] || ''
              ),

            title:
              String(
                row[8] || ''
              ),

            finalResult:
              String(
                row[9] || ''
              ),

            ef:
              row[10] === ''
                ? null
                : Number(
                    row[10]
                  ),

            complication:
              String(
                row[11] || ''
              ),

            breakthrough:
              String(
                row[12] || ''
              ),

            dice:
              parseRollJson_(
                row[13],
                []
              ),

            control:
              parseRollJson_(
                row[14],
                null
              )
          };
        }
      );

  return {
    entries:
      entries,

    isAdmin:
      userInfo.isAdmin
  };
}


function clearRollLog() {
  const userInfo =
    getCurrentUserInfo();

  if (
    !userInfo.isAdmin
  ) {
    throw new Error(
      'Очищать лог может только владелец приложения.'
    );
  }

  const sheet =
    getRollLogSheet_();

  const lastRow =
    sheet.getLastRow();

  if (lastRow >= 2) {
    sheet.deleteRows(
      2,
      lastRow - 1
    );
  }

  return {
    success: true
  };
}


function appendRollLog_(
  result
) {
  const userInfo =
    getCurrentUserInfo();

  const sheet =
    getRollLogSheet_();

  const lock =
    LockService
      .getScriptLock();

  lock.waitLock(
    10000
  );

  try {
    const isEfficiency =
      result.type ===
      'efficiency';

    sheet.appendRow([
      String(
        result.id ||
        Utilities.getUuid()
      ),

      new Date(
        result.timestamp ||
        new Date()
      ),

      userInfo.email,

      String(
        result.characterId || ''
      ),

      String(
        result.characterName ||
        'Без имени'
      ),

      String(
        result.className || ''
      ),

      String(
        result.classIcon || ''
      ),

      String(
        result.type || ''
      ),

      String(
        result.title || ''
      ),

      isEfficiency
        ? String(
            result.finalEf
          )
        : String(
            result.total
          ),

      isEfficiency
        ? Number(
            result.finalEf
          )
        : '',

      isEfficiency
        ? String(
            result.complication ||
            ''
          )
        : '',

      isEfficiency
        ? String(
            result.breakthrough ||
            ''
          )
        : '',

      JSON.stringify(
        result.dice || []
      ),

      JSON.stringify(
        result.control || null
      )
    ]);
  } finally {
    lock.releaseLock();
  }
}


function getRollLogSheet_() {
  const spreadsheet =
    SpreadsheetApp
      .openById(
        SPREADSHEET_ID
      );

  let sheet =
    spreadsheet
      .getSheetByName(
        MITRINIUM_ROLL_LOG_SHEET
      );

  if (!sheet) {
    sheet =
      spreadsheet.insertSheet(
        MITRINIUM_ROLL_LOG_SHEET
      );
  }

  const headers = [
    'ID',
    'Дата',
    'UserEmail',
    'CharacterID',
    'Персонаж',
    'Класс',
    'Значок',
    'Тип',
    'Название броска',
    'Итог',
    'ЭФ',
    'Осложнение',
    'Прорыв',
    'Кубы JSON',
    'Контроль JSON'
  ];

  sheet
    .getRange(
      1,
      1,
      1,
      headers.length
    )
    .setValues([
      headers
    ]);

  return sheet;
}


/* =========================
   Служебные функции патча
========================= */

function rollDie_(sides) {
  return (
    Math.floor(
      Math.random() *
      sides
    ) + 1
  );
}


function clampInteger_(
  value,
  minimum,
  maximum,
  fallback
) {
  const number =
    Number(value);

  const safeNumber =
    isFinite(number)
      ? Math.round(
          number
        )
      : fallback;

  return Math.max(
    minimum,
    Math.min(
      maximum,
      safeNumber
    )
  );
}


function sanitizeRollText_(
  value,
  fallback,
  maximumLength
) {
  const text =
    String(
      value === null ||
      value === undefined
        ? fallback || ''
        : value
    ).trim();

  return text.slice(
    0,
    maximumLength || 200
  );
}


function parseRollJson_(
  value,
  fallback
) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(
      String(value)
    );
  } catch (error) {
    return fallback;
  }
}
