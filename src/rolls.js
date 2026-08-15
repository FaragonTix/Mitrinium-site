const CLASS_ICONS = {
  Психопат: "⚗",
  Кустарь: "⚙",
  Воротила: "⚿",
  Рекрут: "⯐",
  Менталист: "Ψ",
  Натуралист: "◉",
};

const SCENE_DICE = {
  hindrance: [4, 4, 4],
  normal: [4, 4, 6],
  advantage: [6, 6, 6],
};

const DIFFICULTY_LABELS = {
  4: "Элементарная",
  5: "Простая",
  6: "Квалифицированная",
  7: "Профессиональная",
  8: "Сложная профессиональная",
  9: "Экспертная",
  10: "Исключительная",
};

function text(value, fallback = "", maximum = 200) {
  return String(value ?? fallback).trim().slice(0, maximum);
}

function integer(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? Math.round(parsed) : fallback;
  return Math.max(minimum, Math.min(maximum, safe));
}

function die(sides) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return (values[0] % sides) + 1;
}

function copyDice(dice) {
  return (dice || []).map((item) => ({
    sides: integer(item.sides, 2, 1000, 6),
    value: integer(item.value, 1, 1000, 1),
    source: text(item.source, "", 160),
    ...(item.rerolledFrom === undefined
      ? {}
      : { rerolledFrom: integer(item.rerolledFrom, 1, 1000, 1) }),
  }));
}

function evaluate(dice) {
  const values = dice.map((item) => Number(item.value) || 0);
  const sorted = [...values].sort((a, b) => a - b);
  const bottomValues = sorted.slice(0, 2);
  const topValues = sorted.slice(-2);
  const sum = (items) => items.reduce((total, value) => total + value, 0);
  const sceneDice = dice.filter((item) =>
    String(item.source || "").startsWith("Куб сцены"),
  );
  const sceneValues = sceneDice.map((item) => Number(item.value) || 0);
  const frequencies = new Map();
  for (const value of sceneValues) {
    frequencies.set(value, (frequencies.get(value) || 0) + 1);
  }
  const duplicateEntry = [...frequencies.entries()].find(
    ([, count]) => count === 2,
  );
  const sceneTrigger = duplicateEntry?.[0] ?? null;
  const sceneThirdValue = duplicateEntry
    ? sceneValues.find((value) => value !== sceneTrigger) ?? null
    : null;
  const sceneEvent =
    sceneTrigger !== null && sceneThirdValue === sceneTrigger - 1
      ? "complication"
      : sceneTrigger !== null && sceneThirdValue === sceneTrigger + 1
        ? "breakthrough"
        : "none";
  const ef = sum(topValues) - sum(bottomValues);

  return {
    ef,
    topValues,
    bottomValues,
    sceneValues,
    sceneTrigger,
    sceneThirdValue,
    sceneEvent,
    complication: sceneEvent === "complication" ? "Осложнение" : "Нет",
    potentialBreakthrough: sceneEvent === "breakthrough",
    breakthrough:
      sceneEvent === "breakthrough" ? "Потенциальный Прорыв" : "Нет",
  };
}

function outcome(ef) {
  if (ef < 4) return "Ниже элементарной сложности";
  return DIFFICULTY_LABELS[Math.min(10, Math.floor(ef))];
}

function component(input, fallback) {
  const key = text(input?.key, "", 120);
  const minimum = key.startsWith("skill:") ? 0 : 1;
  return {
    key,
    label: text(input?.label, fallback, 120),
    value: integer(input?.value, minimum, 3, minimum),
  };
}

function rollDifficulty(value) {
  return integer(value, 4, 10, 6);
}

function resolveBreakthrough(evaluation, finalEf, difficulty) {
  return evaluation.potentialBreakthrough && finalEf >= difficulty
    ? "Прорыв"
    : "Нет";
}

