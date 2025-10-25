import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";

const PLUGIN_ID = "yourname.enemies-panel";

OBR.onReady(async () => {
  console.log("Enemies Panel plugin ready (OBR SDK v3.1.0)");


  OBR.onReady(() => {
    setupInitiativeList(document.querySelector("#initiative-list"));
  });
});

export function setupInitiativeList(element) {
  const renderList = (items) => {
    // Get the name and initiative of any item with
    // our initiative metadata
    const initiativeItems = [];
    for (const item of items) {
      const metadata = item.metadata[`${ID}/metadata`];
      if (metadata) {
        initiativeItems.push({
          initiative: metadata.initiative,
          name: item.name,
        });
      }
    }
    // Sort so the highest initiative value is on top
    const sortedItems = initiativeItems.sort(
      (a, b) => parseFloat(b.initiative) - parseFloat(a.initiative)
    );
    // Create new list nodes for each initiative item
    const nodes = [];
    for (const initiativeItem of sortedItems) {
      const node = document.createElement("li");
      node.innerHTML = `${initiativeItem.name} (${initiativeItem.initiative})`;
      nodes.push(node);
    }
    element.replaceChildren(...nodes);
  };
  OBR.scene.items.onChange(renderList);
}