; Fox MD used to ship under the visible product name "md-reader". Tauri's
; NSIS installer identifies an existing install by that visible name, so the
; rename would otherwise leave two Add/Remove Programs entries and two app
; directories. Migrate the old per-user NSIS install before copying Fox MD.
;
; /UPDATE tells the old uninstaller to preserve application data, while /S
; keeps the migration inside the new installer flow.
!macro NSIS_HOOK_PREINSTALL
  ClearErrors
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\md-reader" "UninstallString"
  ${If} $R0 != ""
    ExecWait '$R0 /S /UPDATE' $R1
    ${If} ${Errors}
      MessageBox MB_ICONSTOP "Fox MD could not start the previous md-reader uninstaller. Close md-reader and try again."
      Abort
    ${ElseIf} $R1 != 0
      MessageBox MB_ICONSTOP "Fox MD could not finish upgrading the previous md-reader installation. Close md-reader and try again."
      Abort
    ${EndIf}
  ${EndIf}
  ClearErrors
!macroend