function rollControl(input = {}) {
  const methodSides = { d4: 4, d6: 6, d8: 8, d10: 10 };
  const methodName = text(input.methodName, "", 30);
  const methodKey = text(input.methodKey, "fixed1", 20);
  const sides = methodSides[methodKey] || 0;
  const d20 = die(20);
  const methodValue = sides ? die(sides) : 1;
  const flatBonus = integer(input.flatBonus, -20, 20, 0);
  const difficulty = integer(input.difficulty, 1, 50, 18);
  const total = d20 + methodValue + flatBonus;

  return {
    d20,
    methodName,
    methodKey,
    methodSides: sides,
    methodValue,
    flatBonus,
    difficulty,
    total,
    success: total >= difficulty,
    natural1: d20 === 1,
    natural20: d20 === 20,
  };
}

function normalizeControlRequest(input = {}) {
  return {
    enabled: Boolean(input.enabled),
    methodName: text(input.methodName, "", 30),
    methodKey: text(input.methodKey, "fixed1", 20),
    flatBonus: integer(input.flatBonus, -20, 20, 0),
    difficulty: integer(input.difficulty, 1, 50, 18),
  };
}

function shouldRollControl(controlRequest, evaluation) {
  return Boolean(
    controlRequest?.enabled && evaluation?.complication === "Осложнение",
  );
}

function baseRollResult(request, dice, evaluation, control, controlRequest) {
  const finalEf = evaluation.ef;
  const difficulty = rollDifficulty(request.difficulty);
  const breakthrough = resolveBreakthrough(evaluation, finalEf, difficulty);
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: "efficiency",
    title: text(request.title, "Бросок эффективности", 160),
    characterId: text(request.characterId, "", 100),
    characterName: text(request.characterName, "Без имени", 120),
    className: text(request.className, "", 80),
    classIcon: CLASS_ICONS[String(request.className || "")] || "",
    sceneKey: text(request.sceneKey, "normal", 30),
    components: [
      component(request.firstComponent, "Первый компонент"),
      component(request.secondComponent, "Второй компонент"),
    ],
    originalDice: copyDice(dice),
    dice: copyDice(dice),
    originalEf: evaluation.ef,
    baseEf: evaluation.ef,
    finalEf,
    difficulty,
    difficultyLabel: DIFFICULTY_LABELS[difficulty],
    success: finalEf >= difficulty,
    biographyBonus: 0,
    nerveRerolls: [],
    outcome: outcome(finalEf),
    ...evaluation,
    breakthrough,
    control,
    controlRequest,
  };
}

function resultFromPrevious(previous, dice, evaluation, additions = {}) {
  const biographyBonus = integer(
    additions.biographyBonus ?? previous.biographyBonus,
    0,
    1,
    0,
  );
  const finalEf = evaluation.ef + biographyBonus;
  const difficulty = rollDifficulty(previous.difficulty);
  const controlRequest = normalizeControlRequest(
    previous.controlRequest || { enabled: Boolean(previous.control) },
  );
  const components = (previous.components || [])
    .slice(0, 2)
    .map((item, index) =>
      component(item, index ? "Второй компонент" : "Первый компонент"),
    );
  const breakthrough = resolveBreakthrough(evaluation, finalEf, difficulty);

  return {
    id: crypto.randomUUID(),
    previousRollId: text(previous.id, "", 100),
    timestamp: new Date().toISOString(),
    type: "efficiency",
    title: text(previous.title, "Бросок эффективности", 160),
    characterId: text(previous.characterId, "", 100),
    characterName: text(previous.characterName, "Без имени", 120),
    className: text(previous.className, "", 80),
    classIcon: CLASS_ICONS[String(previous.className || "")] || "",
    sceneKey: text(previous.sceneKey, "normal", 30),
    components,
    originalDice: copyDice(previous.originalDice || dice),
    dice: copyDice(dice),
    originalEf: Number(previous.originalEf ?? evaluation.ef),
    baseEf: evaluation.ef,
    finalEf,
    difficulty,
    difficultyLabel: DIFFICULTY_LABELS[difficulty],
    success: finalEf >= difficulty,
    biographyBonus,
    nerveRerolls: Array.isArray(additions.nerveRerolls)
      ? additions.nerveRerolls.slice(0, 20)
      : Array.isArray(previous.nerveRerolls)
        ? previous.nerveRerolls.slice(0, 20)
        : [],
    outcome: outcome(finalEf),
    ...evaluation,
    breakthrough,
    control: additions.control === undefined ? previous.control || null : additions.control,
    controlRequest,
  };
}

