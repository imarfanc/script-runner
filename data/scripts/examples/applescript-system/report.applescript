set valuesToSquare to {2, 4, 6, 8}
set reportLines to {"AppleScript language report", "", "VALUE    SQUARED", "─────    ───────"}

repeat with valueToSquare in valuesToSquare
  set valueNumber to valueToSquare as integer
  set end of reportLines to (valueNumber as text) & "        " & ((valueNumber * valueNumber) as text)
end repeat

set newlineText to "
"
set AppleScript's text item delimiters to newlineText
set reportText to reportLines as text
set AppleScript's text item delimiters to ""
return reportText
