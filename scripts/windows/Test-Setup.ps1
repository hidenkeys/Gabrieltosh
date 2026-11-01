param([switch]$ParseOnly)
$ErrorActionPreference = 'Stop'
$files = @(Get-ChildItem $PSScriptRoot -Filter '*.ps1') + @(Get-ChildItem (Join-Path $PSScriptRoot '..\..\installer\windows') -Filter '*.ps1')
foreach ($file in $files) {
    $tokens = $null; $errors = $null
    [void][Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw "$($file.Name): $($errors.Message -join '; ')" }
}
if ($ParseOnly) { Write-Host 'All Windows PowerShell scripts parse.'; exit 0 }
if (-not $env:ProgramData) { $env:ProgramData = [IO.Path]::GetTempPath() }
. "$PSScriptRoot\Setup.Core.ps1"
foreach ($address in @('10.0.0.2', '172.16.4.5', '172.31.255.2', '192.168.1.20')) {
    if (-not (Test-PrivateAddress $address)) { throw "Rejected private address $address" }
}
foreach ($address in @('127.0.0.1', '0.0.0.0', '8.8.8.8', '169.254.1.2', '172.32.0.1', '192.168.1.20; calc', '::1')) {
    if (Test-PrivateAddress $address) { throw "Accepted invalid store address $address" }
}
if ((ConvertTo-NativeArgument 'C:\Program Files\Bing Chun\') -ne '"C:\Program Files\Bing Chun\\"') { throw 'Trailing-slash quoting is incorrect.' }
if ((ConvertTo-NativeArgument 'a"b') -ne '"a\"b"') { throw 'Embedded-quote quoting is incorrect.' }
$secret = New-Secret
if ($secret -notmatch '^[a-f0-9]{64}$') { throw 'Generated secret is not 256-bit hex.' }
Write-Host 'PowerShell parse, network validation, argument escaping and secret checks passed.'
