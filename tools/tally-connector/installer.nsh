; NSIS hooks for electron-builder.
;
; Prerequisite (documented in README): Node.js 18+ LTS must be installed on
; the machine so `node.exe` is on PATH. We shell out to it once during
; install to register the Windows Service via node-windows.
;
; install-service.js verifies the registration itself and exits non-zero if
; the service is not left running, so a failure here is a real failure — do
; not swallow it. MessageBox is suppressed under /S (a silent install must
; not block on a modal); SetErrorLevel is what a scripted caller sees.

!macro customInstall
  DetailPrint "Registering Syncit Tally Connector Windows Service…"
  nsExec::ExecToLog 'cmd /C "node "$INSTDIR\resources\app\src\install-service.js""'
  Pop $0
  ${If} $0 != 0
    DetailPrint "Service registration FAILED (exit code $0)."
    ${IfNot} ${Silent}
      MessageBox MB_OK|MB_ICONEXCLAMATION "Could not register the Windows Service (exit code $0).$\n$\nEnsure Node.js 18+ is installed and on PATH, then run:$\n    node install-service.js$\nfrom an admin command prompt in:$\n    $INSTDIR\resources\app\src"
    ${EndIf}
    SetErrorLevel 1
  ${Else}
    DetailPrint "Service registered, started and healthy."
  ${EndIf}
  ; Auto-start the tray at user login.
  CreateShortCut "$SMSTARTUP\Syncit Tally Connector.lnk" "$INSTDIR\Syncit Tally Connector.exe"
!macroend

!macro customUnInstall
  DetailPrint "Removing Syncit Tally Connector Windows Service…"
  nsExec::ExecToLog 'cmd /C "node "$INSTDIR\resources\app\src\uninstall-service.js""'
  Pop $0
  ${If} $0 != 0
    ; Leaving the registration behind is what causes the next install to
    ; register a stale binPath, so make the failure visible rather than
    ; silently moving on.
    DetailPrint "Service removal FAILED (exit code $0) - the registration may be orphaned."
    ${IfNot} ${Silent}
      MessageBox MB_OK|MB_ICONEXCLAMATION "Could not remove the Windows Service (exit code $0).$\n$\nRun:$\n    sc delete syncittallyconnector.exe$\nfrom an admin command prompt before reinstalling."
    ${EndIf}
    SetErrorLevel 1
  ${EndIf}
  Delete "$SMSTARTUP\Syncit Tally Connector.lnk"
!macroend
