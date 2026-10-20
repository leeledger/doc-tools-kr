param([string]$p)
$h = New-Object -ComObject HWPFrame.HwpObject
try {
  $null = $h.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
  $ok = $h.Open($p, "", "forceopen:true")
  "open=$ok pages=$($h.PageCount)"
  $t = $h.GetTextFile("UNICODE", "")
  [IO.File]::WriteAllText("$p.txt", $t, [Text.Encoding]::UTF8)
} finally { $h.Clear(1); $h.Quit() }