async function appendLog(db, user, result) {
  const efficiency = result.type === "efficiency";
  await db
    .prepare(
      `INSERT INTO roll_log (
         id, created_at, user_email, character_id, character_name,
         class_name, class_icon, type, title, final_result, ef,
         complication, breakthrough, dice_json, control_json
       ) VALUES (
         ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15
       )`,
    )
    .bind(
      result.id,
      result.timestamp,
      user.email,
      result.characterId || "",
      result.characterName || "",
      result.className || "",
      result.classIcon || "",
      result.type,
      result.title || "",
      String(efficiency ? result.finalEf : result.total),
      efficiency ? result.finalEf : null,
      efficiency ? result.complication || "" : "",
      efficiency ? result.breakthrough || "" : "",
      JSON.stringify(result.dice || []),
      result.control ? JSON.stringify(result.control) : null,
    )
    .run();
}

export async function appendExternalRoll(db, user, request = {}) {
  const type = request.type === "random" ? "random" : "efficiency";
  const dice = Array.isArray(request.dice)
    ? request.dice.slice(0, 30).map((item, index) => ({
        sides: integer(item?.sides, 2, 1000, 6),
        value: integer(item?.value, 1, 1000, 1),
        source: text(item?.source, `Куб ${index + 1}`, 120),
      }))
    : [];
  if (!dice.length) throw new Error("В переданном броске нет кубов.");

  const ef = type === "efficiency"
    ? integer(request.ef, -1000, 1000, 0)
    : null;
  const total = integer(request.finalResult, -100000, 100000, ef || 0);
  const result = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    characterId: text(request.characterId, "", 100),
    characterName: text(request.characterName, "Калькулятор боя", 120),
    className: text(request.className, "Противник", 120),
    classIcon: text(request.classIcon, "", 30),
    type,
    title: text(request.title, "Бросок из калькулятора боя", 240),
    dice,
    finalEf: ef,
    total,
    complication: request.complication ? "Осложнение" : "",
    breakthrough: request.breakthrough ? "Прорыв" : "",
    control: null,
  };
  await appendLog(db, user, result);
  return { success: true, id: result.id };
}

export async function rollEfficiency(db, user, request = {}) {
  const sceneKey = Object.hasOwn(SCENE_DICE, request.sceneKey)
    ? request.sceneKey
    : "normal";
  const first = component(request.firstComponent, "Первый компонент");
  const second = component(request.secondComponent, "Второй компонент");
  const dice = SCENE_DICE[sceneKey].map((sides, index) => ({
    sides,
    value: die(sides),
    source: `Куб сцены ${index + 1}`,
  }));

  for (const selected of [first, second]) {
    for (let index = 0; index < selected.value; index += 1) {
      dice.push({ sides: 6, value: die(6), source: selected.label });
    }
  }

  const evaluation = evaluate(dice);
  const controlRequest = normalizeControlRequest(request.control);
  const control =
    shouldRollControl(controlRequest, evaluation)
      ? rollControl(controlRequest)
      : null;
  const result = baseRollResult(
    { ...request, sceneKey, firstComponent: first, secondComponent: second },
    dice,
    evaluation,
    control,
    controlRequest,
  );
  await appendLog(db, user, result);
  return result;
}

export async function applyBiographyBonus(db, user, previous = {}) {
  if (previous.type !== "efficiency") {
    throw new Error("Нет результата броска Эффективности.");
  }
  if (Number(previous.biographyBonus) >= 1) {
    throw new Error("Биографическая черта уже применена к этому броску.");
  }

  const dice = copyDice(previous.dice);
  if (!dice.length) throw new Error("В результате нет кубов.");
  const result = resultFromPrevious(previous, dice, evaluate(dice), {
    biographyBonus: 1,
  });
  await appendLog(db, user, result);
  return result;
}

