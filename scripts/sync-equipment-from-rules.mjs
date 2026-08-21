import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = process.argv[2] || path.join(root, ".tmp-rules-current.txt");
const targetPath = path.join(root, "apps-script-source", "EquipmentData.html");

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function slug(value) {
  const transliteration = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
    ы: "y", э: "e", ю: "yu", я: "ya", ь: "", ъ: "",
  };
  return clean(value).toLowerCase().split("").map((letter) => transliteration[letter] ?? letter)
    .join("").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function numberFrom(value) {
  const match = clean(value).match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function tagsFrom(value) {
  const text = clean(value);
  return !text || text === "—" ? [] : text.split(/,\s*/).map(clean).filter(Boolean);
}

function section(lines, startName, endName) {
  const start = lines.indexOf(startName);
  const end = lines.indexOf(endName, start + 1);
  if (start < 0 || end < 0) throw new Error(`Не найден раздел ${startName} → ${endName}`);
  return lines.slice(start + 1, end);
}

function namedRows(lines, names) {
  return names.map((name, index) => {
    const start = lines.indexOf(name);
    const end = index + 1 < names.length ? lines.indexOf(names[index + 1], start + 1) : lines.length;
    if (start < 0 || end < 0) throw new Error(`Не найдена строка снаряжения: ${name}`);
    return [name, ...lines.slice(start + 1, end)];
  });
}

const source = await readFile(sourcePath, "utf8");
const target = await readFile(targetPath, "utf8");
const jsonStart = target.indexOf("const equipmentData = ") + "const equipmentData = ".length;
const jsonEnd = target.indexOf(";", jsonStart);
const currentItems = JSON.parse(target.slice(jsonStart, jsonEnd));
const recommendationsStart = target.indexOf("const classRecommendedEquipment = ");
const recommendationsJsonStart = recommendationsStart + "const classRecommendedEquipment = ".length;
const recommendationsJsonEnd = target.indexOf(";", recommendationsJsonStart);
const recommendations = JSON.parse(target.slice(recommendationsJsonStart, recommendationsJsonEnd));
const ids = new Map(currentItems.map((item) => [item.name, item.id]));
const currentByName = new Map(currentItems.map((item) => [item.name, item]));
const lines = source.split(/\r?\n/).map(clean).filter(Boolean);

function identity(name) {
  return ids.get(name) || slug(name);
}

const armorNames = [
  "Плотная одежда", "Рабочая куртка", "Полевой жилет", "Городское пальто с подкладкой", "Лёгкая броня",
  "Латунный рабочий жилет", "Лёгкая полевая броня", "Кираса", "Тяжёлая броня", "Экспериментальная броня",
];
const meleeNames = [
  "Нож / складной нож", "Дубинка / тяжёлая трость", "Утяжелённая перчатка", "Сабля / шпага", "Топорик / тесак", "Гаечный ключ / малый молоток",
  "Сапёрная лопатка", "Искровой резак", "Тяжёлый меч", "Булава", "Боевой молот", "Химический распылитель",
];
const thrownNames = [
  "Камень / бутылка / подручный предмет", "Метательный дротик", "Метательный нож", "Метательный топорик", "Джавелин / короткое метательное копьё", "Тяжёлый гарпун",
];
const rangedNames = [
  "Пистоль", "Дуэльный пистоль", "Короткий револьвер ранней конструкции", "Мушкет", "Карабин", "Охотничье ружьё", "Механический арбалет", "Дротиковая трубка", "Пружинный гвоздомёт",
];
const specialNames = [
  "Пиротехнический пистоль", "Нож-капельник", "Трость с кристаллическим навершием", "Перчатка синего поля", "Красный резонансный монокль", "Красный резонансный кулон", "Малый синий кристалл настройки",
];
const kitNames = [
  "Малый набор инструментов", "Большой набор инструментов", "Набор отмычек", "Оружейный набор", "Письменный набор", "Дорожная канцелярия", "Набор печатей", "Полевая аптечка", "Хирургический набор", "Химический футляр", "Ювелирный набор", "Полевой исследовательский набор",
];
const auxiliaryNames = [
  "Верёвка 15 м", "Набор пайков", "Крюк", "Фонарь масляный", "Масло для фонаря", "Компас", "Палатка", "Одеяло", "Спички", "Маска-фильтр", "Сменный фильтр", "Защитные очки", "Простые карманные часы", "Дорогие часы", "Кристаллическая линза", "Митриновая пластина малая", "Пентаплазма",
];
const consumableNames = [
  "Кислотная склянка", "Слабый яд", "Слабый антидот", "Успокоительные капли", "Сомнол", "Аргентол", "Дермопластическая мазь №7 («Семёрка»)", "Фибринат", "Кристаллод", "Митриновый раневой коллодий", "Хвитлэк", "Фарналит", "Серебрянка",
];

const items = [];
const armorRows = namedRows(section(lines, "Броня", "Ближнее оружие"), armorNames);
for (const [name, armor, priceText, maintenanceText, tagsText] of armorRows) {
  items.push({ id: identity(name), name, category: "Броня", price: numberFrom(priceText), priceText, armor: numberFrom(armor), maintenance: numberFrom(maintenanceText), tags: tagsFrom(tagsText) });
}

const meleeRows = namedRows(section(lines, "Ближнее оружие", "Метательное оружие"), meleeNames);
for (const row of meleeRows) {
  const [name, priceText, ...values] = row;
  const chemical = name === "Химический распылитель";
  if (chemical && values[0].endsWith("+")) values.splice(0, 2, `${values[0]} ${values[1]}`);
  const [pool, rangeOrDamage, damageOrExploitation, exploitationOrMaintenance, maintenanceOrTags, maybeTags] = values;
  items.push({
    id: identity(name), name, category: "Ближнее оружие", price: numberFrom(priceText), priceText,
    pool, ...(chemical ? { range: rangeOrDamage } : {}), damage: chemical ? damageOrExploitation : rangeOrDamage,
    exploitation: numberFrom(chemical ? exploitationOrMaintenance : damageOrExploitation),
    maintenance: numberFrom(chemical ? maintenanceOrTags : exploitationOrMaintenance),
    tags: tagsFrom(chemical ? maybeTags : maintenanceOrTags),
  });
}

const thrownRows = namedRows(section(lines, "Метательное оружие", "Дальнее и огнестрельное оружие"), thrownNames);
for (const [name, priceText, pool, range, damage, exploitation, maintenanceText, tagsText] of thrownRows) {
  items.push({ id: identity(name), name, category: "Метательное оружие", price: numberFrom(priceText), priceText, pool, range, damage, exploitation: numberFrom(exploitation), maintenance: numberFrom(maintenanceText), tags: tagsFrom(tagsText) });
}

const rangedRows = namedRows(section(lines, "Дальнее и огнестрельное оружие", "Специальное оружие и устройства"), rangedNames);
for (const [name, priceText, pool, range, damage, exploitation, maintenanceText, tagsText] of rangedRows) {
  items.push({ id: identity(name), name, category: "Дальнее оружие", price: numberFrom(priceText), priceText, pool, range, damage, exploitation: numberFrom(exploitation), maintenance: numberFrom(maintenanceText), tags: tagsFrom(tagsText) });
}

const specialRows = namedRows(section(lines, "Специальное оружие и устройства", "Фурма"), specialNames);
for (const [name, priceText, pool, damage, exploitation, maintenanceText, tagsText] of specialRows) {
  items.push({ id: identity(name), name, category: "Специальное оружие", price: numberFrom(priceText), priceText, pool, damage, exploitation: numberFrom(exploitation), maintenance: numberFrom(maintenanceText), tags: tagsFrom(tagsText) });
}
items.push({
  id: identity("Фурма"), name: "Фурма", category: "Дальнее оружие", price: 1200, priceText: "1200 ф",
  pool: "Нюх + Стрельба", range: "средняя", damage: "d4+1 — d12", exploitation: "2–6", maintenance: 0,
  purpose: "Тяжёлое паровое оружие с пятью режимами давления: проверочный, низкий, рабочий, высокий и форсированный.", tags: ["Пар", "тяжёлое"],
});

const kitRows = namedRows(section(lines, "Профессиональные наборы", "Вспомогательные предметы"), kitNames);
for (const [name, priceText, purpose, maintenanceText] of kitRows) {
  const preservedPurpose = name === "Полевая аптечка"
    ? "Состав: раневой коллодий, «Семёрка», несколько (3) доз Сомнола, перевязочный материал и набор слабых антидотов."
    : purpose;
  items.push({ id: identity(name), name, category: "Набор", price: numberFrom(priceText), priceText, purpose: preservedPurpose, maintenance: numberFrom(maintenanceText), tags: [] });
}

const auxiliaryRows = namedRows(section(lines, "Вспомогательные предметы", "Расходники"), auxiliaryNames);
for (const [name, priceText, purpose] of auxiliaryRows) {
  items.push({ id: identity(name), name, category: "Вспомогательное", price: numberFrom(priceText), priceText, purpose, maintenance: 0, tags: [] });
}

const consumableRows = namedRows(section(lines, "Расходники", "Ремонт и разовое восстановление"), consumableNames);
for (const [name, priceText, purpose] of consumableRows) {
  if (["Хвитлэк", "Фарналит"].includes(name)) continue;
  items.push({ id: identity(name), name, category: "Расходник", price: numberFrom(priceText), priceText, purpose, maintenance: 0, tags: [] });
}

for (const name of ["Чистый спирт (1 л)", "Атронская горечь (нефильт.) шот"]) {
  const item = currentByName.get(name);
  if (item) items.push(item);
}

const existingIds = new Set(items.map((item) => item.id));
for (const className of Object.keys(recommendations)) {
  recommendations[className] = recommendations[className].filter((id) => existingIds.has(id));
}

const output = `<script>\n  const equipmentData = ${JSON.stringify(items, null, 2)};\n\n  const classRecommendedEquipment = ${JSON.stringify(recommendations, null, 2)};\n\n  const universallyRecommendedEquipment = [\n    "somnol",\n    "argentol",\n    "fibrinat",\n    "mitrinovyy-ranevoy-kollodiy"\n  ];\n\n  Object.values(classRecommendedEquipment).forEach(function(recommended) {\n    universallyRecommendedEquipment.forEach(function(equipmentId) {\n      if (!recommended.includes(equipmentId)) recommended.push(equipmentId);\n    });\n  });\n</script>\n`;
await writeFile(targetPath, output, "utf8");
console.log(`Синхронизировано предметов: ${items.length}`);
console.log(`Метательное оружие: ${items.filter((item) => item.category === "Метательное оружие").length}`);
