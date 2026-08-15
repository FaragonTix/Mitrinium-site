const MITRINIUM_HIDDEN_CHARACTERS_KEY =
  'mitrinium.hiddenCharacters.v2';

const MITRINIUM_ROLL_LOG_SHEET_NAME =
  'RollLog';


/* =========================
   Сохранение с пределом 3
========================= */

function mitriniumSaveCharacter(character) {
  mitriniumValidateStatCaps_(
    character
  );

  return saveCharacter(character);
}


function mitriniumValidateStatCaps_(
  character
) {
  if (!character) {
    throw new Error(
      'Нет данных персонажа.'
    );
  }

  const attributesData =
    character.attributes || {};

  Object.keys(
    attributesData
  ).forEach(function (key) {
    const value =
      Number(
        attributesData[key]
      );

    if (
      !isFinite(value) ||
      value < 1 ||
      value > 3
    ) {
      throw new Error(
        'Значение Атрибута должно быть от 1 до 3.'
      );
    }
  });

  const skillsData =
    character.skills || {};

  Object.keys(
    skillsData
  ).forEach(function (groupKey) {
    const group =
      skillsData[groupKey] || {};

    Object.keys(group).forEach(
      function (skillKey) {
        const value =
          Number(
            group[skillKey]
          );

        if (
          !isFinite(value) ||
          value < 1 ||
          value > 3
        ) {
          throw new Error(
            'Значение Навыка должно быть от 1 до 3.'
          );
        }
      }
    );
  });
}


/* =========================
   Скрытие персонажей
========================= */

function mitriniumListVisibleCharacters() {
  const userInfo =
    getCurrentUserInfo();

  const characters =
    listSavedCharacters();

  if (!userInfo.isAdmin) {
    return {
      characters: characters,
      isAdmin: false,
      hiddenCount: 0
    };
  }

  const hiddenIds =
    mitriniumGetHiddenCharacterIds_();

  const hiddenLookup = {};

  hiddenIds.forEach(
    function (id) {
      hiddenLookup[
        String(id)
      ] = true;
    }
  );

  return {
    characters:
      characters.filter(
        function (character) {
          return !hiddenLookup[
            String(
              character.id || ''
            )
          ];
        }
      ),

    isAdmin: true,

    hiddenCount:
      hiddenIds.length
  };
}


function mitriniumHideCharacter(
  characterId
) {
  const userInfo =
    getCurrentUserInfo();

  if (!userInfo.isAdmin) {
    throw new Error(
      'Скрывать персонажей может только владелец приложения.'
    );
  }

  const id =
    String(
      characterId || ''
    ).trim();

  if (!id) {
    throw new Error(
      'Не указан ID персонажа.'
    );
  }

  const characterExists =
    listSavedCharacters()
      .some(function (character) {
        return (
          String(
            character.id || ''
          ) === id
        );
      });

  if (!characterExists) {
    throw new Error(
      'Персонаж не найден.'
    );
  }

  const hiddenIds =
    mitriniumGetHiddenCharacterIds_();

  if (
    hiddenIds.indexOf(id) === -1
  ) {
    hiddenIds.push(id);
  }

  mitriniumSaveHiddenCharacterIds_(
    hiddenIds
  );

  return {
    success: true,

    hiddenCount:
      hiddenIds.length
  };
}


function mitriniumRestoreHiddenCharacters() {
  const userInfo =
    getCurrentUserInfo();

  if (!userInfo.isAdmin) {
    throw new Error(
      'Возвращать скрытых персонажей может только владелец приложения.'
    );
  }

  PropertiesService
    .getUserProperties()
    .deleteProperty(
      MITRINIUM_HIDDEN_CHARACTERS_KEY
    );

  return {
    success: true,
    hiddenCount: 0
  };
}


