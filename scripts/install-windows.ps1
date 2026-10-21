# Run from an elevated PowerShell after following docs/WINDOWS-SETUP.md.
# Requires a trusted WinSW executable downloaded separately from its official releases.
param([Parameter(Mandatory=$true)][string]$WinSWPath)
$ErrorActionPreference = 'Stop'
$StoreRoot = Split-Path $PSScriptRoot -Parent
$NodePath = (Get-Command node).Source
if (-not (Test-Path "$StoreRoot\.env")) { throw 'Create .env before installing services.' }
if (-not (Test-Path "$StoreRoot\dist\index.html")) { throw 'Run npm run build first.' }
$Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$Principal = New-Object Security.Principal.WindowsPrincipal($Identity)
if (-not $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run PowerShell as Administrator.' }
foreach ($Entry in @(@{Name='BingChunPOS';File='server/index.js'},@{Name='BingChunWorker';File='server/worker.js'})) {
  $Exe = "$PSScriptRoot\$($Entry.Name).exe"
  Copy-Item -LiteralPath $WinSWPath -Destination $Exe
  $EscapedRoot = [Security.SecurityElement]::Escape($StoreRoot)
  $EscapedNode = [Security.SecurityElement]::Escape($NodePath)
  @"
<service>
 <id>$($Entry.Name)</id><name>$($Entry.Name)</name>
 <description>Bing Chun local store workspace</description>
 <executable>$EscapedNode</executable>
 <arguments>--env-file=.env $($Entry.File)</arguments>
 <workingdirectory>$EscapedRoot</workingdirectory>
 <startmode>Automatic</startmode>
 <onfailure action="restart" delay="10 sec"/>
 <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>5</keepFiles></log>
 <stoptimeout>30 sec</stoptimeout>
</service>
"@ | Set-Content -Encoding UTF8 "$PSScriptRoot\$($Entry.Name).xml"
  & $Exe install
  if ($LASTEXITCODE -ne 0) { throw "Could not install $($Entry.Name)." }
  & $Exe start
}
Write-Host 'Services installed. Review service-account permissions, TLS, firewall and printer access before trading.'
