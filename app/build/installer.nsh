!include "LogicLib.nsh"

!macro customInstall
  ${If} $LANGUAGE == 1025
    FileOpen $0 "$INSTDIR\installer-lang.json" w
    FileWrite $0 '{"lang":"ar"}'
    FileClose $0
  ${Else}
    FileOpen $0 "$INSTDIR\installer-lang.json" w
    FileWrite $0 '{"lang":"en"}'
    FileClose $0
  ${EndIf}
!macroend
