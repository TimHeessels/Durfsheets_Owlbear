import test from "node:test";
import assert from "node:assert/strict";
import {
  SYNC_ENABLED_KEY, GetStatusMarkers, getTokenGeometry, getTokenGrid, isActiveSyncer,
  isSceneSyncEnabled, isValidPartyID, mapEnemies, mapPlayers,
} from "../owlbeartest/shared.js";

test("metadata keys stay compatible with existing tokens", () => {
  assert.equal(SYNC_ENABLED_KEY, "com.th.enemies/syncEnabled");
});

test("isValidPartyID rejects characters Firebase paths can't use", () => {
  assert.equal(isValidPartyID("-Nabc_123"), true);
  for (const id of ["", "a.b", "a#b", "a$b", "a[b", "a]b", "a/b"]) {
    assert.equal(isValidPartyID(id), false, id);
  }
});

test("scene sync is on unless explicitly turned off", () => {
  assert.equal(isSceneSyncEnabled({}), true);
  assert.equal(isSceneSyncEnabled({ [SYNC_ENABLED_KEY]: true }), true);
  assert.equal(isSceneSyncEnabled({ [SYNC_ENABLED_KEY]: false }), false);
});

test("isActiveSyncer picks the lowest GM connection", () => {
  const gm = (connectionId) => ({ connectionId, role: "GM" });
  const player = (connectionId) => ({ connectionId, role: "PLAYER" });

  assert.equal(isActiveSyncer("b", []), true);
  assert.equal(isActiveSyncer("b", [player("a")]), true);
  assert.equal(isActiveSyncer("b", [gm("c")]), true);
  assert.equal(isActiveSyncer("b", [gm("a")]), false);
  // Must also work if the list includes this client
  assert.equal(isActiveSyncer("b", [gm("b"), gm("c")]), true);
  assert.equal(isActiveSyncer("b", [gm("b"), gm("a")]), false);
});

test("mapPlayers skips storage characters and adds up light dice", () => {
  const players = mapPlayers({
    a: { CharacterName: "Ann", Wounds: 2, DepletableLightDiceActive: 1, PermanentLightDiceActive: 2 },
    b: { CharacterName: "Chest", characterType: "Storage" },
    c: null,
  });

  assert.equal(players.length, 1);
  assert.equal(players[0].light, 3);
  assert.equal(players[0].url, null);
  assert.deepEqual(mapPlayers(null), []);
});

test("missing names don't show as undefined", () => {
  assert.equal(mapPlayers({ a: {} })[0].text, "Unnamed character");
  assert.equal(mapEnemies({ a: {} })[0].text, "Unnamed enemy");
  assert.equal(mapEnemies({ a: { EnemyName: "Rat", EnemyNumber: 0 } })[0].text, "[0] Rat");
});

test("mapEnemies keeps hidden enemies and hides by default", () => {
  const enemies = mapEnemies({
    a: { EnemyName: "Rat", VisibleToPlayer: true },
    b: { EnemyName: "Spy" },
  });

  assert.equal(enemies[0].hidden, false);
  assert.equal(enemies[1].hidden, true);
});

test("GetStatusMarkers shows state, wounds, light and damage", () => {
  assert.deepEqual(GetStatusMarkers({ state: "Dead", wounds: 2, type: "player" }), [
    { kind: "overlay" }, { kind: "dead", text: "💀" },
  ]);
  assert.deepEqual(GetStatusMarkers({ state: "Dead", damage: 3, type: "enemy" }), [
    { kind: "overlay" }, { kind: "dead", text: "💀" },
  ]);
  assert.deepEqual(GetStatusMarkers({ state: "Away", type: "player" }), [
    { kind: "overlay" }, { kind: "away", text: "💤" },
  ]);
  assert.deepEqual(GetStatusMarkers({ state: "Active", damage: 0, type: "enemy" }), [
    { kind: "damage", text: "💥 0" },
  ]);
  assert.deepEqual(GetStatusMarkers({ wounds: 0, light: 0, type: "player" }), []);
  assert.deepEqual(GetStatusMarkers({ wounds: 2, light: 1, type: "player" }), [
    { kind: "wounds", text: "🩸 2" }, { kind: "light", text: "☀️ 1" },
  ]);
});

test("getTokenGeometry finds the art's centre from the token offset", () => {
  const token = {
    position: { x: 100, y: 100 },
    scale: { x: 1, y: 1 },
    image: { width: 512, height: 512 },
    grid: getTokenGrid(512, 512),
  };

  // 150 DPI scene: the 512px image is one 150px cell, offset 24px below its centre
  const { center, size } = getTokenGeometry(token, 150);
  assert.equal(size, 150);
  assert.equal(center.x, 100);
  assert.equal(center.y, 100 - 24 * (150 / 512));
});

test("getTokenGeometry follows token scale and non-square art", () => {
  const token = {
    position: { x: 0, y: 0 },
    scale: { x: 2, y: 2 },
    image: { width: 1000, height: 500 },
    grid: getTokenGrid(1000, 500),
  };

  assert.equal(getTokenGeometry(token, 150).size, 300);
  // A flipped token keeps its size
  assert.equal(getTokenGeometry({ ...token, scale: { x: -2, y: 2 } }, 150).size, 300);
});

test("getTokenGrid matches the original 512px token", () => {
  assert.deepEqual(getTokenGrid(512, 512), { dpi: 512, offset: { x: 256, y: 280 } });
});

test("getTokenGrid fits the longest side in one cell", () => {
  assert.equal(getTokenGrid(1000, 500).dpi, 1000);
  assert.equal(getTokenGrid(500, 1000).dpi, 1000);
  assert.equal(getTokenGrid(1000, 500).offset.x, 500);
});
