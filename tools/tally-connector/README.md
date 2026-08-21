# SynWorks Tally Connector

Windows Service + tray app that bridges a Tally installation (XML/HTTP on
`localhost:9000`) to the SynWorks cloud. Same pattern as Tally's own BI
Connector: runs on the machine where Tally is open, pushes ledger +
voucher + stock snapshots to `/api/sync/tally` on the deployment.

## Layout

```
tools/tally-connector/
├── src/
│   ├── sync-core.mjs        # Pure sync engine (also used by CLI)
│   ├── service.js           # Daemon: HTTP on 127.0.0.1:9876 + timer
│   ├── install-service.js   # node-windows install
│   ├── uninstall-service.js # node-windows uninstall
│   ├── main.js              # Electron main: tray + settings window
│   ├── preload.js
│   ├── renderer/settings.html
│   └── config.js            # %ProgramData%\SynWorks\config.json
├── assets/                  # icon.ico, iconTemplate.png (add before build)
├── installer.nsh            # NSIS hooks (registers service, adds Startup shortcut)
├── package.json
└── README.md
```

## Prerequisites (on the Windows machine)

1. Tally.ERP9 or Prime installed.
2. In Tally: **F12 Configure → Advanced → Allow ODBC/HTTP = Yes**, port 9000 (default). Keep Tally open with the target company loaded.
3. **Node.js 18+ LTS** installed and on PATH (the installer shells out to `node.exe` to register the Windows Service). Download from <https://nodejs.org>.

## Build the installer (from macOS or Windows)

```bash
cd tools/tally-connector
npm install
# Drop icon.ico + iconTemplate.png into assets/ first (see assets/README.txt)
npm run dist            # → dist/SynWorks Tally Connector Setup <version>.exe (NSIS)
# or:
npm run dist:portable   # → dist/SynWorks Tally Connector <version>.exe (portable, no install)
```

`electron-builder` can cross-build a Windows installer from macOS.
It will download the Windows Electron distribution on first run.

The output installer is **unsigned** — Windows SmartScreen will show
"Unknown publisher" the first time. Fine for a pilot. For wider rollout,
add a code-signing cert (DigiCert / Sectigo, ~$100–300/yr) and set
`CSC_LINK` + `CSC_KEY_PASSWORD` env vars before `npm run dist`.

## Install on a target machine

1. Copy the produced `SynWorks Tally Connector Setup <version>.exe` to the machine.
2. Right-click → **Run as administrator** (needed to register the service).
3. On first launch, right-click the tray icon → **Settings…**
4. Enter:
   - **SynWorks URL** — e.g. `https://synworks.example.com`
   - **Sync Secret** — must match `TALLY_SYNC_SECRET` on the deployment
   - Tally host/port (defaults are `localhost:9000`)
   - Sync interval in minutes (default 15; 0 = manual only)
5. Click **Save**, then **Sync Now** to verify.

## Uninstall

Windows Settings → Apps → SynWorks Tally Connector → Uninstall.
The NSIS uninstaller removes the Windows Service and the Startup shortcut.
`%ProgramData%\SynWorks\` is left in place (config + logs); delete
manually if you want a clean removal.

## Files on disk (Windows)

| Path | Purpose |
|------|---------|
| `%ProgramData%\SynWorks\config.json` | Editable settings |
| `%ProgramData%\SynWorks\state.json`  | Last-sync summary |
| `%ProgramData%\SynWorks\connector.log` | Rolling log (tray → Open Log) |

## Development

Run the daemon in a terminal (no service registration) and the tray
against it:

```bash
# Terminal 1
npm run service      # starts HTTP on 127.0.0.1:9876

# Terminal 2
npm start            # Electron tray (works on macOS/Linux for dev too)
```

Config file lives at `~/.synworks-connector/config.json` on non-Windows.

## Architecture

```
Tally desktop
├── Tally.exe (XML on localhost:9000)
└── SynWorks Tally Connector
    ├── SynWorksConnectorService  (Windows Service, LocalSystem)
    │    ├── sync loop (every intervalMinutes)
    │    └── HTTP 127.0.0.1:9876   ← tray talks to this
    └── SynWorks Connector.exe    (Electron tray, per-user, Startup)
         └── tray menu + Settings window
```

The tray never touches Tally or the cloud directly — it only reads/writes
config and pokes the service. So the service can keep syncing even when
no user is logged in (subject to Tally being open; if Tally requires a
logged-in session, run it as a service too, or rely on the tray user
staying signed in).

## Sanity checks after install

- `sc query "SynWorks Tally Connector"` → should show `RUNNING`
- `curl http://127.0.0.1:9876/health` → `{"ok":true}`
- Web dashboard `/import` page → last-sync timestamp updates after first successful run
