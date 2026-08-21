' run-hidden.vbs - launch a console program with no visible window.
'
' Task Scheduler runs its actions as the logged-on user, in that user's own
' session, so `node src\mailTick.js` opens a REAL console window once an hour:
' a blank terminal that appears, does a second of work and vanishes. Nothing is
' wrong with it, and it is indistinguishable from something being wrong with it.
'
' wscript.exe has no console of its own, so launching the child from here with
' window style 0 leaves nothing on screen at all. Two properties are deliberate:
' it WAITS for the child, so the task's -ExecutionTimeLimit and
' -MultipleInstances IgnoreNew still mean something; and it exits with the
' child's own code, so LastTaskResult keeps reporting mailTick.js's documented
' 0 / 1 / 2 instead of always 0.
'
' Usage:  wscript //nologo run-hidden.vbs <exe> [args...]

Option Explicit

Dim sh, cmd, i

If WScript.Arguments.Count < 1 Then
  ' 87 = ERROR_INVALID_PARAMETER, so a mis-registered task says so in its history
  WScript.Quit 87
End If

cmd = """" & WScript.Arguments(0) & """"
For i = 1 To WScript.Arguments.Count - 1
  cmd = cmd & " """ & WScript.Arguments(i) & """"
Next

Set sh = CreateObject("WScript.Shell")
WScript.Quit sh.Run(cmd, 0, True)
