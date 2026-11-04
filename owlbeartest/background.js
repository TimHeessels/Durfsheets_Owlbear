import OBR, { buildImage, isImage } from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";
import { db, ref, onValue, get } from "./firebase.js";
import {
  PARTY_KEY, CHAR_ID_KEY, DURF_KEY, HIDDEN_KEY,
  STATUS_CHANNEL, COMMAND_CHANNEL, LOCAL_ONLY,
  isSceneSyncEnabled, isActiveSyncer, mapPlayers, mapEnemies, GetCharacterText, getTokenGrid,
} from "./shared.js";

// Runs for as long as the room is open, whether or not the popover is.

const fallbackCharImage = {
  url: new URL("DefaultCharImg.png", import.meta.url).href, mime: "image/png", width: 512, height: 512,
};
const fallbackEnemyImage = {
  url: new URL("DefaultEnemyImg.png", import.meta.url).href, mime: "image/png", width: 512, height: 512,
};

// Broken image URLs are checked again after this long, or on "Sync now"
const IMAGE_RETRY_MS = 60 * 1000;

let currentPartyID = null;
let partyName = null;

let myRole = null;
let myConnectionId = null;
let otherPlayers = [];
let sceneEnabled = true;
// Whether the last setup decided this client should be syncing
let shouldHaveSynced = false;

// Latest Firebase snapshots; null until the first snapshot has arrived
let playersList = null;
let enemiesList = null;

// Unsubscribe functions for the active Firebase listeners
let firebaseUnsubs = [];
// Incremented on every setup so older, still-running work can bail out
let setupRun = 0;
let warnedMissingParty = false;

// url -> Promise<image info>, successful checks only
const imageCache = new Map();
// url -> time of the last failed check
const imageFailures = new Map();

const sync = { pending: false, running: false, timeout: null };

// What the popover shows; sent again whenever it changes
const status = { state: "info", message: "Starting...", partyID: null, canSync: false, connected: true };

function publishStatus() {
  OBR.broadcast.sendMessage(STATUS_CHANNEL, status, LOCAL_ONLY).catch((error) => {
    console.warn("Could not send status:", error);
  });
}

function setStatus(state, message, canSync = false) {
  status.state = state;
  status.message = message;
  status.partyID = currentPartyID;
  status.canSync = canSync;
  publishStatus();
}

OBR.onReady(async () => {
  console.log("DurfSheets sync background ready (OBR SDK v3.1.0)");

  OBR.broadcast.onMessage(COMMAND_CHANNEL, ({ data }) => {
    if (data?.type === "status-request") {
      publishStatus();
    } else if (data?.type === "sync-now") {
      imageFailures.clear();
      setupCharacterRefs();
    }
  });

  [myRole, myConnectionId, otherPlayers] = await Promise.all([
    OBR.player.getRole(),
    OBR.player.getConnectionId(),
    OBR.party.getPlayers(),
  ]);

  await loadPartyID();

  // Party ID is stored per room, so this also picks up changes from the popover
  OBR.room.onMetadataChange((metadata) => {
    const id = metadata[PARTY_KEY] || null;
    if (id !== currentPartyID) {
      currentPartyID = id;
      setupCharacterRefs();
    }
  });

  OBR.player.onChange((player) => {
    if (player.role !== myRole) {
      myRole = player.role;
      setupCharacterRefs();
    }
  });

  OBR.party.onChange((players) => {
    otherPlayers = players;
    // This fires on every player change, so only react when the syncer changes
    if (shouldSync() !== shouldHaveSynced) setupCharacterRefs();
  });

  OBR.scene.onMetadataChange((metadata) => {
    const enabled = isSceneSyncEnabled(metadata);
    if (enabled !== sceneEnabled) {
      sceneEnabled = enabled;
      setupCharacterRefs();
    }
  });

  OBR.scene.onReadyChange((ready) => {
    if (ready) {
      setupCharacterRefs();
    } else {
      setupRun++;
      stopSync();
      if (myRole === "GM") setStatus("info", "Open a scene to start syncing.");
    }
  });

  // onReadyChange only fires on changes, so this also covers an already loaded scene
  setupCharacterRefs();
});

