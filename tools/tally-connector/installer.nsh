; NSIS hooks for electron-builder.
;
; Prerequisite (documented in README): Node.js 18+ LTS must be installed on
; the machine so `node.exe` is on PATH. We shell out to it once during
; install to register the Windows Service via node-windows.

!macro customInstall
  DetailPrint "Registering PayTrack Tally Connector Windows Service…"
  nsExec::ExecToLog 'cmd /C "node "$INSTDIR\resources\app\src\install-service.js""'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "Could not register the Windows Service. Ensure Node.js 18+ is installed and on PATH, then run 'node install-service.js' from an admin command prompt."
  ${EndIf}
  ; Auto-start the tray at user login.
  CreateShortCut "$SMSTARTUP\PayTrack Tally Connector.lnk" "$INSTDIR\PayTrack Tally Connector.exe"
!macroend

!macro customUnInstall
  DetailPrint "Removing PayTrack Tally Connector Windows Service…"
  nsExec::ExecToLog 'cmd /C "node "$INSTDIR\resources\app\src\uninstall-service.js""'
  Delete "$SMSTARTUP\PayTrack Tally Connector.lnk"
!macroend