function mitriniumGetHiddenCharacterIds_() {
  const raw =
    PropertiesService
      .getUserProperties()
      .getProperty(
        MITRINIUM_HIDDEN_CHARACTERS_KEY
      );

  if (!raw) {
    return [];
  }

  try {
    const parsed =
      JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed
          .map(function (id) {
            return String(
              id || ''
            );
          })
          .filter(Boolean)
      : [];
  } catch (error) {
    return [];
  }
}


function mitriniumSaveHiddenCharacterIds_(
  ids
) {
  const uniqueIds = [];
  const lookup = {};

  (ids || []).forEach(
    function (id) {
      const normalizedId =
        String(id || '').trim();

      if (
        !normalizedId ||
        lookup[normalizedId]
      ) {
        return;
      }

      lookup[normalizedId] =
        true;

      uniqueIds.push(
        normalizedId
      );
    }
  );

  PropertiesService
    .getUserProperties()
    .setProperty(
      MITRINIUM_HIDDEN_CHARACTERS_KEY,
      JSON.stringify(uniqueIds)
    );
}


/* =========================
   Первый бросок Эффективности
========================= */

function mitriniumRollEfficiency(
  request
) {
  request = request || {};

  const sceneDiceMap = {
    hindrance: [4, 4, 4],
    normal: [4, 4, 6],
    advantage: [6, 6, 6]
  };

  const sceneKey =
    Object.prototype
      .hasOwnProperty.call(
        sceneDiceMap,
        request.sceneKey
      )
      ? request.sceneKey
      : 'normal';

  const firstComponent =
    mitriniumSanitizeRollComponent_(
      request.firstComponent,
      'Первый компонент'
    );

  const secondComponent =
    mitriniumSanitizeRollComponent_(
      request.secondComponent,
      'Второй компонент'
    );

  const dice = [];

  sceneDiceMap[
    sceneKey
  ].forEach(
    function (sides, index) {
      dice.push({
        sides: sides,

        value:
          mitriniumRollDie_(
            sides
          ),

        source:
          'Куб сцены ' +
          (index + 1)
      });
    }
  );

  mitriniumAddD6Dice_(
    dice,
    firstComponent.value,
    firstComponent.label
  );

  mitriniumAddD6Dice_(
    dice,
    secondComponent.value,
    secondComponent.label
  );

  const evaluation =
    mitriniumEvaluateEfficiencyDice_(
      dice
    );

  const control =
    request.control &&
    request.control.enabled &&
    evaluation.complication ===
      'Осложнение'
      ? mitriniumRollControl_(
          request.control
        )
      : null;

  const finalEf =
    evaluation.ef;

  const difficulty =
    mitriniumClampInteger_(
      request.difficulty,
      4,
      10,
      6
    );

  const result = {
    id:
      Utilities.getUuid(),

    timestamp:
      new Date().toISOString(),

    type:
      'efficiency',

    title:
      mitriniumSanitizeText_(
        request.title,
        'Бросок эффективности',
        160
      ),

    characterId:
      mitriniumSanitizeText_(
        request.characterId,
        '',
        100
      ),

    characterName:
      mitriniumSanitizeText_(
        request.characterName,
        'Без имени',
        120
      ),

    className:
      mitriniumSanitizeText_(
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

    /* Исходный пул сохраняется для действий после броска. */
    originalDice:
      dice.map(
        mitriniumCopyDie_
      ),

    dice:
      dice.map(
        mitriniumCopyDie_
      ),

    originalEf:
      evaluation.ef,

    baseEf:
      evaluation.ef,

    finalEf:
      finalEf,

    difficulty:
      difficulty,

    difficultyLabel:
      mitriniumGetEfOutcome_(difficulty),

    success:
      finalEf >= difficulty,

    biographyBonus:
      0,

    nerveRerolls:
      [],

    outcome:
      mitriniumGetEfOutcome_(
        finalEf
      ),

    complication:
      evaluation.complication,

    sceneValues:
      evaluation.sceneValues,

    sceneTrigger:
      evaluation.sceneTrigger,

    sceneThirdValue:
      evaluation.sceneThirdValue,

    potentialBreakthrough:
      evaluation.potentialBreakthrough,

    breakthrough:
      mitriniumGetBreakthroughLabel_(
        evaluation.potentialBreakthrough,
        finalEf,
        difficulty
      ),

    topValues:
      evaluation.topValues,

    bottomValues:
      evaluation.bottomValues,

    control:
      control,

    controlRequest:
      request.control || {
        enabled: false
      }
  };

  mitriniumAppendRollLog_(
    result
  );

  return result;
}


function mitriniumApplyBiographyBonus(
  previousResult
) {
  if (
    !previousResult ||
    previousResult.type !== 'efficiency'
  ) {
    throw new Error(
      'Нет результата броска Эффективности.'
    );
  }

  if (Number(previousResult.biographyBonus) >= 1) {
    throw new Error(
      'Биографическая черта уже применена к этому броску.'
    );
  }

  const result = JSON.parse(
    JSON.stringify(previousResult)
  );

  result.id = Utilities.getUuid();
  result.previousRollId = String(previousResult.id || '');
  result.timestamp = new Date().toISOString();
  result.biographyBonus = 1;
  result.baseEf = Number(previousResult.baseEf ?? previousResult.finalEf ?? 0);
  result.finalEf = result.baseEf + 1;
  result.success = result.finalEf >= Number(result.difficulty || 6);
  result.outcome = mitriniumGetEfOutcome_(result.finalEf);
  result.breakthrough = mitriniumGetBreakthroughLabel_(
    Boolean(result.potentialBreakthrough),
    result.finalEf,
    Number(result.difficulty || 6)
  );

  mitriniumAppendRollLog_(result);

  return result;
}


function mitriniumRerollEfficiencyDie(
  previousResult,
  dieIndex
) {
  if (
    !previousResult ||
    previousResult.type !== 'efficiency'
  ) {
    throw new Error(
      'Нет результата броска Эффективности.'
    );
  }

  const dice = mitriniumSanitizeDiceList_(
    previousResult.dice
  );

  const index = Number(dieIndex);

  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= dice.length
  ) {
    throw new Error(
      'Выберите куб для переброса.'
    );
  }

  const from = dice[index].value;
  dice[index].value = mitriniumRollDie_(
    dice[index].sides
  );
  dice[index].rerolledFrom = from;

  const evaluation =
    mitriniumEvaluateEfficiencyDice_(dice);

  const controlRequest =
    previousResult.controlRequest || {
      enabled: Boolean(previousResult.control)
    };

  let control = null;

  if (evaluation.complication === 'Осложнение') {
    control =
      previousResult.complication === 'Осложнение' &&
      previousResult.control
        ? previousResult.control
        : controlRequest.enabled
          ? mitriniumRollControl_(controlRequest)
          : null;
  }

  const result = JSON.parse(
    JSON.stringify(previousResult)
  );

  result.id = Utilities.getUuid();
  result.previousRollId = String(previousResult.id || '');
  result.timestamp = new Date().toISOString();
  result.dice = dice;
  result.baseEf = evaluation.ef;
  result.finalEf =
    evaluation.ef +
    (Number(previousResult.biographyBonus) >= 1 ? 1 : 0);
  result.outcome = mitriniumGetEfOutcome_(result.finalEf);
  result.complication = evaluation.complication;
  result.sceneValues = evaluation.sceneValues;
  result.sceneTrigger = evaluation.sceneTrigger;
  result.sceneThirdValue = evaluation.sceneThirdValue;
  result.potentialBreakthrough = evaluation.potentialBreakthrough;
  result.success = result.finalEf >= Number(result.difficulty || 6);
  result.breakthrough = mitriniumGetBreakthroughLabel_(
    evaluation.potentialBreakthrough,
    result.finalEf,
    Number(result.difficulty || 6)
  );
  result.topValues = evaluation.topValues;
  result.bottomValues = evaluation.bottomValues;
  result.control = control;
  result.controlRequest = controlRequest;
  result.nerveRerolls = Array.isArray(previousResult.nerveRerolls)
    ? previousResult.nerveRerolls.slice(0, 19)
    : [];
  result.nerveRerolls.push({
    index: index,
    from: from,
    to: dice[index].value,
    source: dice[index].source,
    sides: dice[index].sides
  });

  mitriniumAppendRollLog_(result);

  return result;
}


