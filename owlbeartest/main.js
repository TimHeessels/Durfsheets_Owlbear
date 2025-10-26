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



import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-database.js";
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

//We use name as ID from firebase
const masterList = [];
const fallbackUImageRL = "https://timheessels.github.io/Durfsheets_Owlbear/owlbeartest/DefaultCharImg.png";

export function setupCharacterRefs(element, masterList) {
  buildMasterList("m7g58g0z00rrfn8r8i9f");

  async function buildMasterList(partyID) {

    const partyRef = ref(db, `Parties/${partyID}/CharactersBasic`);
    onValue(partyRef, async (snapshot) => {
      const data = snapshot.val() || {};
      masterList = Object.entries(data).map(([charID, charData]) => ({
        name: charID,
        url: charData.CharacterImageLink ? charData.CharacterImageLink.url : fallbackUImageRL,
        text: charData.CharacterName,
        wounds: charData.Wounds || 0
      }));

      console.log("masterList from firebase: " + masterList.length);

      var images = await OBR.scene.items.getItems(isImage);
      UpdateList(images);
    });
  }

  async function getSafeImageURL(url) {
    const ok = await testImageCORS(url);
    console.log("URL check for " + url + " = " + ok);
    return ok ? url : fallbackUImageRL;
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

    const dpi = await OBR.scene.grid.getDpi() * 2;

    const viewportPos = await OBR.viewport.getPosition();
    console.log("viewportPos: " + viewportPos + ", dpi: " + dpi);

    var newItemsToPlace = [];
    for (const master of masterList) {
      // Check if we already have an item for this ID
      let item = characterItems.find(i => i.name === master.name);
      if (!item) {

        var safeURL = await getSafeImageURL(master.url);

        item = buildImage(
          {
            height: 512,
            width: 512,
            url: safeURL,
            mime: "image/png",
          },
          {dpi: 512, offset: { x: 256, y: 280 } }
        )
          .plainText(master.text + " (" + master.wounds + " wounds)")
          .textAlign("CENTER")
          .build();
        item.name = master.name;
        item.position = viewportPos;
        console.log("item.name: " + item.name);
        newItemsToPlace.push(item);

      }
      else {
        console.log(item.text.plainText + ", master.text: " + master.text + " master.wounds: " + master.wounds)
        item.text.plainText = (master.text + " (" + master.wounds + " wounds)")
      }

      // Store reference
      characterRefs.set(master.name, {
        name: master.name,
        text: master.text,
        item
      });
    }

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