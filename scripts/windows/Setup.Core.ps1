# Shared by the graphical wizard, maintenance shortcuts and Windows smoke tests.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:AppRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$script:StoreRoot = Join-Path $env:ProgramData 'BingChunPOS'
$script:ServiceNames = @('BingChunWorker', 'BingChunPOS', 'BingChunDatabase')

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Open Bing Chun Setup as administrator.'
    }
}

function ConvertTo-NativeArgument([string]$Value) {
    # CommandLineToArgvW escaping, including embedded quotes and trailing slashes.
    return '"' + [regex]::Replace([regex]::Replace($Value, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1') + '"'
}

function Invoke-StoreCommand([string]$File, [string[]]$Arguments, [string]$InputText = '', [int]$TimeoutSeconds = 180) {
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $File
    $info.Arguments = ($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' '
    $info.WorkingDirectory = $script:AppRoot
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
    $info.StandardErrorEncoding = New-Object Text.UTF8Encoding($false)
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        # StandardInputEncoding is absent in Windows PowerShell 5.1/.NET Framework.
        # Write UTF-8 bytes directly so names/passwords survive every system locale.
        $inputBytes = [Text.Encoding]::UTF8.GetBytes($InputText)
        $process.StandardInput.BaseStream.Write($inputBytes, 0, $inputBytes.Length)
        $process.StandardInput.BaseStream.Close()
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            $process.Kill()
            throw 'A setup command timed out. Open diagnostics before retrying.'
        }
        $out = $stdout.GetAwaiter().GetResult()
        $err = $stderr.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) { throw "Setup command failed ($([IO.Path]::GetFileName($File))): $err $out" }
        return $out.Trim()
    } finally { $process.Dispose() }
}

function Invoke-Provision([hashtable]$Values) {
    $node = Join-Path $script:AppRoot 'runtime\node\node.exe'
    $output = Invoke-StoreCommand $node @('scripts/windows/provision.js') ($Values | ConvertTo-Json -Compress)
    return $output | ConvertFrom-Json
}

function New-Secret([int]$Bytes = 32) {
    $buffer = New-Object byte[] $Bytes
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($buffer)).Replace('-', '').ToLowerInvariant()
}

function Set-PrivateDirectory([string]$Path) {
    [void](New-Item -ItemType Directory -Force -Path $Path)
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @('S-1-5-18', 'S-1-5-32-544')) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule(
            (New-Object Security.Principal.SecurityIdentifier($sid)), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Grant-ServicePath([string]$Path, [string]$Service, [string]$Rights, [bool]$Directory = $true) {
    $account = New-Object Security.Principal.NTAccount("NT SERVICE\$Service")
    $sid = $account.Translate([Security.Principal.SecurityIdentifier])
    $acl = Get-Acl -LiteralPath $Path
    if ($Directory) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, $Rights, 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    } else {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, $Rights, 'Allow')
    }
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Write-PrivateText([string]$Path, [string]$Text) {
    [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding($false)))
}

function Get-StoreConfiguration {
    $path = Join-Path $script:StoreRoot 'setup.json'
    if (Test-Path $path) { return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json }
    return $null
}

function Get-StoreAddresses {
    return @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
        $_.AddressState -eq 'Preferred' -and (Test-PrivateAddress $_.IPAddress)
    } | Select-Object -ExpandProperty IPAddress -Unique)
}

function Grant-WorkerPrinter([string]$Name) {
    if (-not $Name) { return }
    $printer = @(Get-Printer -Full | Where-Object { $_.Name -eq $Name })
    if (-not $printer.Count) { return }
    if (-not $printer[0].PermissionSDDL) { throw "Could not read permissions for $Name. Check the installed driver and printer Security settings." }
    $sid = (New-Object Security.Principal.NTAccount('NT SERVICE\BingChunWorker')).Translate([Security.Principal.SecurityIdentifier])
    $descriptor = New-Object Security.AccessControl.CommonSecurityDescriptor($false, $false, $printer[0].PermissionSDDL)
    $descriptor.DiscretionaryAcl.AddAccess([Security.AccessControl.AccessControlType]::Allow, $sid, 0x00020008,
        [Security.AccessControl.InheritanceFlags]::None, [Security.AccessControl.PropagationFlags]::None)
    Set-Printer -InputObject $printer[0] -PermissionSDDL $descriptor.GetSddlForm([Security.AccessControl.AccessControlSections]::All)
}

