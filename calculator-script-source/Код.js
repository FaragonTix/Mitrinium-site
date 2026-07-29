const SAVE_PREFIX = 'MITRINIUM_ENCOUNTER_V5_';
const CHUNK_SIZE = 2500;
const MAX_PAYLOAD_CHARS = 400000;

const ENEMY_DATABASE_ID = '1qnVME9QoqHqEUIKclEFA5HFURleFk1qcM8SwtcsqK9w';
const ENEMY_SHEET_NAME = 'Enemies';
/* roleKey сохранён ради совместимости; это тег: boss, chief или minion. */
const ENEMY_HEADERS = [
  'id','name','typeKey','classKey','roleKey','level','bp','difficultyKey',
  'hp','nerve','armor','pz','pool','speed','reactionLimit','durability',
  'attacksJson','reactionsJson','propertiesJson','notes','createdAt','updatedAt',
  'physicalDefensePool','mentalDefensePool'
];

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Митриниум — конструктор боёв')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function saveEncounter(payload) {
  if (typeof payload !== 'string') throw new Error('Ожидалась строка JSON.');
  if (payload.length > MAX_PAYLOAD_CHARS) throw new Error('Состояние боя слишком велико.');
  JSON.parse(payload);
  const props = PropertiesService.getUserProperties();
  clearSavedEncounter_(props);
  const values = {};
  let chunks = 0;
  for (let offset = 0; offset < payload.length; offset += CHUNK_SIZE) {
    values[SAVE_PREFIX + 'PART_' + chunks] = payload.slice(offset, offset + CHUNK_SIZE);
    chunks += 1;
  }
  const savedAt = new Date().toISOString();
  values[SAVE_PREFIX + 'META'] = JSON.stringify({chunks,savedAt,version:7});
  props.setProperties(values,false);
  return {ok:true,savedAt,chunks};
}

function loadEncounter() {
  const props = PropertiesService.getUserProperties();
  const metaRaw = props.getProperty(SAVE_PREFIX + 'META');
  if (!metaRaw) return {found:false,payload:null,savedAt:null};
  const meta = JSON.parse(metaRaw);
  const parts = [];
  for (let index = 0; index < Number(meta.chunks || 0); index += 1) {
    const part = props.getProperty(SAVE_PREFIX + 'PART_' + index);
    if (part === null) throw new Error('Сохранение повреждено: отсутствует часть ' + (index + 1) + '.');
    parts.push(part);
  }
  const payload = parts.join('');
  JSON.parse(payload);
  return {found:true,payload,savedAt:meta.savedAt || null};
}

function clearEncounter() {
  clearSavedEncounter_(PropertiesService.getUserProperties());
  return {ok:true};
}

function clearSavedEncounter_(props) {
  const metaRaw = props.getProperty(SAVE_PREFIX + 'META');
  if (metaRaw) {
    try {
      const meta = JSON.parse(metaRaw);
      for (let index = 0; index < Number(meta.chunks || 0); index += 1) props.deleteProperty(SAVE_PREFIX + 'PART_' + index);
    } catch (error) {
      for (let index = 0; index < 200; index += 1) props.deleteProperty(SAVE_PREFIX + 'PART_' + index);
    }
  }
  props.deleteProperty(SAVE_PREFIX + 'META');
}

function getEnemyLibrary() {
  const sheet = getEnemySheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2,1,lastRow - 1,ENEMY_HEADERS.length).getValues()
    .filter(row => String(row[0] || '').trim())
    .map(rowToEnemy_)
    .sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || a.name.localeCompare(b.name,'ru'));
}

function saveEnemyTemplate(enemy) {
  const normalized = normalizeEnemyTemplate_(enemy);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('База противников занята. Повторите сохранение через несколько секунд.');
  try {
    const sheet = getEnemySheet_();
    const now = new Date().toISOString();
    const lastRow = sheet.getLastRow();
    let rowNumber = 0;
    let createdAt = normalized.createdAt || now;
    if (lastRow >= 2) {
      const ids = sheet.getRange(2,1,lastRow - 1,1).getDisplayValues().flat();
      const foundIndex = ids.findIndex(id => id === normalized.id);
      if (foundIndex >= 0) {
        rowNumber = foundIndex + 2;
        createdAt = sheet.getRange(rowNumber,ENEMY_HEADERS.indexOf('createdAt') + 1).getDisplayValue() || createdAt;
      }
    }
    const saved = {...normalized,createdAt,updatedAt:now};
    const row = enemyToRow_(saved);
    if (rowNumber) sheet.getRange(rowNumber,1,1,ENEMY_HEADERS.length).setValues([row]);
    else sheet.appendRow(row);
    SpreadsheetApp.flush();
    return saved;
  } finally {
    lock.releaseLock();
  }
}

