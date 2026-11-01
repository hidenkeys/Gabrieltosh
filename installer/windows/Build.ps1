param([string]$Version = '0.2.0', [string]$Iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe")
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:OS -ne 'Windows_NT') { throw 'Build on 64-bit Windows so runtime dependencies match the target.' }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Use a three-part numeric installer version.' }
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo
$build = Join-Path $repo 'build\windows'
$app = Join-Path $build 'app'
$cache = Join-Path $build 'downloads'
$runtime = Join-Path $app 'runtime'
if (Test-Path $app) { Remove-Item $app -Recurse -Force }
[void](New-Item -ItemType Directory -Force $app, $cache, $runtime)
$sources = New-Object Collections.Generic.List[object]
function Fetch([string]$Url, [string]$Name, [string]$Sha256 = '') {
    $path = Join-Path $cache $Name
    if (-not (Test-Path $path)) { Invoke-WebRequest $Url -OutFile $path -UseBasicParsing }
    $hash = (Get-FileHash $path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($Sha256 -and $hash -ne $Sha256.ToLowerInvariant()) { Remove-Item $path; throw "Checksum mismatch: $Name" }
    $sources.Add([pscustomobject]@{ file = $Name; url = $Url; sha256 = $hash })
    return $path
}
function Checked([scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) { throw 'A native build command failed.' }
}
Checked { npm ci }
Checked { npm run build }
Copy-Item 'dist', 'server', 'scripts', 'docs', 'public' $app -Recurse
Copy-Item 'package.json', 'package-lock.json', 'README.md' $app
Checked { npm ci --omit=dev --prefix $app }

# Official portable Node runtime; verify against Node's published SHA256 list.
$nodeVersion = (& node -p 'process.version').Trim()
$nodeName = "node-$nodeVersion-win-x64.zip"
$sums = (Invoke-WebRequest "https://nodejs.org/dist/$nodeVersion/SHASUMS256.txt" -UseBasicParsing).Content
$line = @($sums -split "`n" | Where-Object { $_ -match "  $([regex]::Escape($nodeName))\s*$" })
if ($line.Count -ne 1) { throw 'Could not find the Node Windows checksum.' }
$nodeZip = Fetch "https://nodejs.org/dist/$nodeVersion/$nodeName" $nodeName (($line[0] -split '\s+')[0])
Expand-Archive $nodeZip (Join-Path $cache 'node') -Force
Move-Item (Join-Path $cache "node\node-$nodeVersion-win-x64") (Join-Path $runtime 'node')

# EDB publishes Windows binary archives specifically for application installers.
$pgVersion = '17.11-1'
$pgZip = Fetch "https://get.enterprisedb.com/postgresql/postgresql-$pgVersion-windows-x64-binaries.zip" "postgresql-$pgVersion.zip"
Expand-Archive $pgZip (Join-Path $cache 'pg') -Force
$pg = Join-Path $runtime 'postgres'
[void](New-Item -ItemType Directory -Force $pg)
foreach ($folder in @('bin', 'lib', 'share')) { Copy-Item (Join-Path $cache "pg\pgsql\$folder") $pg -Recurse }
Get-ChildItem (Join-Path $cache 'pg\pgsql') -File | Copy-Item -Destination $pg

# Embedded CPython plus wheel-only printing dependencies, no global Python install.
$pythonVersion = (& python -c 'import platform;print(platform.python_version())').Trim()
if ($pythonVersion -notmatch '^3\.13\.') { throw 'Use Python 3.13 x64 to build the printing runtime.' }
$pythonZip = Fetch "https://www.python.org/ftp/python/$pythonVersion/python-$pythonVersion-embed-amd64.zip" "python-$pythonVersion.zip"
$python = Join-Path $runtime 'python'
Expand-Archive $pythonZip $python -Force
$site = Join-Path $python 'Lib\site-packages'
Checked { python -m pip install --only-binary=:all: --target $site -r installer/windows/requirements.txt }
@'
python313.zip
.
Lib\site-packages
Lib\site-packages\win32
Lib\site-packages\win32\lib
Lib\site-packages\Pythonwin
import site
'@ | Set-Content (Join-Path $python 'python313._pth') -Encoding ascii
Get-ChildItem (Join-Path $site 'pywin32_system32') -Filter '*.dll' | Copy-Item -Destination $python
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $runtime 'browsers'
Checked { & (Join-Path $python 'python.exe') -m playwright install chromium }
Checked { & (Join-Path $python 'python.exe') -c 'import win32print,win32ui,PIL,cryptography;from playwright.sync_api import sync_playwright;print("Printing imports ready")' }
Checked { & (Join-Path $python 'python.exe') 'installer/windows/Test-Certificates.py' }

$winsw = Fetch 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe' 'WinSW-2.12.0-x64.exe'
Copy-Item $winsw (Join-Path $runtime 'WinSW.exe')
$winswLicense = Fetch 'https://raw.githubusercontent.com/winsw/winsw/v2.12.0/LICENSE.txt' 'WinSW-LICENSE.txt'
Copy-Item $winswLicense $runtime
$vc = Fetch 'https://aka.ms/vs/17/release/vc_redist.x64.exe' 'vc_redist.x64.exe'
$signature = Get-AuthenticodeSignature $vc
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') { throw 'The Microsoft runtime installer signature is invalid.' }
Copy-Item $vc $runtime
$vcVersion = (Get-Item $vc).VersionInfo

$files = @(Get-ChildItem $app -Recurse -File | ForEach-Object {
    [pscustomobject]@{ path = $_.FullName.Substring($app.Length + 1).Replace('\', '/'); sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
})
$manifest = [ordered]@{
    version = $Version; commit = (& git rev-parse HEAD).Trim(); builtAt = [DateTime]::UtcNow.ToString('o')
    architecture = 'windows-x64'; postgres = $pgVersion; node = $nodeVersion; python = $pythonVersion
    visualCpp = $vcVersion.FileVersion
    downloads = @($sources.ToArray()); files = $files
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $app 'bundle-manifest.json') -Encoding utf8
if (-not (Test-Path $Iscc)) { throw 'Install Inno Setup 6, or pass -Iscc with the compiler path.' }
Checked { & $Iscc "/DPackageVersion=$Version" "/DSourceRoot=$app" "/DVCMajor=$($vcVersion.FileMajorPart)" "/DVCMinor=$($vcVersion.FileMinorPart)" "/DVCBuild=$($vcVersion.FileBuildPart)" "/DVCRbld=$($vcVersion.FilePrivatePart)" 'installer/windows/BingChun.iss' }
Get-ChildItem (Join-Path $build 'output') -Filter '*.exe' | ForEach-Object {
    "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant())  $($_.Name)" | Set-Content ($_.FullName + '.sha256') -Encoding ascii
}
Write-Host "Windows installer built in $build\output"