/* =========================
   Замена ПОСЛЕ броска
========================= */

function mitriniumApplyOptimalFour(
  previousResult
) {
  if (
    !previousResult ||
    previousResult.type !==
      'efficiency'
  ) {
    throw new Error(
      'Нет результата броска Эффективности.'
    );
  }

  if (
    previousResult.replacement
  ) {
    throw new Error(
      'Замена на 4 уже была применена.'
    );
  }

  const sourceDice =
    mitriniumSanitizeDiceList_(
      previousResult.originalDice ||
      previousResult.dice
    );

  if (
    sourceDice.length === 0
  ) {
    throw new Error(
      'В результате нет кубов.'
    );
  }

  const originalEvaluation =
    mitriniumEvaluateEfficiencyDice_(
      sourceDice
    );

  let replacementResult =
    mitriniumChooseOptimalFour_(
      sourceDice
    );

  /*
    Дополнительная серверная защита.

    Даже если алгоритм выбора в будущем
    будет изменён, замена с равной или
    меньшей ЭФ здесь будет отменена.
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
        sourceDice.map(
          mitriniumCopyDie_
        ),

      replacement:
        null,

      evaluation:
        originalEvaluation
    };
  }

  const control =
    mitriniumSanitizeExistingControl_(
      previousResult.control
    );

  const controlEfBonus =
    control &&
    control.natural20
      ? 1
      : 0;

  const finalEf =
    replacementResult
      .evaluation.ef +
    controlEfBonus;

  const components =
    Array.isArray(
      previousResult.components
    )
      ? previousResult.components
          .slice(0, 2)
          .map(
            function (
              component,
              index
            ) {
              return mitriniumSanitizeRollComponent_(
                component,
                index === 0
                  ? 'Первый компонент'
                  : 'Второй компонент'
              );
            }
          )
      : [];

  while (
    components.length < 2
  ) {
    components.push(
      mitriniumSanitizeRollComponent_(
        {},
        components.length === 0
          ? 'Первый компонент'
          : 'Второй компонент'
      )
    );
  }

  const result = {
    id:
      Utilities.getUuid(),

    previousRollId:
      mitriniumSanitizeText_(
        previousResult.id,
        '',
        100
      ),

    timestamp:
      new Date().toISOString(),

    type:
      'efficiency',

    title:
      mitriniumSanitizeText_(
        previousResult.title,
        'Бросок эффективности',
        160
      ),

    characterId:
      mitriniumSanitizeText_(
        previousResult.characterId,
        '',
        100
      ),

    characterName:
      mitriniumSanitizeText_(
        previousResult.characterName,
        'Без имени',
        120
      ),

    className:
      mitriniumSanitizeText_(
        previousResult.className,
        '',
        80
      ),

    classIcon:
      MITRINIUM_CLASS_ICONS[
        String(
          previousResult.className ||
          ''
        )
      ] || '',

    sceneKey:
      mitriniumSanitizeText_(
        previousResult.sceneKey,
        'normal',
        30
      ),

    components:
      components,

    originalDice:
      sourceDice.map(
        mitriniumCopyDie_
      ),

    dice:
      replacementResult.dice,

    replacement:
      replacementResult.replacement,

    originalEf:
      originalEvaluation.ef,

    baseEf:
      replacementResult
        .evaluation.ef,

    finalEf:
      finalEf,

    efBonusFromControl:
      controlEfBonus,

    outcome:
      mitriniumGetEfOutcome_(
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
      mitriniumGetBreakthroughLabel_(
        replacementResult
          .evaluation
          .criticalFaces,
        finalEf
      ),

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

  mitriniumAppendRollLog_(
    result
  );

  return result;
}


/*
  Перебирает все возможные замены одного
  выпавшего значения на 4.

  Кандидат допускается только тогда,
  когда его ЭФ строго выше исходной.
*/
function mitriniumChooseOptimalFour_(
  dice
) {
  const originalDice =
    (dice || []).map(
      mitriniumCopyDie_
    );

  const originalEvaluation =
    mitriniumEvaluateEfficiencyDice_(
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

  let bestCandidate =
    null;

  originalDice.forEach(
    function (die, index) {
      const previousValue =
        Number(
          die.value
        );

      if (
        !isFinite(previousValue) ||
        previousValue === 4
      ) {
        return;
      }

      const candidateDice =
        originalDice.map(
          mitriniumCopyDie_
        );

      candidateDice[index]
        .value = 4;

      candidateDice[index]
        .originalValue =
        previousValue;

      const evaluation =
        mitriniumEvaluateEfficiencyDice_(
          candidateDice
        );

      const candidateEf =
        Number(
          evaluation.ef
        );

      /*
        Главная гарантия:
        равная или меньшая ЭФ
        не считается улучшением.
      */
      if (
        !isFinite(candidateEf) ||
        candidateEf <= originalEf
      ) {
        return;
      }

      const candidate = {
        dice:
          candidateDice,

        replacement: {
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
        },

        evaluation:
          evaluation
      };

      if (
        !bestCandidate ||
        mitriniumIsReplacementBetter_(
          candidate.evaluation,
          bestCandidate.evaluation
        )
      ) {
        bestCandidate =
          candidate;
      }
    }
  );

  if (!bestCandidate) {
    return {
      dice:
        originalDice.map(
          mitriniumCopyDie_
        ),

      replacement:
        null,

      evaluation:
        originalEvaluation
    };
  }

  /*
    Финальная защита непосредственно
    в функции выбора.
  */
  if (
    Number(
      bestCandidate
        .evaluation.ef
    ) <= originalEf
  ) {
    return {
      dice:
        originalDice.map(
          mitriniumCopyDie_
        ),

      replacement:
        null,

      evaluation:
        originalEvaluation
    };
  }

  return bestCandidate;
}


/*
  Сравнивает только кандидатов, которые
  уже строго повысили исходную ЭФ.
*/
function mitriniumIsReplacementBetter_(
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
    !isFinite(candidateEf) ||
    !isFinite(currentEf)
  ) {
    return false;
  }

  /*
    Первый критерий:
    максимальная ЭФ.
  */
  if (
    candidateEf !==
    currentEf
  ) {
    return (
      candidateEf >
      currentEf
    );
  }

  /*
    Только при одинаковой ЭФ
    сравниваем осложнения.
  */
  const candidateRank =
    mitriniumGetComplicationRank_(
      Number(
        candidate.ones
      ) || 0
    );

  const currentRank =
    mitriniumGetComplicationRank_(
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

  /*
    Затем сохраняем больше
    критических граней.
  */
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


/* =========================
   Вычисление Эффективности
========================= */

function mitriniumSanitizeRollComponent_(
  component,
  fallbackLabel
) {
  component = component || {};

  const componentKey =
    mitriniumSanitizeText_(
      component.key,
      '',
      120
    );

  const minimumValue =
    componentKey.indexOf('skill:') === 0
      ? 0
      : 1;

  return {
    key:
      componentKey,

    label:
      mitriniumSanitizeText_(
        component.label,
        fallbackLabel,
        120
      ),

    value:
      mitriniumClampInteger_(
        component.value,
        minimumValue,
        3,
        minimumValue
      )
  };
}


function mitriniumAddD6Dice_(
  dice,
  count,
  source
) {
  for (
    let index = 0;
    index < count;
    index++
  ) {
    dice.push({
      sides:
        6,

      value:
        mitriniumRollDie_(6),

      source:
        source
    });
  }
}


function mitriniumEvaluateEfficiencyDice_(
  dice
) {
  const values =
    (dice || [])
      .map(function (die) {
        return (
          Number(die.value) ||
          0
        );
      });

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
      function (sum, value) {
        return (
          sum +
          value
        );
      },
      0
    );

  const topSum =
    topValues.reduce(
      function (sum, value) {
        return (
          sum +
          value
        );
      },
      0
    );

  const sceneDice =
    (dice || []).filter(
      function (die) {
        return (
          String(die.source || '')
            .indexOf('Куб сцены') === 0
        );
      }
    );

  const sceneValues =
    sceneDice.map(
      function (die) {
        return Number(die.value) || 0;
      }
    );

  const sceneFrequencies = {};

  sceneValues.forEach(
    function (value) {
      sceneFrequencies[value] =
        (sceneFrequencies[value] || 0) + 1;
    }
  );

  let sceneTrigger = null;

  Object.keys(sceneFrequencies)
    .some(function (value) {
      if (sceneFrequencies[value] === 2) {
        sceneTrigger = Number(value);
        return true;
      }

      return false;
    });

  const sceneThirdValue =
    sceneTrigger === null
      ? null
      : sceneValues.filter(
          function (value) {
            return value !== sceneTrigger;
          }
        )[0] ?? null;

  const sceneEvent =
    sceneTrigger !== null &&
    sceneThirdValue === sceneTrigger - 1
      ? 'complication'
      : sceneTrigger !== null &&
          sceneThirdValue === sceneTrigger + 1
        ? 'breakthrough'
        : 'none';

  const ef =
    topSum -
    bottomSum;

  return {
    ef:
      ef,

    topValues:
      topValues,

    bottomValues:
      bottomValues,

    complication:
      sceneEvent === 'complication'
        ? 'Осложнение'
        : 'Нет',

    sceneValues:
      sceneValues,

    sceneTrigger:
      sceneTrigger,

    sceneThirdValue:
      sceneThirdValue,

    potentialBreakthrough:
      sceneEvent === 'breakthrough',

    breakthrough:
      sceneEvent === 'breakthrough'
        ? 'Потенциальный Прорыв'
        : 'Нет'
  };
}


function mitriniumGetComplicationRank_(
  ones
) {
  return ones >= 2 ? 1 : 0;
}


function mitriniumGetComplicationLabel_(
  ones
) {
  if (ones === 2) {
    return (
      'Осложнение'
    );
  }

  return 'Нет';
}


function mitriniumGetBreakthroughLabel_(
  potentialBreakthrough,
  ef,
  difficulty
) {
  if (
    potentialBreakthrough &&
    ef >= Number(difficulty || 6)
  ) {
    return 'Прорыв';
  }

  return 'Нет';
}


function mitriniumGetEfOutcome_(
  ef
) {
  const labels = {
    4: 'Элементарная',
    5: 'Простая',
    6: 'Квалифицированная',
    7: 'Профессиональная',
    8: 'Сложная профессиональная',
    9: 'Экспертная',
    10: 'Исключительная'
  };

  const value = Math.floor(Number(ef) || 0);

  if (value < 4) {
    return 'Ниже элементарной сложности';
  }

  return labels[Math.min(10, value)];
}


/* =========================
   Контроль
========================= */

function mitriniumRollControl_(
  request
) {
  request = request || {};

  const methodSidesMap = {
    d4: 4,
    d6: 6,
    d8: 8,
    d10: 10
  };

  const methodKey =
    String(
      request.methodKey ||
      'fixed1'
    );

  const methodName =
    mitriniumSanitizeText_(
      request.methodName,
      '',
      30
    );

  /*
    d20 здесь оставляем:
    это основной куб Контроля,
    а не случайный куб атаки.
  */
  const d20 =
    mitriniumRollDie_(20);

  let methodValue = 1;
  let methodSides = 0;

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
      mitriniumRollDie_(
        methodSides
      );
  }

  const flatBonus =
    mitriniumClampInteger_(
      request.flatBonus,
      -20,
      20,
      0
    );

  const difficulty =
    mitriniumClampInteger_(
      request.difficulty,
      1,
      50,
      18
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
      total >= difficulty,

    natural1:
      d20 === 1,

    natural20:
      d20 === 20
  };
}


function mitriniumSanitizeExistingControl_(
  control
) {
  if (!control) {
    return null;
  }

  return {
    methodName:
      mitriniumSanitizeText_(
        control.methodName,
        '',
        30
      ),

    d20:
      mitriniumClampInteger_(
        control.d20,
        1,
        20,
        1
      ),

    methodKey:
      mitriniumSanitizeText_(
        control.methodKey,
        'fixed1',
        20
      ),

    methodSides:
      mitriniumClampInteger_(
        control.methodSides,
        0,
        20,
        0
      ),

    methodValue:
      mitriniumClampInteger_(
        control.methodValue,
        0,
        20,
        1
      ),

    flatBonus:
      mitriniumClampInteger_(
        control.flatBonus,
        -20,
        20,
        0
      ),

    difficulty:
      mitriniumClampInteger_(
        control.difficulty,
        1,
        50,
        18
      ),

    total:
      mitriniumClampInteger_(
        control.total,
        -100,
        100,
        0
      ),

    success:
      Boolean(
        control.success
      ),

    natural1:
      Boolean(
        control.natural1
      ),

    natural20:
      Boolean(
        control.natural20
      )
  };
}


/* =========================
   Случайные кубы
========================= */

function mitriniumRollRandom(
  request
) {
  request = request || {};

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

  /*
    Не превращаем неизвестное
    значение автоматически в d6.
  */
  if (
    allowedSides.indexOf(
      requestedSides
    ) === -1
  ) {
    throw new Error(
      'Недопустимый тип куба: d' +
      String(
        request.sides || ''
      )
    );
  }

  const sides =
    requestedSides;

  const count =
    mitriniumClampInteger_(
      request.count,
      1,
      20,
      1
    );

  const modifier =
    mitriniumClampInteger_(
      request.modifier,
      -1000,
      1000,
      0
    );

  const dice = [];

  for (
    let index = 0;
    index < count;
    index++
  ) {
    dice.push({
      sides:
        sides,

      value:
        mitriniumRollDie_(
          sides
        ),

      source:
        'Случайный бросок'
    });
  }

  const diceSum =
    dice.reduce(
      function (sum, die) {
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
      mitriniumSanitizeText_(
        request.title,
        'Случайный бросок',
        160
      ),

    characterId:
      mitriniumSanitizeText_(
        request.characterId,
        '',
        100
      ),

    characterName:
      mitriniumSanitizeText_(
        request.characterName,
        'Без имени',
        120
      ),

    className:
      mitriniumSanitizeText_(
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

  mitriniumAppendRollLog_(
    result
  );

  return result;
}


/* =========================
   Общий лог
========================= */

function mitriniumGetRollLog(
  limit
) {
  const userInfo =
    getCurrentUserInfo();

  const sheet =
    mitriniumGetRollLogSheet_();

  const lastRow =
    sheet.getLastRow();

  const safeLimit =
    mitriniumClampInteger_(
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

  const rows =
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
    rows
      .reverse()
      .map(function (row) {
        return {
          id:
            String(
              row[0] || ''
            ),

          timestamp:
            row[1] instanceof Date
              ? row[1].toISOString()
              : String(
                  row[1] || ''
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
            mitriniumParseJson_(
              row[13],
              []
            ),

          control:
            mitriniumParseJson_(
              row[14],
              null
            )
        };
      });

  return {
    entries:
      entries,

    isAdmin:
      userInfo.isAdmin
  };
}


function mitriniumClearRollLog() {
  const userInfo =
    getCurrentUserInfo();

  if (!userInfo.isAdmin) {
    throw new Error(
      'Очищать лог может только владелец приложения.'
    );
  }

  const sheet =
    mitriniumGetRollLogSheet_();

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


function mitriniumAppendRollLog_(
  result
) {
  const userInfo =
    getCurrentUserInfo();

  const sheet =
    mitriniumGetRollLogSheet_();

  const lock =
    LockService
      .getScriptLock();

  lock.waitLock(
    10000
  );

  try {
    const efficiency =
      result.type ===
      'efficiency';

    sheet.appendRow([
      result.id ||
        Utilities.getUuid(),

      new Date(
        result.timestamp ||
        new Date()
      ),

      userInfo.email,

      result.characterId ||
        '',

      result.characterName ||
        'Без имени',

      result.className ||
        '',

      result.classIcon ||
        '',

      result.type ||
        '',

      result.title ||
        '',

      efficiency
        ? result.finalEf
        : result.total,

      efficiency
        ? result.finalEf
        : '',

      efficiency
        ? result.complication
        : '',

      efficiency
        ? result.breakthrough
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


function mitriniumGetRollLogSheet_() {
  const spreadsheet =
    SpreadsheetApp.openById(
      SPREADSHEET_ID
    );

  let sheet =
    spreadsheet.getSheetByName(
      MITRINIUM_ROLL_LOG_SHEET_NAME
    );

  if (!sheet) {
    sheet =
      spreadsheet.insertSheet(
        MITRINIUM_ROLL_LOG_SHEET_NAME
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
   Общие серверные утилиты
========================= */

function mitriniumRollDie_(
  sides
) {
  const safeSides =
    Number(sides);

  if (
    !Number.isInteger(
      safeSides
    ) ||
    safeSides < 2
  ) {
    throw new Error(
      'Некорректное число граней куба.'
    );
  }

  return (
    Math.floor(
      Math.random() *
      safeSides
    ) + 1
  );
}


function mitriniumCopyDie_(
  die
) {
  return {
    sides:
      Number(die.sides) ||
      6,

    value:
      Number(die.value) ||
      1,

    source:
      mitriniumSanitizeText_(
        die.source,
        '',
        120
      ),

    originalValue:
      die.originalValue ===
      undefined
        ? undefined
        : Number(
            die.originalValue
          ),

    rerolledFrom:
      die.rerolledFrom ===
      undefined
        ? undefined
        : Number(
            die.rerolledFrom
          )
  };
}


function mitriniumSanitizeDiceList_(
  dice
) {
  if (!Array.isArray(dice)) {
    return [];
  }

  return dice
    .slice(0, 30)
    .map(function (die) {
      const sides =
        mitriniumClampInteger_(
          die && die.sides,
          2,
          20,
          6
        );

      return {
        sides:
          sides,

        value:
          mitriniumClampInteger_(
            die && die.value,
            1,
            sides,
            1
          ),

        source:
          mitriniumSanitizeText_(
            die && die.source,
            'Куб',
            120
          ),

        rerolledFrom:
          die && die.rerolledFrom !== undefined
            ? mitriniumClampInteger_(
                die.rerolledFrom,
                1,
                sides,
                1
              )
            : undefined
      };
    });
}


function mitriniumClampInteger_(
  value,
  minimum,
  maximum,
  fallback
) {
  const number =
    Number(value);

  const safeNumber =
    isFinite(number)
      ? Math.round(number)
      : fallback;

  return Math.max(
    minimum,
    Math.min(
      maximum,
      safeNumber
    )
  );
}


function mitriniumSanitizeText_(
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


function mitriniumParseJson_(
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
