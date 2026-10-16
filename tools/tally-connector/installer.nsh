; NSIS hooks for electron-builder.
;
; The Windows Service runs on the Node.js that ships inside Electron
; (ELECTRON_RUN_AS_NODE=1), so the PC does NOT need Node.js installed.
; install-service.js is executed by the app's own exe; node-windows then
; records process.execPath (that same exe) as the service executable.

!macro customInstall
  DetailPrint "Registering Syncit Tally Connector Windows Service…"
  System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "1")'
  nsExec::ExecToLog '"$INSTDIR\Syncit Tally Connector.exe" "$INSTDIR\resources\app\src\install-service.js"'
  Pop $0
  System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", n)'
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "Could not register the Syncit background service (code $0). Uninstall, then run the installer again with right-click → Run as administrator."
  ${EndIf}
  ; Auto-start the tray at user login.
  CreateShortCut "$SMSTARTUP\Syncit Tally Connector.lnk" "$INSTDIR\Syncit Tally Connector.exe"
!macroend

!macro customUnInstall
  DetailPrint "Removing Syncit Tally Connector Windows Service…"
  System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "1")'
  nsExec::ExecToLog '"$INSTDIR\Syncit Tally Connector.exe" "$INSTDIR\resources\app\src\uninstall-service.js"'
  System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", n)'
  Delete "$SMSTARTUP\Syncit Tally Connector.lnk"
!macroend