export async function rerollEfficiencyDie(db, user, previous = {}, dieIndex) {
  if (previous.type !== "efficiency") {
    throw new Error("Нет результата броска Эффективности.");
  }

  const dice = copyDice(previous.dice);
  if (!dice.length) throw new Error("В результате нет кубов.");
  const parsedIndex = Number(dieIndex);
  if (!Number.isInteger(parsedIndex) || parsedIndex < 0 || parsedIndex >= dice.length) {
    throw new Error("Выберите куб для переброса.");
  }
  const index = parsedIndex;

  const from = dice[index].value;
  dice[index].value = die(dice[index].sides);
  dice[index].rerolledFrom = from;
  const evaluation = evaluate(dice);
  const controlRequest = normalizeControlRequest(
    previous.controlRequest || { enabled: Boolean(previous.control) },
  );
  let control = null;

  if (evaluation.complication === "Осложнение") {
    control = previous.complication === "Осложнение" && previous.control
      ? previous.control
      : controlRequest.enabled
        ? rollControl(controlRequest)
        : null;
  }

  const nerveRerolls = Array.isArray(previous.nerveRerolls)
    ? previous.nerveRerolls.slice(0, 19)
    : [];
  nerveRerolls.push({
    index,
    from,
    to: dice[index].value,
    source: dice[index].source,
    sides: dice[index].sides,
  });

  const result = resultFromPrevious(previous, dice, evaluation, {
    control,
    nerveRerolls,
  });
  await appendLog(db, user, result);
  return result;
}

export async function rollRandom(db, user, request = {}) {
  const allowedSides = [2, 4, 6, 8, 10, 20];
  const requestedSides = Number(request.sides);
  const sides = allowedSides.includes(requestedSides) ? requestedSides : 6;
  const count = integer(request.count, 1, 20, 1);
  const modifier = integer(request.modifier, -1000, 1000, 0);
  const dice = Array.from({ length: count }, () => ({
    sides,
    value: die(sides),
    source: "Случайный бросок",
  }));
  const diceSum = dice.reduce((total, item) => total + item.value, 0);
  const total = diceSum + modifier;
  const result = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: "random",
    title: text(request.title, "Случайный бросок", 160),
    characterId: text(request.characterId, "", 100),
    characterName: text(request.characterName, "Без имени", 120),
    className: text(request.className, "", 80),
    classIcon: CLASS_ICONS[String(request.className || "")] || "",
    count,
    sides,
    modifier,
    dice,
    diceSum,
    total,
    finalResult: total,
  };
  await appendLog(db, user, result);
  return result;
}

export async function getRollLog(db, user, limit) {
  const safeLimit = integer(limit, 1, 5000, 100);
  const { results = [] } = await db
    .prepare(
      `SELECT * FROM roll_log ORDER BY created_at DESC LIMIT ?1`,
    )
    .bind(safeLimit)
    .all();

  return {
    entries: results.map((row) => ({
      id: row.id,
      timestamp: row.created_at,
      userEmail: row.user_email,
      characterId: row.character_id,
      characterName: row.character_name,
      className: row.class_name,
      classIcon: row.class_icon,
      type: row.type,
      title: row.title,
      finalResult: row.final_result,
      ef: row.ef,
      complication: row.complication,
      breakthrough: row.breakthrough,
      dice: JSON.parse(row.dice_json || "[]"),
      control: row.control_json ? JSON.parse(row.control_json) : null,
    })),
    isAdmin: user.isAdmin,
  };
}

export async function clearRollLog(db, user) {
  if (!user.isAdmin) throw new Error("Очищать лог может только администратор.");
  await db.prepare("DELETE FROM roll_log").run();
  return { success: true };
}

export const __test = {
  evaluate,
  outcome,
  resolveBreakthrough,
  shouldRollControl,
};