function deleteEnemyTemplate(id) {
  const safeId = String(id || '').trim();
  if (!safeId) throw new Error('Не передан идентификатор противника.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('База противников занята.');
  try {
    const sheet = getEnemySheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return {ok:true,deleted:false};
    const ids = sheet.getRange(2,1,lastRow - 1,1).getDisplayValues().flat();
    const index = ids.findIndex(value => value === safeId);
    if (index < 0) return {ok:true,deleted:false};
    sheet.deleteRow(index + 2);
    SpreadsheetApp.flush();
    return {ok:true,deleted:true};
  } finally {
    lock.releaseLock();
  }
}

function getEnemySheet_() {
  const spreadsheet = SpreadsheetApp.openById(ENEMY_DATABASE_ID);
  let sheet = spreadsheet.getSheetByName(ENEMY_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(ENEMY_SHEET_NAME);
  const range = sheet.getRange(1,1,1,ENEMY_HEADERS.length);
  const current = range.getDisplayValues()[0];
  const mismatch = ENEMY_HEADERS.some((header,index) => current[index] !== header);
  if (mismatch) {
    range.setValues([ENEMY_HEADERS]);
    range.setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1,ENEMY_HEADERS.length);
  }
  return sheet;
}

function normalizeTagKey_(value) {
  const key = String(value || '').toLowerCase();
  if (['boss','chief','minion'].includes(key)) return key;
  if (['support'].includes(key)) return 'minion';
  if (['leader','standalone','skirmisher','brute','shooter','controller'].includes(key)) return 'chief';
  return 'chief';
}

function normalizeEnemyTemplate_(enemy) {
  if (!enemy || typeof enemy !== 'object') throw new Error('Статблок не передан.');
  const allowedTypes = ['humanoid','mechanism','animal','beast','undead'];
  const typeKey = allowedTypes.includes(enemy.typeKey) ? enemy.typeKey : 'humanoid';
  const name = cleanText_(enemy.name,120);
  if (!name) throw new Error('Укажите название противника.');
  const id = cleanText_(enemy.id,100) || Utilities.getUuid();
  const tagKey = normalizeTagKey_(enemy.tagKey || enemy.roleKey);
  const attacks = normalizeAttacks_(enemy.attacks,typeKey);
  const reactions = normalizeReactions_(enemy.reactions);
  const properties = Array.isArray(enemy.properties) ? enemy.properties.map(item => cleanText_(item,500)).filter(Boolean).slice(0,30) : [];
  const maxDurability = typeKey === 'humanoid' ? Math.max.apply(null,[0].concat(attacks.map(attack => attack.maxDurability || 0))) : 0;
  return {
    id,name,typeKey,
    classKey:cleanText_(enemy.classKey,40) || 'none',
    tagKey,roleKey:tagKey,
    level:clampNumber_(enemy.level,1,20,1),
    bp:clampNumber_(enemy.bp,20,5000,1000),
    difficultyKey:cleanText_(enemy.difficultyKey,20) || 'medium',
    hp:clampNumber_(enemy.hp,1,999,10),
    nerve:clampNumber_(enemy.nerve,0,999,0),
    armor:clampNumber_(enemy.armor,0,8,0),
    pz:clampNumber_(enemy.pz,3,10,4),
    physicalDefensePool:clampNumber_(enemy.physicalDefensePool,1,8,attacks[0].pool),
    mentalDefensePool:clampNumber_(enemy.mentalDefensePool,1,8,attacks[0].pool),
    pool:attacks[0].pool,
    speed:clampNumber_(enemy.speed,0,8,3),
    reactionLimit:clampNumber_(enemy.reactionLimit,0,4,1),
    durability:maxDurability,
    attacks,reactions,properties,
    notes:cleanText_(enemy.notes,5000),
    createdAt:cleanText_(enemy.createdAt,80),
    updatedAt:cleanText_(enemy.updatedAt,80)
  };
}

function isTechnicalWeaponName_(name) {
  return /(?:^|\s)(?:пистол(?:ь|ет|и|й)?|карабин(?:ы|а|ом|у)?)(?:$|\s|[.,;:()—-])/i.test(' ' + String(name || '').trim() + ' ');
}

function normalizeAttacks_(value,typeKey) {
  const source = Array.isArray(value) ? value : [];
  const count = Math.max(2,Math.min(5,source.length || 2));
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const raw = source[index] || {},poolMatch = String(raw.pool == null ? '' : raw.pool).match(/(\d+)\s*d6/i),pool = clampNumber_(poolMatch ? poolMatch[1] : raw.pool,1,8,index === 0 ? 4 : 3),technical = typeKey === 'humanoid' && (Boolean(raw.technical) || isTechnicalWeaponName_(raw.name)),uses=clampNumber_(raw.uses,0,99,0);
    result.push({templateId:cleanText_(raw.templateId,120),name:cleanText_(raw.name,160)||(index===0?'Основная атака':'Атака '+(index+1)),category:cleanText_(raw.category||raw.type,160)||'Обычная',pool,damage:normalizeDamage_(raw.damage,index===0?'d6':'d4'),range:cleanText_(raw.range,120)||(index===0?'Средняя':'Ближняя'),penetrating:Boolean(raw.penetrating||raw.piercing),text:cleanText_(raw.text||raw.effect,2500),restriction:cleanText_(raw.restriction,1200),uses,technical,controlBonus:technical?clampNumber_(raw.controlBonus,2,7,2):0,maxDurability:technical?clampNumber_(raw.maxDurability||raw.durability,2,99,2):0});
  }
  return result;
}

