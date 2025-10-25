import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";

const PLUGIN_ID = "yourname.enemies-panel";

OBR.onReady(async () => {
  console.log("Enemies Panel plugin ready (OBR SDK v3.1.0)");



  await OBR.ui.registerPanel({
    id: `${PLUGIN_ID}/panel`,
    title: "Enemies",
    icon: "crossed-swords",
    show: true,
    url: "/Durfsheets_Owlbear/owlbeartest/index.html",
    height: 420
  });
  
  // Listen for token changes and update panel
  OBR.scene.on("token.create", updateTokenList);
  OBR.scene.on("token.update", updateTokenList);
  OBR.scene.on("token.delete", updateTokenList);

  // Initial population
  updateTokenList();
});

async function updateTokenList() {
  // Get all tokens on the current map
  const tokens = await OBR.scene.getTokens();

  // Send to your panel via postMessage
  const panel = OBR.ui.getPanel("enemies-panel");
  if (panel) {
    panel.postMessage({ type: "updateTokens", tokens });
  }
}