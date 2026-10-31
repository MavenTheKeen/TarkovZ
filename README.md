# TarkovZ

A second-screen companion app for Escape from Tarkov. It runs as its own window and never touches the game process. It has:

- **Map:** an interactive map with floors, extract and boss names, a raid timer and an extraction guide.
- **Quests:** a quest tracker.
- **Items:** flea and trader prices, plus whether your open quests and hideout upgrades still need an item.
- **Ammo:** a chart of every round by calibre.
- **Hideout:** a station tracker with a shopping list.
- **Barters:** profit for every trader barter.

Ctrl+K jumps to the search box on any screen. On the map, + and − zoom and 0 fits the whole map.

**Game logs (opt-in, Settings → Game logs).** The app can read the text log files Tarkov writes to `<install>\Logs`. It ticks quests as you start and finish them, opens the raid's map when you load in and runs the raid timer. It also has a one-off import of past progress. It never reads or touches the game process. Logs update between raids, and hideout builds and PMC level aren't logged, so you still set those yourself. The parser is `electron/logParser.cjs`, and the watcher is `electron/logWatcher.cjs`.

## Download

Get `TarkovZ-<version>-portable.exe` from the [Releases](../../releases) page and run it. It doesn't need installing. Your progress is saved in `%APPDATA%TarkovZ`, so it stays when you update.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the app with live reload |
| `npm start` | Runs the last production build (`npm run build` first) |
| `npm test` | Runs the unit tests |
| `npm run build` | Typechecks and builds the front end into `dist/` |
| `npm run dist` | Builds the Windows installer and the portable `.exe` into `release/` |
| `npm run dist:portable` | Builds only the portable `.exe`, which runs without installing |

Both `dev` and `start` launch Electron through `scripts/electron.mjs`, which clears `ELECTRON_RUN_AS_NODE`. VS Code sets that variable in its terminals, and Electron crashes on start if it's left set.

## Data

- **Game data:** maps, tasks, items, prices, traders and barters come from `json.tarkov.dev`, the JSON feed the tarkov.dev site reads. It carries the same data as the GraphQL API at `api.tarkov.dev`. All fetching happens in [src/api/](src/api/).
- **Map images and coordinates:** these come from the tarkov.dev site's [maps.json](https://github.com/the-hideout/tarkov-dev/blob/main/src/data/maps.json) (MIT licence) and its map images. Both are fetched at runtime rather than bundled, and each map credits its author.
- **Offline:** every successful fetch is saved to disk under the app's user-data folder. If the network fails, the app uses the saved copy and shows its age.
- **Game mode:** the PvP/PvE switch in the header changes which data set is used. Quest progress is kept separately for each mode.

## Known limits

- An extract's data says what it needs, not whether it's open in your current raid.
- Distances are straight-line estimates that ignore walls and terrain.
- Some quest objectives have no position in the data. They're listed under "No marker" instead of being drawn.
- Flea prices are community-reported snapshots. The fee uses the wiki formula with the fee rates from the feed.
- The installer and portable `.exe` are unsigned, so Windows SmartScreen will warn on first run. The app uses the default Electron icon.
