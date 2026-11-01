param([Parameter(Mandatory=$true)][string]$Installer)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$process = Start-Process -FilePath $Installer -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-' -Wait -PassThru
if ($process.ExitCode -notin @(0, 3010)) { throw "Installer exited $($process.ExitCode)" }
$app = Join-Path $env:ProgramFiles 'BingChunPOS'
. (Join-Path $app 'scripts\windows\Setup.Core.ps1')
Assert-Administrator
& (Join-Path $app 'runtime\python\python.exe') -c 'import win32print,win32ui,PIL,cryptography;from playwright.sync_api import sync_playwright;print("Embedded Python ready")'
if ($LASTEXITCODE) { throw 'Embedded Python imports failed.' }
$ip = @(Get-StoreAddresses)[0]
if (-not $ip) { throw 'No private IPv4 adapter for the network setup smoke test.' }
$settings = [pscustomobject]@{
    Address = $ip; DatabasePort = 55432; HttpsPort = 3443; PrintMode = 'simulation'
    ReceiptPrinter = 'Customer Receipt'; LabelPrinter = 'Cup Stickers'; LabelWidth = 50; LabelHeight = 40
}
$password = New-Secret 16
Install-Store $settings 'Windows test administrator' 'admin' $password { param($message) Write-Host $message }
if ((Get-Service BingChunDatabase).StartType -ne 'Automatic') { throw 'Database is not automatic.' }
foreach ($name in @('BingChunDatabase', 'BingChunPOS', 'BingChunWorker')) {
    if ((Get-Service $name).Status -ne 'Running') { throw "$name is not running." }
    $service = Get-CimInstance Win32_Service -Filter "Name='$name'"
    if ($service.StartName -ne 'NT AUTHORITY\LocalService') { throw "$name runs under an unexpected account." }
}
$node = Join-Path $app 'runtime\node\node.exe'
$env:NODE_EXTRA_CA_CERTS = Join-Path $script:StoreRoot 'certs\ca.pem'
$env:SMOKE_PASSWORD = $password
Push-Location $app
try {
    $test = @'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
const config = JSON.parse(readFileSync(process.env.ProgramData + '/BingChunPOS/setup.json'));
const base = `https://localhost:${config.HttpsPort}`;
let r = await fetch(base + '/api/login', {method:'POST',headers:{'Content-Type':'application/json','X-POS-Request':'1'},body:JSON.stringify({username:'admin',password:process.env.SMOKE_PASSWORD})});
assert.equal(r.status,200, await r.text());
const cookie = r.headers.get('set-cookie').split(';')[0];
const headers = {Cookie:cookie,'Content-Type':'application/json','X-POS-Request':'1'};
r = await fetch(base + '/api/products',{headers});
const products = await r.json();assert.equal(products.length,34);
r = await fetch(base + '/api/me',{headers});assert.equal((await r.json()).role,'admin');
// Add one unmistakable test record and verify it survives service restart later.
Object.assign(process.env,parseEnv(readFileSync(process.env.ProgramData + '/BingChunPOS/.env','utf8')));
const {query,pool} = await import('./server/db.js');
await query("INSERT INTO settings(key,value) VALUES('windows_smoke',$1) ON CONFLICT(key) DO UPDATE SET value=$1",[JSON.stringify({persistent:true})]);
await pool.end();console.log('HTTPS login, menu, administrator and database write passed.');
'@
    [void](Invoke-StoreCommand $node @('--input-type=module', '-') $test)
    $check = Request-PrinterCheck 'status'
    if (-not $check.ok) { throw 'Worker account printer enumeration failed.' }
    if (-not $check.rendererReady) { throw 'The worker could not launch the printing renderer.' }
    [void](Invoke-Provision @{ action = 'backup'; envFile = (Join-Path $script:StoreRoot '.env') })
    if (-not (Get-ChildItem (Join-Path $script:StoreRoot 'backups') -Filter '*.enc')) { throw 'No encrypted backup was produced.' }
    Stop-StoreServices
    Start-Service BingChunDatabase; Start-Service BingChunPOS; Start-Service BingChunWorker
    [void](Wait-StoreHealth)
    $persist = @'
import assert from 'node:assert/strict';
import {query,pool} from './server/db.js';
assert.equal((await query("SELECT value FROM settings WHERE key='windows_smoke'")).rows[0].value.persistent,true);
await pool.end();console.log('Database persisted across service restart.');
'@
    [void](Invoke-StoreCommand $node @("--env-file=$(Join-Path $script:StoreRoot '.env')", '--input-type=module', '-') $persist)
    # Repair must preserve the original administrator and database credentials.
    Install-Store $settings '' '' '' { param($message) Write-Host $message }
    [void](Invoke-StoreCommand $node @('--input-type=module', '-') $test)
    $screenshots = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'build\windows\ui'
    [void](Invoke-StoreCommand 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', (Join-Path $app 'scripts\windows\Setup.ps1'), '-Screenshots', $screenshots))
    # Exercise the actual installer's update hook, not only the repair functions.
    $update = Start-Process -FilePath $Installer -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-' -Wait -PassThru
    if ($update.ExitCode -notin @(0, 3010)) { throw 'Installer update failed.' }
    Install-Store $settings '' '' '' { param($message) Write-Host $message }
    [void](Invoke-StoreCommand $node @('--input-type=module', '-') $test)
} finally { Pop-Location; Remove-Item Env:SMOKE_PASSWORD -ErrorAction SilentlyContinue }
Write-Host 'Windows installer, services, HTTPS, login, persistence, encrypted backup and repair smoke tests passed.'