function Test-PrivateAddress([string]$Address) {
    $ip = $null
    if (-not [Net.IPAddress]::TryParse($Address, [ref]$ip)) { return $false }
    if ($ip.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) { return $false }
    $b = $ip.GetAddressBytes()
    return $b[0] -eq 10 -or ($b[0] -eq 172 -and $b[1] -ge 16 -and $b[1] -le 31) -or ($b[0] -eq 192 -and $b[1] -eq 168)
}

function Assert-StoreSettings($Settings) {
    if (-not (Test-PrivateAddress $Settings.Address)) { throw 'Select a private store-network IPv4 address.' }
    if ($Settings.Address -notin (Get-StoreAddresses)) { throw 'That address is not assigned to this computer. Reserve its current address in the router, then select it here.' }
    foreach ($port in @($Settings.DatabasePort, $Settings.HttpsPort)) {
        if ($port -lt 1024 -or $port -gt 65535) { throw 'Ports must be between 1024 and 65535.' }
    }
    if (@($Settings.DatabasePort, $Settings.HttpsPort, 3001 | Select-Object -Unique).Count -ne 3) { throw 'Database, tablet HTTPS and local HTTP ports must differ.' }
    if ($Settings.PrintMode -notin @('simulation', 'windows')) { throw 'Choose simulation or Windows printing.' }
    if ($Settings.PrintMode -eq 'windows') {
        $printers = @(Get-Printer | Select-Object -ExpandProperty Name)
        if ($Settings.ReceiptPrinter -notin $printers -or $Settings.LabelPrinter -notin $printers) { throw 'Install both printer drivers, then select their queues.' }
        if ($Settings.ReceiptPrinter -eq $Settings.LabelPrinter) { throw 'Choose separate receipt and sticker printer queues.' }
    }
    if ([double]::IsNaN($Settings.LabelWidth) -or [double]::IsNaN($Settings.LabelHeight) -or $Settings.LabelWidth -lt 20 -or $Settings.LabelWidth -gt 60 -or $Settings.LabelHeight -lt 15 -or $Settings.LabelHeight -gt 150) { throw 'Label width must be 20-60 mm and height 15-150 mm.' }
    $saved = Get-StoreConfiguration
    if ($saved -and $saved.DatabasePort -ne $Settings.DatabasePort) { throw 'Changing an existing database port requires a separate migration. Keep the original database port.' }
    if (-not $saved) {
        foreach ($port in @($Settings.DatabasePort, $Settings.HttpsPort, 3001)) {
            if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw "Port $port is already in use. Select another available port or resolve the conflict." }
        }
    }
}

function Stop-StoreServices {
    foreach ($name in $script:ServiceNames) {
        $service = Get-Service -Name $name -ErrorAction SilentlyContinue
        if ($service -and $service.Status -ne 'Stopped') {
            Stop-Service -Name $name -Force
            (Get-Service $name).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(60))
        }
    }
}

function Install-StoreService([string]$Name, [string]$Executable, [string]$Arguments, [string]$Dependency = '') {
    $folder = Join-Path $script:AppRoot 'services'
    [void](New-Item -ItemType Directory -Force $folder)
    $wrapper = Join-Path $folder "$Name.exe"
    Copy-Item -LiteralPath (Join-Path $script:AppRoot 'runtime\WinSW.exe') -Destination $wrapper -Force
    $xml = @"
<service>
  <id>$Name</id><name>$Name</name><description>Bing Chun Surulere local store</description>
  <executable>$([Security.SecurityElement]::Escape($Executable))</executable>
  <arguments>$([Security.SecurityElement]::Escape($Arguments))</arguments>
  <workingdirectory>$([Security.SecurityElement]::Escape($script:AppRoot))</workingdirectory>
  <startmode>Automatic</startmode><onfailure action="restart" delay="10 sec"/>
  <logpath>$([Security.SecurityElement]::Escape((Join-Path $script:StoreRoot "logs\$Name")))</logpath>
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>5</keepFiles></log>
  <stoptimeout>45 sec</stoptimeout>
  <env name="PLAYWRIGHT_BROWSERS_PATH" value="$([Security.SecurityElement]::Escape((Join-Path $script:AppRoot 'runtime\browsers')))"/>
</service>
"@
    Write-PrivateText (Join-Path $folder "$Name.xml") $xml
    if (-not (Get-Service $Name -ErrorAction SilentlyContinue)) { [void](Invoke-StoreCommand $wrapper @('install')) }
    # LocalService has no administrator privileges. Service SID gives each process
    # its own filesystem access rather than granting all services access to store data.
    [void](Invoke-StoreCommand 'sc.exe' @('config', $Name, 'obj=', 'NT AUTHORITY\LocalService', 'password=', ''))
    [void](Invoke-StoreCommand 'sc.exe' @('sidtype', $Name, 'unrestricted'))
    if ($Dependency) { [void](Invoke-StoreCommand 'sc.exe' @('config', $Name, 'depend=', $Dependency)) }
    Set-PrivateDirectory (Join-Path $script:StoreRoot "logs\$Name")
    Grant-ServicePath (Join-Path $script:StoreRoot "logs\$Name") $Name 'Modify'
    Grant-ServicePath $script:StoreRoot $Name 'ReadAndExecute' $false
}

