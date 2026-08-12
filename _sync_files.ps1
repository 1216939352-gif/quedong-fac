param(
  [Parameter(Mandatory=$true)][string[]]$Pairs
)

foreach ($p in $Pairs) {
  $parts = $p -split '\|'
  $src = $parts[0]
  $dst = $parts[1]
  if (!(Test-Path $src)) { Write-Host "MISS $src"; continue }
  $dir = Split-Path $dst -Parent
  if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  try {
    $tmp = "$dst.new"
    Copy-Item -Path $src -Destination $tmp -Force
    Move-Item -Path $tmp -Destination $dst -Force
    Write-Host "OK   $p"
  } catch {
    try {
      Copy-Item -Path $src -Destination $dst -Force
      Write-Host "OVR  $p"
    } catch {
      Write-Host "FAIL $p : $($_.Exception.Message)"
    }
  }
}