import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pdfMake from "pdfmake/build/pdfmake.js";
import pdfFonts from "pdfmake/build/vfs_fonts.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
pdfMake.vfs = pdfFonts;

const source = (await readFile(path.join(root, "apps-script-source", "CharacterPdfScripts.html"), "utf8"))
  .replace(/^\s*<script>\s*/, "")
  .replace(/\s*<\/script>\s*$/, "");

const attributes = {
  drive: { name: "Напор" }, wit: { name: "Сметка" },
  sense: { name: "Нюх" }, grit: { name: "Жила" }, gloss: { name: "Лоск" },
};
const skills = {
  drive: { items: { threats: { name: "Угрозы" }, fencing: { name: "Фехтование" } } },
  wit: { items: { deceit: { name: "Обман" }, mechanisms: { name: "Механизмы" } } },
};
const abilities = {
  guard: { name: "Механический перехват", prerequisite: "Кустарь", pool: "Сметка + Механизмы", effect: "Ассистент поглощает прямой физический урон.", breakthrough: "Ассистент не теряет прочность.", complications: "Механизм требует ремонта." },
};
const equipment = {
  coat: { name: "Полевой жилет", category: "Броня", armor: 2, price: 100, tags: ["карманы"] },
};
const normalizeCharacterControl = (value = {}) => value.methods ? value : { methods: value };
const getAbilityById = (id) => abilities[id];
const getEquipmentById = (id) => equipment[id];
const getEquipmentDetails = (item) => `Броня: ${item.armor} · Цена: ${item.price} ф`;
const factory = new Function(
  "attributes", "skills", "normalizeCharacterControl", "getAbilityById",
  "getEquipmentById", "getEquipmentDetails", "viewerState", "currentCharacterId",
  "currentCharacterIsComplete", "window", "document",
  `${source}; return buildCharacterPdfDefinition;`,
);
const build = factory(
  attributes, skills, normalizeCharacterControl, getAbilityById,
  getEquipmentById, getEquipmentDetails, {}, "sample", true, {}, {},
);
const character = {
  name: "Арманд Вельт", player: "Плейтестер", className: "Кустарь", level: 5,
  concept: "Полевой инженер и охотник за неисправными автоматонами.",
  resources: { body: 10, mainNerve: 7, bonusNerve: 2 },
  state: { currentBody: 8, currentArmor: 2, maxArmor: 2, currentMainNerve: 5, currentBonusNerve: 1, money: { gold: 1, farthings: 340, pekkels: 8 }, notes: "Проверить взаимодействие реакции с уроном по площади." },
  biography: { origin: { name: "Шеллоун", traitName: "Промышленные пути" }, past: { name: "Мастерская железной дороги" } },
  attributes: { drive: 2, wit: 3, sense: 1, grit: 2, gloss: 1 },
  skills: { drive: { threats: 1, fencing: 2 }, wit: { deceit: 1, mechanisms: 3 } },
  control: { methods: { "Порох": { level: 1, bonus: 0 }, "Пар": { level: 3, bonus: 3 }, "Кристаллы": { level: 2, bonus: 2 }, "Реагенты": { level: 1, bonus: 0 } } },
  abilities: ["guard"], equipment: ["coat"], equipmentMaintenance: 20,
};
const outputDir = path.join(root, "output", "pdf");
await mkdir(outputDir, { recursive: true });
const buffer = await new Promise((resolve) => pdfMake.createPdf(build(character)).getBuffer(resolve));
const output = path.join(outputDir, "character-sheet-template-sample.pdf");
await writeFile(output, buffer);
console.log(output);