function Wait-StoreHealth([int]$Port = 3001) {
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $health = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
            if ($health.ok) { return $health }
        } catch { }
        Start-Sleep -Milliseconds 1000
    }
    throw 'The application did not become ready. Open Check system and inspect the service logs.'
}

function Update-Environment([hashtable]$Values) {
    $path = Join-Path $script:StoreRoot '.env'
    $lines = @()
    if (Test-Path $path) {
        $lines = @(Get-Content $path | Where-Object { $_ -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)=' -or -not $Values.ContainsKey($Matches[1]) })
    }
    foreach ($key in ($Values.Keys | Sort-Object)) {
        $value = [string]$Values[$key]
        if ($value.Contains('"') -or $value.Contains("`n") -or $value.Contains("`r")) { throw "Invalid configuration value for $key." }
        $lines += "$key=`"$value`""
    }
    Write-PrivateText $path (($lines -join "`n") + "`n")
    return $path
}

function Install-Store($Settings, [string]$AdminName, [string]$AdminUsername, [string]$AdminPassword, [scriptblock]$Progress = {}) {
    Assert-Administrator
    Assert-StoreSettings $Settings
    $saved = Get-StoreConfiguration
    if (-not $saved -and ($AdminPassword.Length -lt 10 -or -not $AdminName.Trim() -or $AdminUsername -notmatch '^[a-zA-Z0-9_.-]{1,80}$')) {
        throw 'Enter an administrator name, username and password of at least 10 characters.'
    }
    foreach ($required in @('runtime\postgres\bin\initdb.exe', 'runtime\node\node.exe', 'runtime\python\python.exe', 'runtime\WinSW.exe', 'dist\index.html')) {
        if (-not (Test-Path (Join-Path $script:AppRoot $required))) { throw "The installation package is incomplete: $required" }
    }
    & $Progress 'Stopping services and checking the saved database...'
    $envFile = Join-Path $script:StoreRoot '.env'
    if ($saved -and (Get-Service BingChunDatabase -ErrorAction SilentlyContinue)) {
        Stop-Service BingChunWorker -ErrorAction SilentlyContinue
        Stop-Service BingChunPOS -ErrorAction SilentlyContinue
        Start-Service BingChunDatabase
        [void](Invoke-Provision @{ action = 'backup'; envFile = $envFile })
    }
    Stop-StoreServices
    Set-PrivateDirectory $script:StoreRoot
    foreach ($folder in @('database', 'certs', 'backups', 'print-output', 'diagnostics', 'logs')) { Set-PrivateDirectory (Join-Path $script:StoreRoot $folder) }
    $dbRoot = Join-Path $script:StoreRoot 'database'
    $pgBin = Join-Path $script:AppRoot 'runtime\postgres\bin'
    $dbSecrets = Join-Path $script:StoreRoot 'database-admin.json'
    if (-not (Test-Path $dbSecrets)) { Write-PrivateText $dbSecrets (@{ password = (New-Secret) } | ConvertTo-Json) }
    $dbPassword = (Get-Content $dbSecrets -Raw | ConvertFrom-Json).password
    if (-not (Test-Path (Join-Path $dbRoot 'PG_VERSION'))) {
        & $Progress 'Creating the local PostgreSQL database...'
        $pwfile = Join-Path $script:StoreRoot 'init-password.tmp'
        try {
            Write-PrivateText $pwfile $dbPassword
            [void](Invoke-StoreCommand (Join-Path $pgBin 'initdb.exe') @('-D', $dbRoot, '-U', 'postgres', '--encoding=UTF8', '--locale=C', '--auth=scram-sha-256', '--pwfile', $pwfile))
        } finally { Remove-Item $pwfile -Force -ErrorAction SilentlyContinue }
    }
    $major = (Get-Content (Join-Path $dbRoot 'PG_VERSION') -Raw).Trim()
    if ($major -ne '17') { throw 'This package supports PostgreSQL 17 data. A different major version requires a database migration.' }
    Write-PrivateText (Join-Path $dbRoot 'postgresql.auto.conf') "listen_addresses = '127.0.0.1'`nport = $($Settings.DatabasePort)`npassword_encryption = 'scram-sha-256'`n"
    Install-StoreService 'BingChunDatabase' (Join-Path $pgBin 'postgres.exe') "-D $(ConvertTo-NativeArgument $dbRoot)"
    Grant-ServicePath $dbRoot 'BingChunDatabase' 'Modify'
    Start-Service BingChunDatabase
    $credentials = Join-Path $script:StoreRoot 'database-app.json'
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            [void](Invoke-Provision @{ action = 'database'; port = [int]$Settings.DatabasePort; password = $dbPassword; credentialsFile = $credentials })
            $ready = $true; break
        } catch { if ($i -eq 29) { throw }; Start-Sleep -Seconds 1 }
    }
    if (-not $ready) { throw 'The database service did not become ready.' }
    $appPassword = (Get-Content $credentials -Raw | ConvertFrom-Json).password
    & $Progress 'Creating HTTPS certificates for this computer and the tablets...'
    $python = Join-Path $script:AppRoot 'runtime\python\python.exe'
    $certs = Join-Path $script:StoreRoot 'certs'
    [void](Invoke-StoreCommand $python @('scripts/windows/certificates.py', $certs, $Settings.Address, $env:COMPUTERNAME))
    $ca = Import-Certificate -FilePath (Join-Path $certs 'Store-Tablet-CA.cer') -CertStoreLocation 'Cert:\LocalMachine\Root'
    $tabletFolder = Join-Path $script:StoreRoot 'tablet'
    [void](New-Item -ItemType Directory -Force $tabletFolder)
    Copy-Item (Join-Path $certs 'Store-Tablet-CA.cer') $tabletFolder -Force
    Write-PrivateText (Join-Path $tabletFolder 'connection.json') (@{ HttpsPort = $Settings.HttpsPort; Address = $Settings.Address } | ConvertTo-Json)
    # This public certificate is the only file staff need to copy onto tablets.
    $users = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545')
    $acl = Get-Acl $tabletFolder
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($users, 'ReadAndExecute', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    Set-Acl $tabletFolder $acl
    $values = @{
        NODE_ENV = 'production'; DATABASE_URL = "postgres://bingchun_app:$appPassword@127.0.0.1:$($Settings.DatabasePort)/bingchun"
        HOST = '127.0.0.1'; PORT = '3001'; HTTPS_HOST = '0.0.0.0'; HTTPS_PORT = $Settings.HttpsPort
        ADMIN_ALLOW_REMOTE = 'false'; COOKIE_SECURE = 'true'; PUBLIC_ORIGIN = "https://$($Settings.Address):$($Settings.HttpsPort)"
        POS_DATA_DIR = $script:StoreRoot; PRINT_PYTHON = $python; PG_DUMP_PATH = (Join-Path $pgBin 'pg_dump.exe')
        TLS_CERT_PATH = (Join-Path $certs 'store.pem'); TLS_KEY_PATH = (Join-Path $certs 'store-key.pem')
        PRINT_MODE = $Settings.PrintMode; RECEIPT_PRINTER = $Settings.ReceiptPrinter; LABEL_PRINTER = $Settings.LabelPrinter
    }
    if (-not (Test-Path $envFile)) { $values.BACKUP_ENCRYPTION_KEY = New-Secret; $values.BACKUP_INTERVAL_HOURS = '6'; $values.BACKUP_RETENTION_DAYS = '14' }
    $envFile = Update-Environment $values
    & $Progress 'Loading the menu and creating the administrator account...'
    [void](Invoke-Provision @{ action = 'bootstrap'; envFile = $envFile; name = $AdminName; username = $AdminUsername; password = $AdminPassword; labelWidth = $Settings.LabelWidth; labelHeight = $Settings.LabelHeight })
    $node = Join-Path $script:AppRoot 'runtime\node\node.exe'
    Install-StoreService 'BingChunPOS' $node "--env-file=$(ConvertTo-NativeArgument $envFile) server/index.js" 'BingChunDatabase'
    Install-StoreService 'BingChunWorker' $node "--env-file=$(ConvertTo-NativeArgument $envFile) server/worker.js" 'BingChunDatabase/Spooler'
    foreach ($name in @('BingChunPOS', 'BingChunWorker')) { Grant-ServicePath $envFile $name 'Read' $false }
    Grant-ServicePath $certs 'BingChunPOS' 'ReadAndExecute' $false
    foreach ($file in @('store.pem', 'store-key.pem')) { Grant-ServicePath (Join-Path $certs $file) 'BingChunPOS' 'Read' $false }
    foreach ($folder in @('backups', 'print-output', 'diagnostics')) { Grant-ServicePath (Join-Path $script:StoreRoot $folder) 'BingChunWorker' 'Modify' }
    Grant-WorkerPrinter $Settings.ReceiptPrinter
    Grant-WorkerPrinter $Settings.LabelPrinter
    & $Progress 'Allowing tablet access on the private local network...'
    Get-NetFirewallRule -Name 'BingChunPOS-TabletHTTPS' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -Name 'BingChunPOS-TabletHTTPS' -DisplayName 'Bing Chun tablet HTTPS' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Settings.HttpsPort -LocalAddress $Settings.Address -Profile Private -RemoteAddress LocalSubnet | Out-Null
    $Settings | Add-Member -NotePropertyName CaThumbprint -NotePropertyValue $ca.Thumbprint -Force
    $Settings | Add-Member -NotePropertyName InstalledAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
    Write-PrivateText (Join-Path $script:StoreRoot 'setup.json') ($Settings | ConvertTo-Json)
    Start-Service BingChunPOS
    Start-Service BingChunWorker
    [void](Wait-StoreHealth)
    & $Progress 'Ready. Open the POS locally and run the printer checks.'
}

function Request-PrinterCheck([string]$Kind, [double]$Width = 50, [double]$Height = 40) {
    if ($Kind -notin @('status', 'receipt', 'label')) { throw 'Unknown printer check.' }
    if ((Get-Service BingChunWorker).Status -ne 'Running') { throw 'The print worker is not running. Apply setup first.' }
    $id = [Guid]::NewGuid().ToString()
    $folder = Join-Path $script:StoreRoot 'diagnostics'
    $request = Join-Path $folder "$id.request.json"
    $temporary = Join-Path $folder "$id.tmp"
    Write-PrivateText $temporary (@{ kind = $Kind; width = $Width; height = $Height } | ConvertTo-Json)
    Move-Item $temporary $request
    $result = Join-Path $folder "$id.result.json"
    for ($i = 0; $i -lt 130; $i++) {
        if (Test-Path $result) {
            $data = Get-Content $result -Raw | ConvertFrom-Json
            if (-not $data.ok) { throw $data.error }
            return $data
        }
        if ('System.Windows.Forms.Application' -as [type]) { [Windows.Forms.Application]::DoEvents() }
        Start-Sleep -Milliseconds 1000
    }
    throw 'The print check timed out. Inspect physical output before trying again.'
}

function Export-RecoveryKey([string]$Destination) {
    Assert-Administrator
    $lines = Get-Content (Join-Path $script:StoreRoot '.env')
    $key = @($lines | Where-Object { $_ -match '^BACKUP_ENCRYPTION_KEY=' })
    if ($key.Count -ne 1) { throw 'A unique backup encryption key was not found. Check the saved configuration.' }
    $secret = ($key[0] -split '=', 2)[1].Trim().Trim('"').Trim("'")
    if ($secret -notmatch '^[a-fA-F0-9]{64}$') { throw 'The backup encryption key is invalid.' }
    Write-PrivateText $Destination "BING CHUN SURULERE - BACKUP RECOVERY KEY`r`nKeep this file securely on a separate offline device. It can decrypt store backups.`r`nBACKUP_ENCRYPTION_KEY=$secret`r`n"
}
