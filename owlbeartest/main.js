import OBR, { buildImage, isImage } from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getDatabase, ref, onValue, get } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyA1DkZmjDaC2ACPRGYfLoNhhqwHMGH6RMg",
  authDomain: "durfsheets.firebaseapp.com",
  databaseURL: "https://durfsheets-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "durfsheets",
  storageBucket: "durfsheets.firebasestorage.app",
  messagingSenderId: "598898464221",
  appId: "1:598898464221:web:2fdb3af2132fd47b969234",
  measurementId: "G-P8P1N1DSMP"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Don't change: existing tokens store their metadata under this ID
const PLUGIN_ID = "com.th.enemies";
const PARTY_KEY = `${PLUGIN_ID}/partyID`;
const CHAR_ID_KEY = `${PLUGIN_ID}/charID`;
const DURF_KEY = `${PLUGIN_ID}/durfCharacter`;
const HIDDEN_KEY = `${PLUGIN_ID}/hiddenBySync`;

const fallbackCharImage = "https://timheessels.github.io/Durfsheets_Owlbear/owlbeartest/DefaultCharImg.png";
const fallbackEnemyImage = "https://timheessels.github.io/Durfsheets_Owlbear/owlbeartest/DefaultEnemyImg.png";

const gmPanel = document.getElementById("GMPanel");
const partyInput = document.getElementById("partyID");
const statusText = document.getElementById("SyncedData");

let currentPartyID = null;
let partyName = null;

// Latest Firebase snapshots; null until the first snapshot has arrived
let playersList = null;
let enemiesList = null;

// Unsubscribe functions for the active Firebase listeners
let firebaseUnsubs = [];
// Incremented on every setup so an older, still-running setup can bail out
let setupRun = 0;
let warnedMissingParty = false;

// url -> Promise<boolean>, so every image is only CORS-checked once
const imageCheckCache = new Map();

const sync = { pending: false, running: false, timeout: null };

OBR.onReady(async () => {
  console.log("DurfSheets sync plugin ready (OBR SDK v3.1.0)");

  applyTheme(await OBR.theme.getTheme());
  OBR.theme.onChange(applyTheme);

  await loadPartyID();

  document.getElementById("setPartyID").addEventListener("click", async () => {
    const input = partyInput.value.trim();
    if (!input) {
      OBR.notification.show("Please enter a Party ID", "WARNING");
      return;
    }

    currentPartyID = input;
    await OBR.room.setMetadata({ [PARTY_KEY]: currentPartyID });
    setupCharacterRefs();
  });

  // Party ID is stored per room, so pick up changes made by another GM/device
  OBR.room.onMetadataChange((metadata) => {
    const id = metadata[PARTY_KEY];
    if (id && id !== currentPartyID) {
      currentPartyID = id;
      setupCharacterRefs();
    }
  });

  let lastRole = await OBR.player.getRole();
  OBR.player.onChange((player) => {
    if (player.role !== lastRole) {
      lastRole = player.role;
      setupCharacterRefs();
    }
  });

  OBR.scene.onReadyChange((ready) => {
    if (ready) {
      setupCharacterRefs();
    } else {
      stopSync();
    }
  });

  // onReadyChange only fires on changes, so handle an already loaded scene
  if (await OBR.scene.isReady()) {
    setupCharacterRefs();
  }
});

