const CLASS_ICONS = {
  Психопат: "⚗",
  Кустарь: "⚙",
  Воротила: "⚿",
  Рекрут: "⯐",
  Менталист: "Ψ",
  Натуралист: "◉",
};

const SCENE_DICE = {
  hindrance: [4, 4],
  normal: [4, 6],
  advantage: [6, 6],
  exceptional: [8, 8],
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
    ...(item.originalValue === undefined
      ? {}
      : { originalValue: integer(item.originalValue, 1, 1000, 1) }),
  }));
}

function complicationRank(ones) {
  if (ones < 3) return 0;
  if (ones === 3) return 1;
  return 2;
}

function evaluate(dice) {
  const values = dice.map((item) => Number(item.value) || 0);
  const sorted = [...values].sort((a, b) => a - b);
  const bottomValues = sorted.slice(0, 2);
  const topValues = sorted.slice(-2);
  const sum = (items) => items.reduce((total, value) => total + value, 0);
  const ones = values.filter((value) => value === 1).length;
  const criticalFaces = dice.filter((item) => {
    if (item.sides === 6) return item.value === 6;
    if (item.sides === 8) return item.value >= 6;
    return false;
  }).length;

  return {
    ef: sum(topValues) - sum(bottomValues),
    topValues,
    bottomValues,
    ones,
    complication:
      ones >= 4 ? "Тяжёлое осложнение" : ones === 3 ? "Осложнение" : "Нет",
    criticalFaces,
    breakthrough:
      criticalFaces >= 4
        ? "Большой Прорыв"
        : criticalFaces === 3
          ? "Прорыв"
          : "Нет",
  };
}

function outcome(ef) {
  if (ef <= 3) return "Неудача";
  if (ef <= 5) return "Элементарно";
  if (ef <= 7) return "Обычный успех";
  if (ef === 8) return "Сильный успех";
  return "Почти невозможное сделано";
}

function component(input, fallback) {
  return {
    key: text(input?.key, "", 120),
    label: text(input?.label, fallback, 120),
    value: integer(input?.value, 1, 3, 1),
  };
}

function rollControl(input = {}) {
  const methodSides = { d4: 4, d6: 6, d8: 8, d10: 10 };
  const methodName = text(input.methodName, "", 30);
  const methodKey = text(input.methodKey, "fixed1", 20);
  const sides = methodSides[methodKey] || 0;
  const d20 = die(20);
  const methodValue = sides ? die(sides) : 1;
  const flatBonus = integer(input.flatBonus, -20, 20, 0);
  const difficulty = integer(input.difficulty, 1, 50, 10);
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

function baseRollResult(request, dice, evaluation, control) {
  const controlBonus = control?.natural20 ? 1 : 0;
  const finalEf = evaluation.ef + controlBonus;
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
    replacement: null,
    originalEf: evaluation.ef,
    baseEf: evaluation.ef,
    finalEf,
    efBonusFromControl: controlBonus,
    outcome: outcome(finalEf),
    ...evaluation,
    control,
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

  const control = request.control?.enabled ? rollControl(request.control) : null;
  const result = baseRollResult(
    { ...request, sceneKey, firstComponent: first, secondComponent: second },
    dice,
    evaluate(dice),
    control,
  );
  await appendLog(db, user, result);
  return result;
}

function betterReplacement(candidate, current) {
  if (candidate.ef !== current.ef) return candidate.ef > current.ef;
  const candidateRank = complicationRank(candidate.ones);
  const currentRank = complicationRank(current.ones);
  if (candidateRank !== currentRank) return candidateRank < currentRank;
  return candidate.criticalFaces > current.criticalFaces;
}

function chooseOptimalFour(sourceDice) {
  const original = copyDice(sourceDice);
  const originalEvaluation = evaluate(original);
  let best = null;

  original.forEach((item, index) => {
    if (item.value === 4) return;
    const candidateDice = copyDice(original);
    candidateDice[index].originalValue = candidateDice[index].value;
    candidateDice[index].value = 4;
    const candidateEvaluation = evaluate(candidateDice);
    if (candidateEvaluation.ef <= originalEvaluation.ef) return;
    const candidate = {
      dice: candidateDice,
      evaluation: candidateEvaluation,
      replacement: {
        index,
        from: item.value,
        to: 4,
        source: item.source,
        sides: item.sides,
        originalEf: originalEvaluation.ef,
        resultingEf: candidateEvaluation.ef,
      },
    };
    if (!best || betterReplacement(candidateEvaluation, best.evaluation)) {
      best = candidate;
    }
  });

  return (
    best || {
      dice: original,
      evaluation: originalEvaluation,
      replacement: null,
    }
  );
}

export async function applyOptimalFour(db, user, previous = {}) {
  if (previous.type !== "efficiency") {
    throw new Error("Нет результата броска Эффективности.");
  }
  if (previous.replacement) {
    throw new Error("Замена на 4 уже была применена.");
  }

  const originalDice = copyDice(previous.originalDice || previous.dice);
  if (!originalDice.length) throw new Error("В результате нет кубов.");

  const originalEvaluation = evaluate(originalDice);
  const replacement = chooseOptimalFour(originalDice);
  const control = previous.control || null;
  const controlBonus = control?.natural20 ? 1 : 0;
  const finalEf = replacement.evaluation.ef + controlBonus;
  const result = {
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
    components: (previous.components || [])
      .slice(0, 2)
      .map((item, index) =>
        component(item, index ? "Второй компонент" : "Первый компонент"),
      ),
    originalDice,
    dice: replacement.dice,
    replacement: replacement.replacement,
    originalEf: originalEvaluation.ef,
    baseEf: replacement.evaluation.ef,
    finalEf,
    efBonusFromControl: controlBonus,
    outcome: outcome(finalEf),
    ...replacement.evaluation,
    control,
  };
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
  const safeLimit = integer(limit, 1, 200, 100);
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
  chooseOptimalFour,
  evaluate,
  outcome,
};
