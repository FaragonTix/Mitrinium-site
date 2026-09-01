import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = process.argv[2] || path.join(root, ".tmp-mitrinium-rules.txt");
const targetPath = path.join(root, "apps-script-source", "AbilitiesData.html");
const classes = ["Психопат", "Кустарь", "Воротила", "Рекрут", "Менталист", "Натуралист"];
const categories = new Map([
  ["Ультимативные", "ultimate"],
  ["Любимые приёмы", "favorite"],
  ["Обычные дела", "common"],
  ["Ситуативные способности", "situational"],
]);
const expectedCategoryCounts = {
  ultimate: 6,
  favorite: 6,
  common: 5,
  situational: 4,
};
const fieldLabels = new Map([
  ["Пререквизит", "prerequisite"],
  ["Тип", "type"],
  ["Пул", "pool"],
  ["Дистанция", "distance"],
  ["Эффект", "effect"],
  ["Прорыв", "breakthrough"],
  ["Осложнения", "complications"],
  ["Осложнение", "complications"],
  ["Контроль", "control"],
]);

function slug(value) {
  const transliteration = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
    ы: "y", э: "e", ю: "yu", я: "ya", ь: "", ъ: "",
  };
  return String(value || "")
    .toLowerCase()
    .split("")
    .map((character) => transliteration[character] ?? character)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanLine(value) {
  return String(value || "").replace(/^\s+|\s+$/g, "").replace(/\s+/g, " ");
}

function categoryFromType(type) {
  const normalized = cleanLine(type).toLowerCase();
  if (normalized.startsWith("ультиматив")) return "ultimate";
  if (normalized.startsWith("любимый приём")) return "favorite";
  if (normalized.startsWith("обычное дело")) return "common";
  if (normalized.startsWith("ситуативная способность")) return "situational";
  return "";
}

const source = await readFile(sourcePath, "utf8");
const target = await readFile(targetPath, "utf8");
const jsonStart = target.indexOf("const abilityData = ") + "const abilityData = ".length;
const jsonEnd = target.lastIndexOf(";", target.lastIndexOf("</script>"));
const currentAbilities = JSON.parse(target.slice(jsonStart, jsonEnd));
let committedAbilities = [];
try {
  const committed = execFileSync(
    "git",
    ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "show", "HEAD:apps-script-source/AbilitiesData.html"],
    { cwd: root, encoding: "utf8" },
  );
  const start = committed.indexOf("const abilityData = ") + "const abilityData = ".length;
  const end = committed.lastIndexOf(";", committed.lastIndexOf("</script>"));
  committedAbilities = JSON.parse(committed.slice(start, end));
} catch {
  // Новый репозиторий может не иметь зафиксированной версии файла.
}
const currentIds = new Map();
for (const ability of [...committedAbilities, ...currentAbilities]) {
  currentIds.set(`${ability.className}\u0000${ability.name}`, ability.id);
}

const lines = source.split(/\r?\n/).map(cleanLine);
const abilitiesStart = lines.findIndex((line) => line === "Способности классов");
if (abilitiesStart < 0) throw new Error("Раздел «Способности классов» не найден.");
const abilitiesEndCandidate = lines.findIndex(
  (line, index) => index > abilitiesStart && /^8\.\s+Описание снаряжения/.test(line),
);
const abilitiesEnd = abilitiesEndCandidate < 0 ? lines.length : abilitiesEndCandidate;

const typeIndexes = [];
for (let index = abilitiesStart; index < abilitiesEnd; index += 1) {
  if (lines[index].startsWith("Тип:")) typeIndexes.push(index);
}