function shouldSync() {
  return myRole === "GM" && isActiveSyncer(myConnectionId, otherPlayers);
}

async function loadPartyID() {
  const metadata = await OBR.room.getMetadata();
  currentPartyID = metadata[PARTY_KEY] || null;

  if (currentPartyID) return;

  // Migrate the party ID from older versions that stored it per browser
  let legacyID = null;
  try {
    legacyID = localStorage.getItem("partyID");
  } catch (error) {
    console.warn("localStorage unavailable:", error);
  }

  if (legacyID && myRole === "GM") {
    currentPartyID = legacyID;
    await OBR.room.setMetadata({ [PARTY_KEY]: currentPartyID });
  }
}

function stopSync() {
  for (const unsubscribe of firebaseUnsubs) unsubscribe();
  firebaseUnsubs = [];

  if (sync.timeout) clearTimeout(sync.timeout);
  sync.timeout = null;
  sync.pending = false;

  playersList = null;
  enemiesList = null;
  status.connected = true;
}

function onListenerError(error) {
  console.error("Firebase listener failed:", error);
  setStatus("error", "DurfSheets stopped sending updates: " + error.message + " Use Sync now to try again.", true);
}

async function setupCharacterRefs() {
  const run = ++setupRun;
  stopSync();
  shouldHaveSynced = shouldSync();

  if (myRole !== "GM") {
    setStatus("info", "Only the GM needs to set this up.");
    return;
  }

  if (!currentPartyID) {
    setStatus("info", "Enter a party ID to sync characters and enemies to tokens.");
    if (!warnedMissingParty) {
      warnedMissingParty = true;
      OBR.notification.show("Please fill in the 'party id' in the Durfsheets plugin.", "WARNING");
    }
    return;
  }

  if (!shouldHaveSynced) {
    setStatus("info", "Another GM is syncing this room. This client takes over if they leave.");
    return;
  }

  if (!(await OBR.scene.isReady())) {
    if (run === setupRun) setStatus("info", "Open a scene to start syncing.");
    return;
  }

  const sceneMetadata = await OBR.scene.getMetadata();
  if (run !== setupRun) return;

  sceneEnabled = isSceneSyncEnabled(sceneMetadata);
  if (!sceneEnabled) {
    setStatus("info", "Sync is turned off for this scene.");
    return;
  }

  let snapshot;
  try {
    snapshot = await get(ref(db, `Parties/${currentPartyID}/PartyName`));
  } catch (error) {
    console.error(error);
    if (run === setupRun) setStatus("error", "Could not reach DurfSheets: " + error.message, true);
    return;
  }
  if (run !== setupRun) return;

  if (!snapshot.exists()) {
    setStatus("error", "The party ID doesn't match a DurfSheets party.");
    return;
  }

  partyName = snapshot.val();
  setStatus("ok", "The plugin is synced with the " + partyName + " party.", true);

  // Listen for players
  firebaseUnsubs.push(onValue(ref(db, `Parties/${currentPartyID}/CharactersBasic`), (snapshotPlayers) => {
    playersList = mapPlayers(snapshotPlayers.val());
    console.log("Found " + playersList.length + " players");
    scheduleUpdate();
  }, onListenerError));

  // Listen for enemies
  firebaseUnsubs.push(onValue(ref(db, `Parties/${currentPartyID}/ActiveEnemies`), (snapshotEnemies) => {
    enemiesList = mapEnemies(snapshotEnemies.val());
    console.log("Found " + enemiesList.length + " enemies");
    scheduleUpdate();
  }, onListenerError));

  // Firebase reports false until it first connects, so only show a lost connection
  let hasConnected = false;
  firebaseUnsubs.push(onValue(ref(db, ".info/connected"), (snapshotConnected) => {
    const connected = snapshotConnected.val() === true;
    hasConnected = hasConnected || connected;
    status.connected = connected || !hasConnected;
    publishStatus();
  }));
}