function normalizeDamage_(value,fallback) {
  const text = cleanText_(value,40).replace(/\s+/g,'');
  return /^(\d*)d\d+([+-]\d+)?$/i.test(text) ? text : fallback;
}

function normalizeReactions_(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0,5).map(item => {const trigger=cleanText_(item&&item.trigger,1200),effect=cleanText_(item&&(item.effect||item.text),2500);return{templateId:cleanText_(item&&item.templateId,120),name:cleanText_(item&&item.name,200),trigger,effect,uses:clampNumber_(item&&item.uses,0,99,0),power:cleanText_(item&&item.power,40)||'simple',tags:Array.isArray(item&&item.tags)?item.tags.map(x=>cleanText_(x,60)).filter(Boolean).slice(0,12):[]};}).filter(item=>item.name);
}

function cleanText_(value,maxLength) {return String(value == null ? '' : value).trim().slice(0,maxLength);}
function clampNumber_(value,min,max,fallback) {const number = Number(value);if (!Number.isFinite(number)) return fallback;return Math.max(min,Math.min(max,Math.round(number)));}

function enemyToRow_(enemy) {
  const values = {...enemy,attacksJson:JSON.stringify(enemy.attacks || []),reactionsJson:JSON.stringify(enemy.reactions || []),propertiesJson:JSON.stringify(enemy.properties || [])};
  return ENEMY_HEADERS.map(header => values[header] == null ? '' : values[header]);
}

function rowToEnemy_(row) {
  const raw = {};
  ENEMY_HEADERS.forEach((header,index) => raw[header] = row[index]);
  const typeKey = String(raw.typeKey || 'humanoid');
  const tagKey = normalizeTagKey_(raw.roleKey);
  const attacks = normalizeAttacks_(safeParseJson_(raw.attacksJson,[]),typeKey);
  return {
    id:String(raw.id || ''),name:String(raw.name || ''),typeKey,
    classKey:String(raw.classKey || 'none'),tagKey,roleKey:tagKey,
    level:Number(raw.level || 1),bp:Number(raw.bp || 1000),difficultyKey:String(raw.difficultyKey || 'medium'),
    hp:Number(raw.hp || 1),nerve:Number(raw.nerve || 0),armor:Math.max(0,Math.min(8,Number(raw.armor || 0))),
    pz:Math.max(3,Math.min(10,Number(raw.pz || 4))),physicalDefensePool:Math.max(1,Math.min(8,Number(raw.physicalDefensePool || attacks[0].pool || 4))),mentalDefensePool:Math.max(1,Math.min(8,Number(raw.mentalDefensePool || attacks[0].pool || 4))),pool:attacks[0].pool,speed:Number(raw.speed || 3),
    reactionLimit:Number(raw.reactionLimit || 1),durability:typeKey === 'humanoid' ? Math.max(2,Number(raw.durability || 2)) : 0,
    attacks,reactions:normalizeReactions_(safeParseJson_(raw.reactionsJson,[])),properties:safeParseJson_(raw.propertiesJson,[]),
    notes:String(raw.notes || ''),
    createdAt:raw.createdAt instanceof Date ? raw.createdAt.toISOString() : String(raw.createdAt || ''),
    updatedAt:raw.updatedAt instanceof Date ? raw.updatedAt.toISOString() : String(raw.updatedAt || '')
  };
}

function safeParseJson_(value,fallback) {
  if (Array.isArray(value)) return value;
  try {const parsed = JSON.parse(String(value || ''));return Array.isArray(parsed) ? parsed : fallback;} catch (error) {return fallback;}
}