const abilities = [];
for (let typePosition = 0; typePosition < typeIndexes.length; typePosition += 1) {
  const typeIndex = typeIndexes[typePosition];
  let nameIndex = typeIndex - 1;
  while (nameIndex > abilitiesStart && !lines[nameIndex]) nameIndex -= 1;
  while (nameIndex > abilitiesStart && /^Пререквизит:/.test(lines[nameIndex])) {
    nameIndex -= 1;
    while (nameIndex > abilitiesStart && !lines[nameIndex]) nameIndex -= 1;
  }
  const name = lines[nameIndex];

  let className = "";
  let category = "";
  for (let cursor = nameIndex - 1; cursor >= abilitiesStart; cursor -= 1) {
    if (!category && categories.has(lines[cursor])) category = categories.get(lines[cursor]);
    if (classes.includes(lines[cursor])) {
      className = lines[cursor];
      break;
    }
  }
  if (!className || !category) continue;

  let nextNameIndex = abilitiesEnd;
  if (typePosition + 1 < typeIndexes.length) {
    nextNameIndex = typeIndexes[typePosition + 1] - 1;
    while (nextNameIndex > typeIndex && !lines[nextNameIndex]) nextNameIndex -= 1;
  }

  const fields = {};
  let activeField = "";
  for (let cursor = nameIndex + 1; cursor < nextNameIndex; cursor += 1) {
    const line = lines[cursor];
    if (!line) continue;
    const match = line.match(/^([^:]+):\s*(.*)$/);
    const mappedField = match ? fieldLabels.get(match[1]) : null;
    if (mappedField) {
      activeField = mappedField;
      fields[activeField] = cleanLine(match[2]);
      if (mappedField === "control") break;
    } else if (activeField && !categories.has(line) && !classes.includes(line) && line !== "________________") {
      fields[activeField] = cleanLine(`${fields[activeField]} ${line}`);
    }
  }

  const type = fields.type || "";
  category = categoryFromType(type) || category;
  const chargesMatch = type.match(/\((\d+)\)/);
  const effect = fields.effect || "";
  const reactionMatch = effect.match(/^Реакция\s+(до|после)\s+броска\./i);
  abilities.push({
    id: currentIds.get(`${className}\u0000${name}`) || `${slug(className)}-${slug(name)}`,
    className,
    category,
    name,
    type,
    pool: fields.pool || "",
    ...(fields.distance ? { distance: fields.distance } : {}),
    effect,
    breakthrough: fields.breakthrough || "",
    complications: fields.complications || "",
    control: fields.control || "не требуется",
    prerequisite: fields.prerequisite || "Нет",
    ...(chargesMatch ? { charges: Number(chargesMatch[1]) } : {}),
    ...(reactionMatch ? { reaction: reactionMatch[1].toLowerCase() } : {}),
  });
}

if (!abilities.some((ability) => ability.className === "Рекрут" && ability.name === "На изготовку")) {
  const firstRecruitCommon = abilities.findIndex(
    (ability) => ability.className === "Рекрут" && ability.category === "common",
  );
  const ability = {
    id: currentIds.get("Рекрут\u0000На изготовку") || "rekrut-na-izgotovku",
    className: "Рекрут",
    category: "favorite",
    name: "На изготовку",
    type: "Любимый приём (2)",
    pool: "не требуется",
    effect: "Можно повысить свой ПЗ на 1 до конца раунда. Не является Реакцией или Действием и применяется в момент определения ПЗ.",
    breakthrough: "",
    complications: "",
    control: "нет",
    prerequisite: "Нет",
    charges: 2,
  };
  abilities.splice(firstRecruitCommon < 0 ? abilities.length : firstRecruitCommon, 0, ability);
}

const counts = {};
for (const ability of abilities) {
  counts[ability.className] ||= { ultimate: 0, favorite: 0, common: 0, situational: 0 };
  counts[ability.className][ability.category] += 1;
}
for (const className of classes) {
  for (const [category, expectedCount] of Object.entries(expectedCategoryCounts)) {
    if (counts[className]?.[category] !== expectedCount) {
      throw new Error(`${className}/${category}: ожидалось ${expectedCount}, найдено ${counts[className]?.[category] || 0}`);
    }
  }
}

const labels = {
  ultimate: "Ультимативные",
  favorite: "Любимые приёмы",
  common: "Обычные дела",
  situational: "Ситуативные способности",
};
const output = `<script>\n  const abilityCategoryLabels = ${JSON.stringify(labels, null, 2)};\n  const abilityData = ${JSON.stringify(abilities, null, 2)};\n</script>\n`;
await writeFile(targetPath, output, "utf8");
console.log(`Синхронизировано способностей: ${abilities.length}`);
console.log(JSON.stringify(counts, null, 2));
