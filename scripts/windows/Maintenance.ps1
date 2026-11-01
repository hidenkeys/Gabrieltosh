param([ValidateSet('Open', 'Backup', 'BeforeUpdate', 'Uninstall')][string]$Action = 'Open')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\Setup.Core.ps1"
try {
    if ($Action -eq 'Open') {
        $connection = Join-Path $script:StoreRoot 'tablet\connection.json'
        if (-not (Test-Path $connection)) {
            Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -STA -File `"$PSScriptRoot\Setup.ps1`""
            exit 0
        }
        $configuration = Get-Content $connection -Raw | ConvertFrom-Json
        Start-Process "https://localhost:$($configuration.HttpsPort)"
        exit 0
    }
    try { Assert-Administrator } catch {
        $process = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Action $Action"
        exit $process.ExitCode
    }
    $configuration = Get-StoreConfiguration
    if ($Action -eq 'Backup') {
        [void](Invoke-Provision @{ action = 'backup'; envFile = (Join-Path $script:StoreRoot '.env') })
        Start-Process explorer.exe (Join-Path $script:StoreRoot 'backups')
    } elseif ($Action -eq 'BeforeUpdate') {
        if ($configuration -and (Get-Service BingChunDatabase -ErrorAction SilentlyContinue)) {
            $major = (Get-Content (Join-Path $script:StoreRoot 'database\PG_VERSION') -Raw).Trim()
            if ($major -ne '17') { throw 'A database major-version migration is required before updating.' }
            Stop-Service BingChunWorker -ErrorAction SilentlyContinue
            Stop-Service BingChunPOS -ErrorAction SilentlyContinue
            Start-Service BingChunDatabase
            [void](Invoke-Provision @{ action = 'backup'; envFile = (Join-Path $script:StoreRoot '.env') })
        }
        Stop-StoreServices
    } elseif ($Action -eq 'Uninstall') {
        Stop-StoreServices
        foreach ($name in $script:ServiceNames) {
            if (Get-Service $name -ErrorAction SilentlyContinue) {
                [void](Invoke-StoreCommand (Join-Path $script:AppRoot "services\$name.exe") @('uninstall'))
            }
        }
        Get-NetFirewallRule -Name 'BingChunPOS-TabletHTTPS' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
        # Preserve the database, credentials, CA and encryption key for reinstall/recovery.
        Write-Host "Application services removed. Store data is preserved at $script:StoreRoot."
    }
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
