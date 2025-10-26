import OBR, { buildImage, isImage } from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";


OBR.onReady(async () => {
  console.log("Enemies Panel plugin ready (OBR SDK v3.1.0)");
  OBR.scene.onReadyChange((ready) => {
    if (ready) {
      setupCharacterRefs(document.querySelector("#initiative-list"), masterList);
    }
  })
  //setTimeout(function () {  }, 7000);
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
const masterList = [];
const fallbackCharImage = "https://timheessels.github.io/Durfsheets_Owlbear/owlbeartest/DefaultCharImg.png";
const fallbackEnemyImage = "https://timheessels.github.io/Durfsheets_Owlbear/owlbeartest/DefaultEnemyImg.png";
const partyID = "mh1ud9sr004z4arqhq9f";

let pendingUpdate = false;
let latestImages = null;
let latestMasterList = null;

const TICK_INTERVAL = 500; // ms
export function setupCharacterRefs(element, masterList) {


  const updateMasterList = async () => {
    // 1️⃣ Merge players and enemies
    masterList = [...playersList, ...enemiesList];
    console.log("masterList count " + masterList.length);

    // 2️⃣ Update the Owlbear tokens
    const images = await OBR.scene.items.getItems(isImage);
    scheduleUpdate(images, masterList);
  };

  setInterval(async () => {
    if (!pendingUpdate) return;

    // Execute the latest update
    await UpdateList(latestImages, latestMasterList);

    // Reset
    pendingUpdate = false;
  }, TICK_INTERVAL);

  function scheduleUpdate(images, masterList) {
    latestImages = images;
    latestMasterList = masterList;
    pendingUpdate = true;
  }

  // Store the latest snapshot locally
  let playersList = [];
  let enemiesList = [];

  // Listen for players
  const partyRefPlayers = ref(db, `Parties/${partyID}/CharactersBasic`);
  onValue(partyRefPlayers, (snapshotPlayers) => {
    const dataPlayers = snapshotPlayers.val() || {};

    playersList = Object.entries(dataPlayers)
      .filter(([_, charData]) => charData.characterType !== "Storage")
      .map(([charID, charData]) => ({
        id: charID,
        url: charData.CharacterImageLink ? charData.CharacterImageLink.url : fallbackCharImage,
        text: charData.CharacterName,
        wounds: charData.Wounds || 0,
        type: "player",
      }));

    console.log("Found " + playersList.length + " players");

    updateMasterList();
  });

  // Listen for enemies
  const partyRefEnemies = ref(db, `Parties/${partyID}/ActiveEnemies`);
  onValue(partyRefEnemies, (snapshotEnemies) => {
    const dataEnemies = snapshotEnemies.val() || {};

    enemiesList = Object.entries(dataEnemies)
      .map(([charID, charData]) => ({
        id: charID,
        url: charData.CharacterImageLink ? charData.CharacterImageLink.url : fallbackEnemyImage,
        text: charData.EnemyName + "["+charData.EnemyNumber+"]",
        wounds: charData.Wounds || 0,
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

  const characterRefs = new Map(); // id -> { id, name, item }

  async function UpdateList(characterItems) {

    const masterIds = masterList.map((m) => m.name); // or m.id if you rename that

    const itemsToRemove = characterItems.filter(
      (item) => !masterIds.includes(item.metadata[`${PLUGIN_ID}/charID`])
    );

    if (itemsToRemove.length > 0) {
      console.log("Removing outdated tokens:", itemsToRemove.map(i => i.name));
      await OBR.scene.items.deleteItems(itemsToRemove.map(i => i.id));
    }


    const dpi = await OBR.scene.grid.getDpi() * 2;

    const viewportPos = await OBR.viewport.getPosition();
    console.log("viewportPos: " + viewportPos + ", dpi: " + dpi);

    var newItemsToPlace = [];
    for (const master of masterList) {
      // Check if we already have an item for this ID
      let item = characterItems.find(
        (i) => i.metadata[`${PLUGIN_ID}/charID`] === master.name
      );

      console.log("item: " + item);
      if (!item) {

        var safeURL = await getSafeImageURL(master.url);

        item = buildImage(
          {
            height: 512,
            width: 512,
            url: safeURL,
            mime: "image/png",
          },
          { dpi: 512, offset: { x: 256, y: 280 } }
        )
          .plainText(master.text + " (" + master.wounds + " wounds)")
          .metadata({ [`${PLUGIN_ID}/charID`]: master.name })
          .textAlign("CENTER")
          .build();
        //item.name = master.name;
        newItemsToPlace.push(item);
      }
      else {
        //Update existing images on the scene with the latest data

        //TODO: Update image on change

        await OBR.scene.items.updateItems([item], (images) => {
          for (let image of images) {
            image.text.plainText = (master.text + " (" + master.wounds + " wounds)")
          }
        });
      }

      // Store reference
      characterRefs.set(master.name, {
        name: master.name,
        text: master.text,
        item
      });
    }

    //Add new tokes
    if (newItemsToPlace.length > 0)
      OBR.scene.items.addItems(newItemsToPlace);

    console.log("characterItems count " + characterItems.length);

    // Build the DOM list
    const nodes = [];
    for (const [id, ref] of characterRefs) {
      const node = document.createElement("li");
      node.textContent = `${ref.text} [id: ${ref.name}]`;
      nodes.push(node);
    }
    element.replaceChildren(...nodes);
  }


  //TODO: Only one check for changes in scene at startup?

  // Subscribe to scene changes
  /*
  const onchangeRenderList = async (items) => {

    const characterItems = items.filter(i => i.type === "IMAGE");
    UpdateList(characterItems);
  };
  OBR.scene.items.onChange(onchangeRenderList);

  */

  // Trigger initial render
  //OBR.scene.items.list().then(renderList);
}