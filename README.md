# DurfSheets for Owlbear Rodeo

An Owlbear Rodeo extension that keeps tokens in sync with a DurfSheets party. Characters and enemies appear as tokens, and their names, wounds, light dice, damage and art update as the party changes in DurfSheets.

## Install

In your Owlbear Rodeo profile, add a custom extension with this manifest URL:

```
https://timheessels.github.io/Durfsheets_Owlbear/owlbeartest/manifest.json
```

Then enable the extension in your room.

**Upgrading from 0.2:** remove the extension and add it again, then reload the room. Version 0.3 syncs from a background page, and Owlbear may keep using the old manifest until you do. If you skip this, the popover shows that the sync service isn't running.

## Setup

1. As the GM, open the Durfsheets icon in the top left of the room.
2. Enter your party ID from DurfSheets and select **Set Party**.

Only a GM needs to do this. The party ID is saved in the room, so it applies on every device. Players don't need to do anything.

## What gets synced

| In DurfSheets | On the token |
| --- | --- |
| Character name | Name label |
| Wounds, light dice | `🩸 2` and `☀️ 1` badges on the edge of the token |
| Dead or away characters | Token darkened, with a `💀` or `💤` badge |
| Enemy number, name | Name label, for example `[1] Rat` |
| Enemy damage | `💥 3` badge on the edge of the token |
| Token image | Token art, or a default image if it can't be loaded |
| Vehicle characters | Placed on the mount layer |
| Enemy visible to players | Token shown or hidden |

## Good to know

- New tokens appear near the centre of the GM's view.
- Tokens stay in place when they update, so you can move them freely.
- Every scene syncs by default. Turn off **Sync tokens in this scene** to leave a scene alone.
- A token you delete comes back on the next update while its character is in the party. To keep a scene free of tokens, turn sync off for it.
- Copies of a synced token are removed automatically.
- Tokens are removed when their character is deleted from DurfSheets, or when you switch to a different party.
- **Disconnect party** stops syncing and leaves all tokens in place.
- If several GMs are in a room, one is picked automatically to do the syncing. Another takes over if that GM leaves.
- Syncing needs a GM in the room. Changes made while no GM is connected appear when one joins.

## Development

The extension is plain JavaScript with no build step.

| File | Purpose |
| --- | --- |
| `owlbeartest/background.js` | Sync engine, runs while the room is open |
| `owlbeartest/main.js` | Popover interface |
| `owlbeartest/shared.js` | Metadata keys and logic used by both, covered by tests |
| `owlbeartest/firebase.js` | Firebase connection |

Run the tests with Node 22 or newer:

```
npm test
```

To try it locally, serve the folder that contains this repo, so the paths in `manifest.json` still match, and install `/Durfsheets_Owlbear/owlbeartest/manifest.json` from that server. The server must send CORS headers.

Don't rename `owlbeartest/` or change `PLUGIN_ID` in `shared.js`. Existing installs load the manifest from that URL, and existing tokens store their data under that ID.

GitHub Pages publishes from `main`, so anything merged there goes live for every user.
