import OBR, { buildImage, isImage } from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";

OBR.onReady(async () => {
  console.log("Enemies Panel plugin ready (OBR SDK v3.1.0)");
  OBR.scene.onReadyChange((ready) => {
    if (ready) {
      setupCharacterRefs();
    }
  })
});

import { getDatabase, ref, onValue, get } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-database.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";

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
const PLUGIN_ID = "com.th.enemies";

//We use name as ID from firebase
var masterList = [];
const fallbackCharImage = "https://timheessels.github.io/Durfsheets_Owlbear/owlbeartest/DefaultCharImg.png";
const fallbackEnemyImage = "https://timheessels.github.io/Durfsheets_Owlbear/owlbeartest/DefaultEnemyImg.png";

// Load saved partyID from localStorage
let currentPartyID = localStorage.getItem("partyID");

// Handle user setting a new partyID
document.getElementById("setPartyID").addEventListener("click", () => {
  const input = document.getElementById("partyID").value.trim();
  if (!input) return alert("Please enter a Party ID");

  currentPartyID = input;

  // Save for future reloads
  localStorage.setItem("partyID", currentPartyID);

  // Setup Firebase listeners for this party
  setupCharacterRefs();
});

export async function setupCharacterRefs() {

  OBR.player.onChange(async (player) => {
    if (player.role === "GM") {
      console.log("GM");
      document.getElementById('GMPanel').style.display = "block";
    } else {
      console.log("NO GM");
      document.getElementById('GMPanel').style.display = "none";
    }
  });

  const user = await OBR.player.getRole();
  if (user !== "GM") {
    document.getElementById('GMPanel').style.display = "none";
    document.getElementById('SyncedData').textContent = "Only the GM needs to set this up. Please only have one GM so the tool can sync without issues.";
    return;
  }

  if (currentPartyID == null || currentPartyID == "") {
    return;
  }

  get(ref(db, `Parties/${currentPartyID}/PartyName`)).then((snapshot) => {
    if (snapshot.exists()) {
      document.getElementById('SyncedData').textContent = "The plugin is synced with the " + snapshot.val() + " party.";
    } else {
      document.getElementById('SyncedData').textContent = "The party-id you entered doesn't seem to have a valid party.";
      return;
    }
  }).catch((error) => {
    console.error(error);
  });

  document.getElementById("partyID").value = currentPartyID;

  const updateMasterList = async () => {
    masterList = [...playersList, ...enemiesList];
    const images = await OBR.scene.items.getItems(isImage);
    scheduleUpdate(images, masterList);
  };

  window.durfSync = window.durfSync || {};
  window.durfSync.latestImages = [];
  window.durfSync.latestMasterList = [];
  window.durfSync.pending = false;
  window.durfSync.running = false;
  window.durfSync.timeout = null;

  function scheduleUpdate(images, masterList) {
    // Always keep the latest data
    window.durfSync.latestImages = images;
    window.durfSync.latestMasterList = masterList;
    window.durfSync.pending = true;

    // Debounce: restart the timer each time a new update comes in
    if (window.durfSync.timeout) clearTimeout(window.durfSync.timeout);
    window.durfSync.timeout = setTimeout(runUpdateIfNeeded, 400);
  }

  async function runUpdateIfNeeded() {
    // Don’t run if another update is still running
    if (window.durfSync.running || !window.durfSync.pending) return;

    window.durfSync.running = true;
    window.durfSync.pending = false;

    try {
      await UpdateList(window.durfSync.latestImages, window.durfSync.latestMasterList);
    } catch (err) {
      console.error("UpdateList failed:", err);
    } finally {
      window.durfSync.running = false;

      // If something changed during the run, schedule again immediately
      if (window.durfSync.pending) runUpdateIfNeeded();
    }
  }

  // Store the latest snapshot locally
  let playersList = [];
  let enemiesList = [];

  // Listen for players
  const partyRefPlayers = ref(db, `Parties/${currentPartyID}/CharactersBasic`);
  onValue(partyRefPlayers, (snapshotPlayers) => {
    const dataPlayers = snapshotPlayers.val() || {};

    playersList = Object.entries(dataPlayers)
      .filter(([_, charData]) => charData.characterType !== "Storage")
      .map(([charID, charData]) => ({
        id: charID,
        url: charData.CharacterImageLink?.token?.url ? charData.CharacterImageLink?.token?.url : fallbackCharImage,
        text: charData.CharacterName,
        wounds: charData.Wounds || 0,
        state: charData.characterState,
        light: charData.DepletableLightDiceActive + charData.PermanentLightDiceActive,
        state: charData.characterState,
        characterType: charData.characterType,
        type: "player",
      }));

    console.log("Found " + playersList.length + " players");

    updateMasterList();
  });

  // Listen for enemies
  const partyRefEnemies = ref(db, `Parties/${currentPartyID}/ActiveEnemies`);
  onValue(partyRefEnemies, (snapshotEnemies) => {
    const dataEnemies = snapshotEnemies.val() || {};

    enemiesList = Object.entries(dataEnemies)
      .map(([charID, charData]) => ({
        id: charID,
        url: charData.CharacterImageLink?.token?.url ? charData.CharacterImageLink?.token?.url : fallbackEnemyImage,
        text: "[" + charData.EnemyNumber + "] " + charData.EnemyName,
        wounds: charData.Wounds || 0,
        damage: charData.Damage || 0,
        light: 0,
        state: charData.IsDead ? "Dead" : "Active",
        type: "enemy",
      }));
    console.log("Found " + enemiesList.length + " enemies");

    updateMasterList();
  });

  async function getSafeImageURL(url) {
    const ok = await testImageCORS(url);
    //console.log("URL check for " + url + " = " + ok);
    return ok ? url : fallbackCharImage;
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

  async function UpdateList(characterItems) {

    console.log("Update character list");

    // Filter to only the items that are "durfCharacter"
    const durfItems = characterItems.filter(
      (item) => item.metadata[`${PLUGIN_ID}/durfCharacter`] === true
    );

    // Map to track first occurrence of each ID
    const seenIds = new Set();
    const duplicatesToRemove = [];

    for (const item of durfItems) {
      const id = item.metadata[`${PLUGIN_ID}/charID`];
      if (seenIds.has(id)) {
        // Duplicate found → mark for deletion
        duplicatesToRemove.push(item.id);
      } else {
        // First occurrence → keep
        seenIds.add(id);
      }
    }

    // Delete duplicates
    if (duplicatesToRemove.length > 0) {
      console.log("Removing duplicate tokens:", duplicatesToRemove);
      await OBR.scene.items.deleteItems(duplicatesToRemove);
    }

    var newItemsToPlace = [];
    for (const master of masterList) {
      // Check if we already have an item for this ID
      let existingItem = characterItems.find(
        (i) => i.metadata[`${PLUGIN_ID}/charID`] === master.id
      );

      var safeURL = await getSafeImageURL(master.url);

      if (existingItem) {
        await OBR.scene.items.updateItems([existingItem], (items) => {

          //Name
          const currentName = items[0].text?.plainText || "";
          const targetName = GetCharacterText(master);
          if (currentName !== targetName) {
            items[0].text.plainText = targetName;
          }

          //Image
          const currentUrl = items[0].image?.url || "";
          if (currentUrl !== safeURL) {
            items[0].image.url = safeURL;
          }

          //Character type
          const currentLayer = items[0].layer || "";
          var charType = master.characterType == "Vehicle" ? "Mount" : "Character";
          console.log("master.characterType : "+master.characterType  + ", charType: "+charType);
          if (currentLayer !== charType) {
            items[0].layer  = charType;
          }
        });
      }
      else {
        var itemToAdd = buildImage(
          {
            height: 512,
            width: 512,
            url: safeURL,
            mime: "image/png",
          },
          { dpi: 512, offset: { x: 256, y: 280 } }
        )
          .plainText(GetCharacterText(master))
          .metadata({
            [`${PLUGIN_ID}/charID`]: master.id,
            [`${PLUGIN_ID}/durfCharacter`]: true,
          })
          .textAlign("CENTER")
          .build();

        newItemsToPlace.push(itemToAdd);
      }
    }

    var startPosX = 0;
    var startPosY = 0;

    //Add new tokes
    if (newItemsToPlace.length > 0) {
      OBR.scene.items.addItems(newItemsToPlace);

      await OBR.scene.items.updateItems(newItemsToPlace, (images) => {
        console.log("new images: " + images.length);
        for (let index = 0; index < images.length; index++) {
          images[index].position = { x: ((startPosX - 300) + Math.floor(Math.random() * 600)), y: ((startPosY - 300) + Math.floor(Math.random() * 600)) };
          images[index].layer = "CHARACTER";
        }
      });
    }
  }
}