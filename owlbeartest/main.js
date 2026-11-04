import OBR, { isImage } from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";
import { db, ref, get } from "./firebase.js";
import {
  PARTY_KEY, DURF_KEY, SYNC_ENABLED_KEY,
  STATUS_CHANNEL, COMMAND_CHANNEL, LOCAL_ONLY,
  isValidPartyID, isSceneSyncEnabled,
} from "./shared.js";

// The popover is only the interface. Syncing happens in background.js.

const BACKGROUND_TIMEOUT_MS = 3000;

const gmPanel = document.getElementById("GMPanel");
const partyInput = document.getElementById("partyID");
const setPartyButton = document.getElementById("setPartyID");
const confirmPanel = document.getElementById("ConfirmPanel");
const confirmText = document.getElementById("ConfirmText");
const sceneSyncBox = document.getElementById("sceneSync");
const syncNowButton = document.getElementById("syncNow");
const disconnectButton = document.getElementById("disconnectParty");
const statusText = document.getElementById("SyncedData");
const offlineText = document.getElementById("Offline");

let pendingPartyID = null;
let backgroundResponded = false;

OBR.onReady(async () => {
  applyTheme(await OBR.theme.getTheme());
  OBR.theme.onChange(applyTheme);

  applyRole(await OBR.player.getRole());
  OBR.player.onChange((player) => applyRole(player.role));

  OBR.broadcast.onMessage(STATUS_CHANNEL, ({ data }) => renderStatus(data));

  setPartyButton.addEventListener("click", onSetParty);
  document.getElementById("confirmParty").addEventListener("click", onConfirmParty);
  document.getElementById("cancelParty").addEventListener("click", closeConfirm);
  syncNowButton.addEventListener("click", () => sendCommand("sync-now"));
  disconnectButton.addEventListener("click", onDisconnect);
  sceneSyncBox.addEventListener("change", onSceneSyncChange);

  OBR.scene.onReadyChange(refreshSceneToggle);
  OBR.scene.onMetadataChange(refreshSceneToggle);
  await refreshSceneToggle();

  sendCommand("status-request");
  setTimeout(() => {
    if (backgroundResponded) return;
    showMessage("error", "The sync service isn't running. Remove the extension from this room, add it again, then reload the page.");
  }, BACKGROUND_TIMEOUT_MS);
});

function sendCommand(type) {
  return OBR.broadcast.sendMessage(COMMAND_CHANNEL, { type }, LOCAL_ONLY);
}

function applyTheme(theme) {
  const style = document.documentElement.style;
  style.colorScheme = theme.mode === "DARK" ? "dark" : "light";
  style.setProperty("--text", theme.text.primary);
  style.setProperty("--muted", theme.text.disabled);
  style.setProperty("--paper", theme.background.paper);
  style.setProperty("--primary", theme.primary.main);
  style.setProperty("--primary-text", theme.primary.contrastText);
}

function applyRole(role) {
  gmPanel.hidden = role !== "GM";
}

function showMessage(state, message) {
  statusText.textContent = message;
  statusText.classList.toggle("error", state === "error");
}

function renderStatus(status) {
  backgroundResponded = true;
  showMessage(status.state, status.message);
  offlineText.hidden = status.connected !== false;
  syncNowButton.disabled = !status.canSync;
  disconnectButton.disabled = !status.partyID;

  // Don't overwrite what the GM is typing
  if (document.activeElement !== partyInput && !pendingPartyID) {
    partyInput.value = status.partyID || "";
  }
}

async function refreshSceneToggle() {
  const ready = await OBR.scene.isReady();
  sceneSyncBox.disabled = !ready;
  sceneSyncBox.checked = ready ? isSceneSyncEnabled(await OBR.scene.getMetadata()) : false;
}

function onSceneSyncChange() {
  OBR.scene.setMetadata({ [SYNC_ENABLED_KEY]: sceneSyncBox.checked });
}

async function countSyncedTokens() {
  if (!(await OBR.scene.isReady())) return 0;
  const images = await OBR.scene.items.getItems(isImage);
  return images.filter((item) => item.metadata[DURF_KEY] === true).length;
}

async function onSetParty() {
  closeConfirm();

  const input = partyInput.value.trim();
  if (!input) {
    OBR.notification.show("Please enter a Party ID", "WARNING");
    return;
  }
  if (!isValidPartyID(input)) {
    showMessage("error", "A party ID can't contain . # $ [ ] or /");
    return;
  }

  const metadata = await OBR.room.getMetadata();
  if (input === metadata[PARTY_KEY]) {
    sendCommand("sync-now");
    return;
  }

  setPartyButton.disabled = true;
  try {
    // Check first: a saved ID replaces every synced token with that party's
    const snapshot = await get(ref(db, `Parties/${input}/PartyName`));
    if (!snapshot.exists()) {
      showMessage("error", "No DurfSheets party has this ID. Nothing was changed.");
      return;
    }

    const tokenCount = await countSyncedTokens();
    if (tokenCount > 0) {
      pendingPartyID = input;
      confirmText.textContent = "Switching to " + snapshot.val() + " removes the " + tokenCount +
        " synced token(s) in this scene that aren't in that party, and does the same in other scenes when they're opened.";
      confirmPanel.hidden = false;
      return;
    }

    await OBR.room.setMetadata({ [PARTY_KEY]: input });
  } catch (error) {
    console.error(error);
    showMessage("error", "Could not reach DurfSheets: " + error.message);
  } finally {
    setPartyButton.disabled = false;
  }
}

async function onConfirmParty() {
  const id = pendingPartyID;
  closeConfirm();
  if (id) await OBR.room.setMetadata({ [PARTY_KEY]: id });
}

function closeConfirm() {
  pendingPartyID = null;
  confirmPanel.hidden = true;
}

function onDisconnect() {
  closeConfirm();
  partyInput.value = "";
  OBR.room.setMetadata({ [PARTY_KEY]: null });
}
