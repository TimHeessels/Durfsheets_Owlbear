import test from "node:test";
import assert from "node:assert/strict";
import {
  SYNC_ENABLED_KEY, GetCharacterText, getTokenGrid, isActiveSyncer,
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

test("GetCharacterText shows state, wounds and damage", () => {
  assert.equal(GetCharacterText({ text: "Ann", state: "Dead", type: "player" }), "Ann💀");
  assert.equal(GetCharacterText({ text: "Ann", state: "Away", type: "player" }), "Ann (Away)");
  assert.equal(GetCharacterText({ text: "[1] Rat", state: "Active", damage: 3, type: "enemy" }), "[1] Rat 💥3");
  assert.equal(GetCharacterText({ text: "Ann", wounds: 0, light: 0, type: "player" }), "Ann");
  assert.equal(GetCharacterText({ text: "Ann", wounds: 2, light: 1, type: "player" }), "Ann 🩸 2 ☀️ 1");
});

test("getTokenGrid matches the original 512px token", () => {
  assert.deepEqual(getTokenGrid(512, 512), { dpi: 512, offset: { x: 256, y: 280 } });
});

test("getTokenGrid fits the longest side in one cell", () => {
  assert.equal(getTokenGrid(1000, 500).dpi, 1000);
  assert.equal(getTokenGrid(500, 1000).dpi, 1000);
  assert.equal(getTokenGrid(1000, 500).offset.x, 500);
});
