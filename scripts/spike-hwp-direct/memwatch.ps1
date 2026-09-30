# SPIKE-HWP-DIRECT: prints "<unix ms> <bytes>" = summed working set of a process tree, every ~200 ms.
param([int]$RootPid)
while ($true) {
  $all = Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize
  $kids = @{}; foreach ($p in $all) { if (-not $kids.ContainsKey([int]$p.ParentProcessId)) { $kids[[int]$p.ParentProcessId] = @() }; $kids[[int]$p.ParentProcessId] += $p }
  $sum = 0; $stack = New-Object System.Collections.Stack; $stack.Push($RootPid); $seen = @{}
  $byId = @{}; foreach ($p in $all) { $byId[[int]$p.ProcessId] = $p }
  while ($stack.Count) { $id = $stack.Pop(); if ($seen[$id]) { continue }; $seen[$id] = 1; if ($byId[$id]) { $sum += $byId[$id].WorkingSetSize }; foreach ($c in $kids[$id]) { $stack.Push([int]$c.ProcessId) } }
  [Console]::Out.WriteLine("$([DateTimeOffset]::Now.ToUnixTimeMilliseconds()) $sum"); [Console]::Out.Flush()
  Start-Sleep -Milliseconds 150
}
