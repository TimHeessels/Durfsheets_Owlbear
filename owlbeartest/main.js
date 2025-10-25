import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";

const PLUGIN_ID = "yourname.enemies-panel";

OBR.onReady(async () => {
  console.log("Enemies Panel plugin ready (OBR SDK v3.1.0)");

  

  await OBR.ui.registerPanel({
    id: `${PLUGIN_ID}/panel`,
    title: "Enemies",
    icon: "crossed-swords",
    show: true,
    url: "/owlbeartest/index.html",
    height: 420
  });
});

