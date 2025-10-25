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
        initiativeItems.push({
          name: item.name,
        });
    }
    
    // Create new list nodes for each initiative item
    const nodes = [];
    for (const initiativeItem of initiativeItems) {
      const node = document.createElement("li");
      node.innerHTML = `${initiativeItem.name} `;
      nodes.push(node);
    }
    element.replaceChildren(...nodes);
  };
  OBR.scene.items.onChange(renderList);
}