import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@1.1.5/+esm";

const PLUGIN_ID = "yourname.enemies-panel";

OBR.onReady(async () => {
  console.log("Enemies plugin ready!");

  await OBR.ui.registerPanel({
    id: `${PLUGIN_ID}/panel`,
    title: "Enemies",
    icon: "crossed-swords",
    show: true,
    url: "index.html",
    height: 400
  });
});