function applyTheme(theme) {
  document.body.style.color = theme.text.primary;
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

  if (legacyID && (await OBR.player.getRole()) === "GM") {
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
}

async function setupCharacterRefs() {
  const run = ++setupRun;
  stopSync();

  const role = await OBR.player.getRole();
  if (run !== setupRun) return;

  if (role !== "GM") {
    gmPanel.style.display = "none";
    statusText.textContent = "Only the GM needs to set this up. Please only have one GM so the tool can sync without issues.";
    return;
  }
  gmPanel.style.display = "block";

  if (!currentPartyID) {
    statusText.textContent = "Enter a party-id to sync characters and enemies to tokens. Only the GM has to do this, and please use only one GM.";
    if (!warnedMissingParty) {
      warnedMissingParty = true;
      OBR.notification.show("Please fill in the 'party id' in the Durfsheets plugin.", "WARNING");
    }
    return;
  }

  partyInput.value = currentPartyID;

  if (!(await OBR.scene.isReady())) {
    statusText.textContent = "Open a scene to start syncing.";
    return;
  }

  let snapshot;
  try {
    snapshot = await get(ref(db, `Parties/${currentPartyID}/PartyName`));
  } catch (error) {
    console.error(error);
    if (run === setupRun) statusText.textContent = "Could not reach DurfSheets: " + error.message;
    return;
  }
  if (run !== setupRun) return;

  if (!snapshot.exists()) {
    statusText.textContent = "The party-id you entered doesn't seem to have a valid party.";
    return;
  }

  partyName = snapshot.val();
  statusText.textContent = "The plugin is synced with the " + partyName + " party.";

  // Listen for players
  firebaseUnsubs.push(onValue(ref(db, `Parties/${currentPartyID}/CharactersBasic`), (snapshotPlayers) => {
    const dataPlayers = snapshotPlayers.val() || {};

    playersList = Object.entries(dataPlayers)
      .filter(([_, charData]) => charData?.characterType !== "Storage")
      .map(([charID, charData]) => ({
        id: charID,
        url: charData.CharacterImageLink?.token?.url || fallbackCharImage,
        text: charData.CharacterName,
        wounds: charData.Wounds || 0,
        light: (charData.DepletableLightDiceActive || 0) + (charData.PermanentLightDiceActive || 0),
        state: charData.characterState,
        characterType: charData.characterType,
        type: "player",
      }));

    console.log("Found " + playersList.length + " players");
    scheduleUpdate();
  }));

  // Listen for enemies
  firebaseUnsubs.push(onValue(ref(db, `Parties/${currentPartyID}/ActiveEnemies`), (snapshotEnemies) => {
    const dataEnemies = snapshotEnemies.val() || {};

    // Enemies hidden from players are kept so their tokens get hidden instead of deleted
    enemiesList = Object.entries(dataEnemies)
      .map(([charID, charData]) => ({
        id: charID,
        url: charData.CharacterImageLink?.token?.url || fallbackEnemyImage,
        text: "[" + charData.EnemyNumber + "] " + charData.EnemyName,
        wounds: charData.Wounds || 0,
        damage: charData.Damage || 0,
        light: 0,
        state: charData.IsDead ? "Dead" : "Active",
        hidden: charData.VisibleToPlayer !== true,
        type: "enemy",
      }));

    console.log("Found " + enemiesList.length + " enemies");
    scheduleUpdate();
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

  try {
    if (await OBR.scene.isReady()) {
      const images = await OBR.scene.items.getItems(isImage);
      await UpdateList(images, [...playersList, ...enemiesList]);

      statusText.textContent = "The plugin is synced with the " + partyName + " party: " +
        playersList.length + " characters, " + enemiesList.filter((enemy) => !enemy.hidden).length + " visible enemies. " +
        "Last update " + new Date().toLocaleTimeString() + ".";
    }
  } catch (err) {
    console.error("UpdateList failed:", err);
  } finally {
    sync.running = false;

    // If something changed during the run, schedule again immediately
    if (sync.pending) runUpdateIfNeeded();
  }
}

function getSafeImageURL(url, fallback) {
  if (!imageCheckCache.has(url)) {
    imageCheckCache.set(url, testImageCORS(url));
  }
  return imageCheckCache.get(url).then((ok) => (ok ? url : fallback));
}

async function testImageCORS(url) {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error("HTTP error " + response.status);

    // Try to create a blob to confirm browser can access data
    const blob = await response.blob();
    return blob.size > 0;
  } catch (error) {
    console.warn("CORS issue or fetch failed:", url, error.message);
    return false;
  }
}

function GetCharacterText(master) {
  if (master.state == "Dead")
    return master.text + "💀";
  else if (master.state == "Away")
    return master.text + " (Away)";
  else
    if (master.type == "enemy")
      return master.text + " 💥" + master.damage;
    else
      return master.text +
        (master.wounds > 0 ? " 🩸 " + master.wounds + "" : "") +
        (master.light > 0 ? " ☀️ " + master.light + "" : "");
}

function GetLayer(master) {
  return master.characterType === "Vehicle" ? "MOUNT" : "CHARACTER";
}

// World position of the centre of the GM's current view
async function getViewportCenter() {
  const [width, height] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  return OBR.viewport.inverseTransformPoint({ x: width / 2, y: height / 2 });
}

async function UpdateList(characterItems, masterList) {

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

  const safeURLs = await Promise.all(masterList.map((master) =>
    getSafeImageURL(master.url, master.type === "enemy" ? fallbackEnemyImage : fallbackCharImage)
  ));

  //Check which need to be updated or added
  const updateMap = new Map();
  const mastersToAdd = [];
  masterList.forEach((master, index) => {
    const existingItem = itemsByCharID.get(master.id);

    if (existingItem) {
      updateMap.set(existingItem.id, {
        name: GetCharacterText(master),
        url: safeURLs[index],
        layer: GetLayer(master),
        hide: master.hidden === true,
      });
      itemsByCharID.delete(master.id);
    }
    else if (!master.hidden) {
      mastersToAdd.push({ master, url: safeURLs[index] });
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

        if (item.image?.url !== target.url) {
          item.image.url = target.url;
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

    const newItemsToPlace = mastersToAdd.map(({ master, url }) =>
      buildImage(
        {
          height: 512,
          width: 512,
          url: url,
          mime: "image/png",
        },
        { dpi: 512, offset: { x: 256, y: 280 } }
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
