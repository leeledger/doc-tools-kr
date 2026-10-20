# FORM1020 D12: opens one HWP in the installed 한글 through COM automation (HWPFrame.HwpObject) and reports, as one
# JSON line: open (bool), pages (한글's own page count), version. Writes 한글's text of the document to <hwp>.txt
# (UTF-8) and, with -Pdf, 한글's own PDF of it (for a visual compare). From handoff/sources/form1020/open.ps1.
# Only a 한글 process this script started is ever used, quit or reported: the Hwp PIDs are recorded before the COM
# object is made, and exactly one new PID must appear (written to -PidFile, the only process the caller may end). If
# none or several appear (the COM object joined a 한글 the owner opened, or the owner opened one meanwhile), the script
# touches nothing: it releases the object without Clear/Quit and reports open=false.
param([Parameter(Mandatory = $true)][string]$Path, [string]$Pdf = '', [string]$PidFile = '')
$ErrorActionPreference = 'Stop'
$before = @(Get-Process Hwp -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
$h = New-Object -ComObject HWPFrame.HwpObject
$new = @(Get-Process Hwp -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id } | ForEach-Object { $_.Id })
if ($new.Count -ne 1) {
  $null = [Runtime.InteropServices.Marshal]::ReleaseComObject($h)
  [pscustomobject]@{ open = $false; pages = 0; version = ''; error = "not our own Hwp process ($($new.Count) new); nothing touched" } | ConvertTo-Json -Compress
  exit 0
}
if ($PidFile) { [IO.File]::WriteAllText($PidFile, [string]$new[0]) }
try {
  $null = $h.RegisterModule('FilePathCheckDLL', 'FilePathCheckerModule')
  $h.XHwpWindows.Item(0).Visible = $false
  $ok = $h.Open($Path, '', 'forceopen:true')
  $pages = if ($ok) { $h.PageCount } else { 0 }
  if ($ok) {
    $t = $h.GetTextFile('UNICODE', '')
    [IO.File]::WriteAllText("$Path.txt", [string]$t, [Text.UTF8Encoding]::new($false))
    if ($Pdf) { $null = $h.SaveAs($Pdf, 'PDF', '') }
  }
  [pscustomobject]@{ open = [bool]$ok; pages = [int]$pages; version = [string]$h.Version } | ConvertTo-Json -Compress
} finally {
  $h.Clear(1)
  $h.Quit()
}
