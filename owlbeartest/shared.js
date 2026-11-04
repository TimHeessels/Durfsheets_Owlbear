// Code shared by the popover (main.js) and the background page (background.js).
// Keep this file free of browser and OBR imports so it can run in the Node tests.

// Don't change: existing tokens store their metadata under this ID
export const PLUGIN_ID = "com.th.enemies";
export const PARTY_KEY = `${PLUGIN_ID}/partyID`;
export const CHAR_ID_KEY = `${PLUGIN_ID}/charID`;
export const DURF_KEY = `${PLUGIN_ID}/durfCharacter`;
export const HIDDEN_KEY = `${PLUGIN_ID}/hiddenBySync`;
export const SYNC_ENABLED_KEY = `${PLUGIN_ID}/syncEnabled`;
export const STATUS_KEY = `${PLUGIN_ID}/statusMarker`;

// Broadcast channels between the popover and the background page
export const STATUS_CHANNEL = `${PLUGIN_ID}/status`;
export const COMMAND_CHANNEL = `${PLUGIN_ID}/command`;
export const LOCAL_ONLY = { destination: "LOCAL" };

// Firebase paths can't contain these, and "/" would point at a different node
export function isValidPartyID(id) {
  return typeof id === "string" && id.length > 0 && !/[.#$[\]/]/.test(id);
}

// A missing value means enabled, so existing scenes keep syncing
export function isSceneSyncEnabled(sceneMetadata) {
  return sceneMetadata[SYNC_ENABLED_KEY] !== false;
}

// Only one GM client may sync: the one with the lowest connection ID.
// Works whether or not `players` includes this client.
export function isActiveSyncer(myConnectionId, players) {
  return players
    .filter((player) => player.role === "GM")
    .every((player) => player.connectionId >= myConnectionId);
}

export function mapPlayers(data) {
  return Object.entries(data || {})
    .filter(([_, charData]) => charData && charData.characterType !== "Storage")
    .map(([charID, charData]) => ({
      id: charID,
      url: charData.CharacterImageLink?.token?.url || null,
      text: charData.CharacterName || "Unnamed character",
      wounds: charData.Wounds || 0,
      light: (charData.DepletableLightDiceActive || 0) + (charData.PermanentLightDiceActive || 0),
      state: charData.characterState,
      characterType: charData.characterType,
      type: "player",
    }));
}

// Enemies hidden from players are kept so their tokens get hidden instead of deleted
export function mapEnemies(data) {
  return Object.entries(data || {})
    .filter(([_, charData]) => charData)
    .map(([charID, charData]) => {
      const hasNumber = charData.EnemyNumber !== undefined && charData.EnemyNumber !== null;
      return {
        id: charID,
        url: charData.CharacterImageLink?.token?.url || null,
        text: (hasNumber ? "[" + charData.EnemyNumber + "] " : "") + (charData.EnemyName || "Unnamed enemy"),
        damage: charData.Damage || 0,
        light: 0,
        state: charData.IsDead ? "Dead" : "Active",
        hidden: charData.VisibleToPlayer !== true,
        type: "enemy",
      };
    });
}

// The status markers a token should have: "overlay" is the dark circle, the rest are badges
export function GetStatusMarkers(master) {
  if (master.state == "Dead")
    return [{ kind: "overlay" }, { kind: "dead", text: "💀" }];
  if (master.state == "Away")
    return [{ kind: "overlay" }, { kind: "away", text: "💤" }];
  if (master.type == "enemy")
    return [{ kind: "damage", text: "💥 " + master.damage }];

  const markers = [];
  if (master.wounds > 0) markers.push({ kind: "wounds", text: "🩸 " + master.wounds });
  if (master.light > 0) markers.push({ kind: "light", text: "☀️ " + master.light });
  return markers;
}

// Centre and size (longest side) of a token's art in scene coordinates. Calculated from
// the item so it also works for tokens that were just built. Token rotation is ignored.
export function getTokenGeometry(token, sceneDpi) {
  const scaleX = (sceneDpi / token.grid.dpi) * token.scale.x;
  const scaleY = (sceneDpi / token.grid.dpi) * token.scale.y;

  return {
    center: {
      x: token.position.x + (token.image.width / 2 - token.grid.offset.x) * scaleX,
      y: token.position.y + (token.image.height / 2 - token.grid.offset.y) * scaleY,
    },
    size: Math.max(token.image.width * Math.abs(scaleX), token.image.height * Math.abs(scaleY)),
  };
}

// Fit the longest side of an image in one grid cell, keeping its proportions.
// The vertical offset matches the original 512px token (280 / 512).
export function getTokenGrid(width, height) {
  return {
    dpi: Math.max(width, height),
    offset: { x: width / 2, y: height * (280 / 512) },
  };
}