function scheduleUpdate() {
  sync.pending = true;

  // Debounce: restart the timer each time a new update comes in
  if (sync.timeout) clearTimeout(sync.timeout);
  sync.timeout = setTimeout(runUpdateIfNeeded, 1000);
}

async function runUpdateIfNeeded() {
  // Don’t run if another update is still running
  if (sync.running || !sync.pending) return;

  // Wait until both lists are loaded, otherwise the missing half would get hidden
  if (playersList === null || enemiesList === null) return;

  sync.running = true;
  sync.pending = false;

  // stopSync clears the shared lists, so keep this run's own copies
  const run = setupRun;
  const players = playersList;
  const enemies = enemiesList;

  try {
    if (await OBR.scene.isReady()) {
      const images = await OBR.scene.items.getItems(isImage);
      await UpdateList(images, [...players, ...enemies], run);

      if (run === setupRun) {
        setStatus("ok", "The plugin is synced with the " + partyName + " party: " +
          players.length + " characters, " + enemies.filter((enemy) => !enemy.hidden).length + " visible enemies. " +
          "Last update " + new Date().toLocaleTimeString() + ".", true);
      }
    }
  } catch (err) {
    console.error("UpdateList failed:", err);
    if (run === setupRun) setStatus("error", "Sync failed: " + err.message, true);
  } finally {
    sync.running = false;

    // If something changed during the run, schedule again immediately
    if (sync.pending) runUpdateIfNeeded();
  }
}

// Resolves to the image's details, or null if it can't be used right now
function getImageInfo(url) {
  if (imageCache.has(url)) return imageCache.get(url);

  const failedAt = imageFailures.get(url);
  if (failedAt !== undefined && Date.now() - failedAt < IMAGE_RETRY_MS) return Promise.resolve(null);

  const check = loadImageInfo(url).then((info) => {
    if (info) {
      imageFailures.delete(url);
    } else {
      imageCache.delete(url);
      imageFailures.set(url, Date.now());
    }
    return info;
  });
  imageCache.set(url, check);
  return check;
}

async function loadImageInfo(url) {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error("HTTP error " + response.status);

    const blob = await response.blob();
    const isImageType = blob.type.startsWith("image/");

    let size = null;
    try {
      const bitmap = await createImageBitmap(blob);
      size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
    } catch (error) {
      // SVGs can't be decoded this way, but anything else here isn't an image
      if (!isImageType) throw new Error("Not an image");
    }

    return {
      url,
      mime: isImageType ? blob.type : "image/png",
      width: size?.width || 512,
      height: size?.height || 512,
    };
  } catch (error) {
    console.warn("CORS issue or fetch failed:", url, error.message);
    return null;
  }
}

function GetLayer(master) {
  return master.characterType === "Vehicle" ? "MOUNT" : "CHARACTER";
}

function getFallbackImage(master) {
  return master.type === "enemy" ? fallbackEnemyImage : fallbackCharImage;
}

function isDifferentImage(current, target) {
  return current.url !== target.url ||
    current.width !== target.width ||
    current.height !== target.height ||
    current.mime !== target.mime;
}

// World position of the centre of the GM's current view
async function getViewportCenter() {
  const [width, height] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  return OBR.viewport.inverseTransformPoint({ x: width / 2, y: height / 2 });
}

