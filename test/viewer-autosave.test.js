import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const autosaveSource = await readFile(
  new URL("../src/client/viewer-autosave.js", import.meta.url),
  "utf8",
);

function createViewerContext() {
  const stored = new Map();
  const cloudCalls = [];
  const intervals = [];
  const context = vm.createContext({
    console,
    Date,
    JSON,
    Map,
    setTimeout,
  });

  vm.runInContext(
    `
      globalThis.window = globalThis;
      globalThis.localStorage = {
        getItem(key) { return stored.has(key) ? stored.get(key) : null; },
        setItem(key, value) { stored.set(key, value); },
        removeItem(key) { stored.delete(key); }
      };
      window.setInterval = callback => intervals.push(callback);
      window.addEventListener = () => {};

      let viewerState = {
        currentBody: 8,
        currentArmor: 2,
        maxArmor: 3,
        currentMainNerve: 4,
        currentBonusNerve: 1,
        money: { gold: 5, farthings: 2, pekkels: 0 },
        notes: ""
      };
      let viewerStateCharacterId = "character-1";
      let viewerStateDirty = false;
      let currentCharacterId = "character-1";

      function markViewerStateUnsaved() {
        viewerStateDirty = true;
      }
      function setViewerStateFromCharacter(character) {
        viewerStateCharacterId = character.id;
        viewerState = character.state;
        viewerStateDirty = false;
      }
      function ensureViewerState() {
        return viewerState;
      }
      function updateViewerSaveStatus() {}
      function updateViewerArmorInputs() {}

      globalThis.google = {
        script: {
          run: {
            withSuccessHandler(handler) {
              this.successHandler = handler;
              return this;
            },
            withFailureHandler(handler) {
              this.failureHandler = handler;
              return this;
            },
            saveCharacterState(characterId, state) {
              cloudCalls.push({ characterId, state });
              this.successHandler({ state });
            }
          }
        }
      };

      globalThis.inspectViewer = () => ({
        state: JSON.parse(JSON.stringify(viewerState)),
        dirty: viewerStateDirty
      });
    `,
    context,
  );

  context.stored = stored;
  context.cloudCalls = cloudCalls;
  context.intervals = intervals;
  vm.runInContext(autosaveSource, context);
  return context;
}

test("изменение состояния сначала сохраняется локально", () => {
  const context = createViewerContext();

  vm.runInContext("markViewerStateUnsaved()", context);

  assert.equal(context.cloudCalls.length, 0);
  assert.equal(context.stored.size, 1);
  const local = JSON.parse([...context.stored.values()][0]);
  assert.equal(local.characterId, "character-1");
  assert.equal(local.state.currentBody, 8);
  assert.equal(context.inspectViewer().dirty, true);
});

test("пятиминутный checkpoint отправляет только изменённое состояние", () => {
  const context = createViewerContext();
  assert.equal(context.intervals.length, 1);

  context.intervals[0]();
  assert.equal(context.cloudCalls.length, 0);

  vm.runInContext("markViewerStateUnsaved()", context);
  context.intervals[0]();

  assert.equal(context.cloudCalls.length, 1);
  assert.equal(context.cloudCalls[0].characterId, "character-1");
  assert.equal(context.inspectViewer().dirty, false);
  assert.equal(context.stored.size, 0);
});