async function UpdateList(characterItems, masterList, run) {

  console.log("Update character list");

  // Filter to only the items that are "durfCharacter"
  const durfItems = characterItems.filter((item) => item.metadata[DURF_KEY] === true);

  // Map to track first occurrence of each ID
  const itemsByCharID = new Map();
  const duplicatesToRemove = [];

  for (const item of durfItems) {
    const id = item.metadata[CHAR_ID_KEY];
    if (itemsByCharID.has(id)) {
      // Duplicate found → mark for deletion
      duplicatesToRemove.push(item.id);
    } else {
      // First occurrence → keep
      itemsByCharID.set(id, item);
    }
  }

  // Delete duplicates
  if (duplicatesToRemove.length > 0) {
    console.log("Removing duplicate tokens:", duplicatesToRemove);
    await OBR.scene.items.deleteItems(duplicatesToRemove);
  }

  const imageInfos = await Promise.all(masterList.map((master) =>
    master.url ? getImageInfo(master.url) : getFallbackImage(master)
  ));

  // The party or scene may have changed during the image checks; don't apply old data
  if (run !== setupRun) return;

  //Check which need to be updated or added
  const updateMap = new Map();
  const mastersToAdd = [];
  masterList.forEach((master, index) => {
    const existingItem = itemsByCharID.get(master.id);

    if (existingItem) {
      updateMap.set(existingItem.id, {
        name: GetCharacterText(master),
        // null keeps the current art, so a failed check doesn't replace it
        image: imageInfos[index],
        layer: GetLayer(master),
        hide: master.hidden === true,
      });
      itemsByCharID.delete(master.id);
    }
    else if (!master.hidden) {
      mastersToAdd.push({ master, image: imageInfos[index] || getFallbackImage(master) });
    }
  });

  // Whatever is left was deleted in DurfSheets or belongs to another party
  const staleItems = Array.from(itemsByCharID.values(), (item) => item.id);
  if (staleItems.length > 0) {
    console.log("Removing tokens no longer in the party:", staleItems);
    await OBR.scene.items.deleteItems(staleItems);
  }

  //Update all existing at once
  const ids = Array.from(updateMap.keys());
  if (ids.length > 0) {
    await OBR.scene.items.updateItems(ids, (items) => {
      for (const item of items) {
        const target = updateMap.get(item.id);
        if (!target) continue;

        if (target.hide) {
          // Only hide tokens that are visible, and remember that we did it
          if (item.visible) {
            item.visible = false;
            item.metadata[HIDDEN_KEY] = true;
          }
        }
        else if (item.metadata[HIDDEN_KEY]) {
          // Unhide tokens we hid earlier, but leave tokens the GM hid alone
          item.visible = true;
          delete item.metadata[HIDDEN_KEY];
        }

        if (item.text?.plainText !== target.name) {
          item.text.plainText = target.name;
        }

        if (target.image && isDifferentImage(item.image, target.image)) {
          item.image.url = target.image.url;
          item.image.mime = target.image.mime;
          item.image.width = target.image.width;
          item.image.height = target.image.height;

          const grid = getTokenGrid(target.image.width, target.image.height);
          item.grid.dpi = grid.dpi;
          item.grid.offset = grid.offset;
        }

        if (item.layer !== target.layer) {
          item.layer = target.layer;
        }
      }
    });
  }

  //Add new tokens around the centre of the GM's view
  if (mastersToAdd.length > 0) {
    const [center, gridDpi] = await Promise.all([getViewportCenter(), OBR.scene.grid.getDpi()]);
    const spread = gridDpi * 4;

    const newItemsToPlace = mastersToAdd.map(({ master, image }) =>
      buildImage(
        {
          height: image.height,
          width: image.width,
          url: image.url,
          mime: image.mime,
        },
        getTokenGrid(image.width, image.height)
      )
        .position({
          x: center.x + (Math.random() - 0.5) * spread,
          y: center.y + (Math.random() - 0.5) * spread,
        })
        .layer(GetLayer(master))
        .plainText(GetCharacterText(master))
        .metadata({
          [CHAR_ID_KEY]: master.id,
          [DURF_KEY]: true,
        })
        .textAlign("CENTER")
        .build()
    );

    console.log("Adding " + newItemsToPlace.length + " new tokens");
    await OBR.scene.items.addItems(newItemsToPlace);
    console.log("Finished adding tokens");
  }
}
