param([switch]$Diagnostics, [string]$Screenshots = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
. "$PSScriptRoot\Setup.Core.ps1"
try { Assert-Administrator } catch {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -STA -File `"$PSCommandPath`""
    if ($Diagnostics) { $arguments += ' -Diagnostics' }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments
    exit
}
$saved = Get-StoreConfiguration
$form = New-Object Windows.Forms.Form
$form.Text = 'Bing Chun | Store setup'
$form.Size = New-Object Drawing.Size(960, 760)
$form.MinimumSize = $form.Size
$form.StartPosition = 'CenterScreen'
$form.BackColor = [Drawing.Color]::FromArgb(255, 253, 248)
$form.Font = New-Object Drawing.Font('Segoe UI', 10)

function Add-Text($Parent, [string]$Text, [int]$X, [int]$Y, [int]$Width = 800, [int]$Height = 50) {
    $label = New-Object Windows.Forms.Label
    $label.Text = $Text; $label.Location = New-Object Drawing.Point($X, $Y)
    $label.Size = New-Object Drawing.Size($Width, $Height)
    $Parent.Controls.Add($label)
    return $label
}
function Add-Input($Parent, [string]$Label, [int]$Y, [string]$Value = '', [bool]$Secret = $false) {
    [void](Add-Text $Parent $Label 24 $Y 250 25)
    $box = New-Object Windows.Forms.TextBox
    $box.Location = New-Object Drawing.Point(290, $Y)
    $box.Size = New-Object Drawing.Size(460, 28)
    $box.Text = $Value; $box.UseSystemPasswordChar = $Secret
    $Parent.Controls.Add($box); return $box
}
function Add-Button($Parent, [string]$Text, [int]$X, [int]$Y, [scriptblock]$Action, [int]$Width = 210) {
    $button = New-Object Windows.Forms.Button
    $button.Text = $Text; $button.Location = New-Object Drawing.Point($X, $Y)
    $button.Size = New-Object Drawing.Size($Width, 38)
    $button.Add_Click($Action); $Parent.Controls.Add($button); return $button
}
function Add-Combo($Parent, [string]$Label, [int]$Y) {
    [void](Add-Text $Parent $Label 24 $Y 250 25)
    $combo = New-Object Windows.Forms.ComboBox
    $combo.Location = New-Object Drawing.Point(290, $Y)
    $combo.Size = New-Object Drawing.Size(530, 28)
    $combo.DropDownStyle = 'DropDownList'
    $Parent.Controls.Add($combo); return $combo
}
function Show-SetupError($ErrorRecord) {
    $message = $ErrorRecord.Exception.Message
    $status.Text = $message
    [void][Windows.Forms.MessageBox]::Show($message, 'Setup needs attention', 'OK', 'Error')
}

$title = Add-Text $form 'BING CHUN / SURULERE' 26 20 870 36
$title.Font = New-Object Drawing.Font('Segoe UI', 20, [Drawing.FontStyle]::Bold)
$title.ForeColor = [Drawing.Color]::FromArgb(21, 88, 201)
[void](Add-Text $form 'One store computer. Your menu, orders and printers, all on the local network.' 28 67 870 28)
$tabs = New-Object Windows.Forms.TabControl
$tabs.Location = New-Object Drawing.Point(24, 112)
$tabs.Size = New-Object Drawing.Size(896, 490)
$form.Controls.Add($tabs)
$form.Add_FormClosing({ param($sender, $eventArgs) if ($install -and -not $install.Enabled) { $eventArgs.Cancel = $true } })
$pages = @()
foreach ($name in @('1  Database & login', '2  Store network', '3  Printers', '4  Test & finish')) {
    $page = New-Object Windows.Forms.TabPage
    $page.Text = $name; $page.BackColor = $form.BackColor
    $tabs.TabPages.Add($page); $pages += $page
}

[void](Add-Text $pages[0] 'The database is installed on THIS Windows computer. Tablets connect to it through the app; no online database is required.' 24 24 800 55)
[void](Add-Text $pages[0] "Store data: $script:StoreRoot`nOrders and backups are preserved when updating or uninstalling the application." 24 90 810 55)
$dbPort = Add-Input $pages[0] 'Local database port' 160 $(if ($saved) { [string]$saved.DatabasePort } else { '55432' })
$dbPort.ReadOnly = [bool]$saved
$adminName = Add-Input $pages[0] 'Administrator name' 210 'Store administrator'
$adminUser = Add-Input $pages[0] 'Administrator username' 252 'admin'
$adminPass = Add-Input $pages[0] 'Password (10+ characters)' 294 '' $true
$confirm = Add-Input $pages[0] 'Confirm password' 336 '' $true
if ($saved) {
    foreach ($control in @($adminName, $adminUser, $adminPass, $confirm)) { $control.Enabled = $false }
    [void](Add-Text $pages[0] 'Existing users and passwords will be kept. This wizard never resets an existing administrator.' 24 390 800 45)
}

[void](Add-Text $pages[1] 'Choose this computer''s address on the store Wi-Fi/router. Reserve that address in the router so it does not change. Tablets must be on the same network, with guest isolation disabled.' 24 24 810 70)
$address = Add-Combo $pages[1] 'Windows LAN address' 115
foreach ($ip in (Get-StoreAddresses)) { [void]$address.Items.Add($ip) }
if ($saved -and $address.Items.Contains($saved.Address)) { $address.SelectedItem = $saved.Address }
elseif ($address.Items.Count) { $address.SelectedIndex = 0 }
$httpsPort = Add-Input $pages[1] 'Tablet HTTPS port' 165 $(if ($saved) { [string]$saved.HttpsPort } else { '3443' })
[void](Add-Text $pages[1] 'Setup creates a store-only certificate authority and trusts it on Windows. Copy only Store-Tablet-CA.cer to each Android tablet and install it under Security > Encryption & credentials > Install a certificate > CA certificate (wording varies by device).' 24 220 810 85)
[void](Add-Text $pages[1] 'Windows network profile must be Private. Setup opens only the selected HTTPS port to the local subnet. It does not open the database port or configure internet port forwarding.' 24 315 810 60)
[void](Add-Button $pages[1] 'Open network settings' 24 390 { Start-Process 'ms-settings:network-status' })

[void](Add-Text $pages[2] 'Connect both printers to this computer by USB. Install the matching Xprinter drivers, print Windows test pages, set the receipt roll width and calibrate the sticker gap before enabling physical printing.' 24 20 810 65)
$mode = Add-Combo $pages[2] 'Printing mode' 100
[void]$mode.Items.Add('Simulation - no paper used'); [void]$mode.Items.Add('Windows - physical printing')
$mode.SelectedIndex = $(if ($saved -and $saved.PrintMode -eq 'windows') { 1 } else { 0 })
$receipt = Add-Combo $pages[2] 'XP-58IIH / receipt queue' 150
$label = Add-Combo $pages[2] 'XP-235B / sticker queue' 200
function Refresh-Printers {
    $oldReceipt = $receipt.Text; $oldLabel = $label.Text
    $receipt.Items.Clear(); $label.Items.Clear()
    foreach ($printer in @(Get-Printer -ErrorAction SilentlyContinue | Sort-Object Name)) {
        [void]$receipt.Items.Add($printer.Name); [void]$label.Items.Add($printer.Name)
    }
    foreach ($pair in @(@($receipt, $oldReceipt, 'Customer Receipt'), @($label, $oldLabel, 'Cup Stickers'))) {
        if ($pair[0].Items.Contains($pair[1])) { $pair[0].SelectedItem = $pair[1] }
        elseif ($pair[0].Items.Contains($pair[2])) { $pair[0].SelectedItem = $pair[2] }
    }
}
Refresh-Printers
if ($saved) { $receipt.SelectedItem = $saved.ReceiptPrinter; $label.SelectedItem = $saved.LabelPrinter }
$labelWidth = Add-Input $pages[2] 'Sticker width (mm)' 250 $(if ($saved) { [string]$saved.LabelWidth } else { '50' })
$labelHeight = Add-Input $pages[2] 'Sticker height (mm)' 292 $(if ($saved) { [string]$saved.LabelHeight } else { '40' })
[void](Add-Text $pages[2] 'Measure the actual labels. Setup applies these dimensions to order labels and test output. Set the same sizes in Windows printer preferences.' 24 335 810 45)
[void](Add-Button $pages[2] 'Refresh printers' 24 395 { Refresh-Printers } 175)
[void](Add-Button $pages[2] 'Windows printers' 215 395 { Start-Process 'ms-settings:printers' } 175)
[void](Add-Button $pages[2] 'Official Xprinter drivers' 405 395 { Start-Process 'https://www.xprinter.net/' } 220)

$summary = Add-Text $pages[3] 'Apply setup first, then run checks here. Printer checks use the actual background worker account. Test pages are marked NOT A SALE.' 24 24 810 60
$results = New-Object Windows.Forms.TextBox
$results.Location = New-Object Drawing.Point(24, 190); $results.Size = New-Object Drawing.Size(810, 230)
$results.Multiline = $true; $results.ReadOnly = $true; $results.ScrollBars = 'Vertical'
$pages[3].Controls.Add($results)

function Set-Busy([bool]$Busy) {
    $install.Enabled = -not $Busy; $back.Enabled = -not $Busy; $next.Enabled = -not $Busy
    $check.Enabled = -not $Busy; $testReceipt.Enabled = -not $Busy; $testLabel.Enabled = -not $Busy
    $form.UseWaitCursor = $Busy
}
function Run-Check([string]$Kind) {
    Set-Busy $true
    try {
        if ($Kind -eq 'status') {
            $configuration = Get-StoreConfiguration
            if (-not $configuration) { throw 'Apply setup first.' }
            $text = @()
            foreach ($name in @('BingChunDatabase', 'BingChunPOS', 'BingChunWorker')) { $text += "$name`: $((Get-Service $name).Status)" }
            [void](Wait-StoreHealth)
            $data = Request-PrinterCheck 'status'
            $text += 'Database and local application: connected'
            $text += 'Printing renderer: ready under worker service account'
            $text += "Worker-visible printers: $($data.printers -join ', ')"
            $text += "Admin: https://localhost:$($configuration.HttpsPort)"
            $text += "Tablets: https://$($configuration.Address):$($configuration.HttpsPort)"
            $text += "Printing mode: $($configuration.PrintMode)"
            $text += 'Next: open the tablet address on a second device and test a sale.'
            $results.Text = $text -join "`r`n"
        } else {
            $answer = [Windows.Forms.MessageBox]::Show('This submits one physical test to the configured printer, even in simulation mode. Continue?', 'Print installation test', 'YesNo', 'Question')
            if ($answer -ne 'Yes') { return }
            [void](Request-PrinterCheck $Kind ([double]$labelWidth.Text) ([double]$labelHeight.Text))
            $results.Text = 'Test submitted by the worker service. Check the actual paper or sticker before continuing. Spooler acceptance does not confirm physical output.'
        }
    } catch { Show-SetupError $_ } finally { Set-Busy $false }
}
$check = Add-Button $pages[3] 'Check services & printers' 24 100 { Run-Check 'status' } 250
$testReceipt = Add-Button $pages[3] 'Print test receipt' 290 100 { Run-Check 'receipt' } 220
$testLabel = Add-Button $pages[3] 'Print test sticker' 525 100 { Run-Check 'label' } 220
[void](Add-Button $pages[3] 'Open POS' 24 145 {
    $configuration = Get-StoreConfiguration
    if ($configuration) { Start-Process "https://localhost:$($configuration.HttpsPort)" }
} 180)
[void](Add-Button $pages[3] 'Tablet certificate' 220 145 { Start-Process explorer.exe (Join-Path $script:StoreRoot 'tablet') } 180)
[void](Add-Button $pages[3] 'Logs & backups' 415 145 { Start-Process explorer.exe $script:StoreRoot } 180)
[void](Add-Button $pages[3] 'Save recovery key' 610 145 {
    try {
        $dialog = New-Object Windows.Forms.SaveFileDialog
        $dialog.Filter = 'Recovery key (*.txt)|*.txt'; $dialog.FileName = 'BingChun-Recovery-Key.txt'
        $dialog.Title = 'Save the recovery key to a separate secure device'
        if ($dialog.ShowDialog() -eq 'OK') {
            Export-RecoveryKey $dialog.FileName
            [void][Windows.Forms.MessageBox]::Show('Recovery key saved. Keep it separate from this computer and restrict access to it.', 'Backup recovery')
        }
        $dialog.Dispose()
    } catch { Show-SetupError $_ }
} 220)

$status = Add-Text $form 'Review each tab, then select Apply setup. Your database stays on this computer.' 28 614 870 45
$back = Add-Button $form 'Back' 26 665 { if ($tabs.SelectedIndex -gt 0) { $tabs.SelectedIndex-- } } 100
$next = Add-Button $form 'Next' 140 665 { if ($tabs.SelectedIndex -lt 3) { $tabs.SelectedIndex++ } } 100
$install = Add-Button $form 'Apply setup' 690 660 {
    Set-Busy $true
    try {
        if (-not $saved -and $adminPass.Text -ne $confirm.Text) { throw 'The administrator passwords do not match.' }
        $settings = [pscustomobject]@{
            Address = $address.Text; DatabasePort = [int]$dbPort.Text; HttpsPort = [int]$httpsPort.Text
            PrintMode = $(if ($mode.SelectedIndex -eq 1) { 'windows' } else { 'simulation' })
            ReceiptPrinter = $receipt.Text; LabelPrinter = $label.Text
            LabelWidth = [double]$labelWidth.Text; LabelHeight = [double]$labelHeight.Text
        }
        Install-Store $settings $adminName.Text $adminUser.Text $adminPass.Text {
            param($message)
            $status.Text = $message
            [Windows.Forms.Application]::DoEvents()
        }
        $script:saved = Get-StoreConfiguration
        $adminPass.Clear(); $confirm.Clear()
        foreach ($control in @($adminName, $adminUser, $adminPass, $confirm)) { $control.Enabled = $false }
        $summary.Text = "Ready. Admin: https://localhost:$($settings.HttpsPort)`r`nTablets: https://$($settings.Address):$($settings.HttpsPort) (install the tablet CA certificate first)."
        $tabs.SelectedIndex = 3
    } catch { Show-SetupError $_ } finally { Set-Busy $false }
} 225
$install.BackColor = [Drawing.Color]::FromArgb(47, 125, 246)
$install.ForeColor = [Drawing.Color]::White
$install.FlatStyle = 'Flat'
if ($Diagnostics) { $tabs.SelectedIndex = 3 }
if ($Screenshots) {
    [void](New-Item -ItemType Directory -Force $Screenshots)
    $form.Show()
    for ($i = 0; $i -lt $pages.Count; $i++) {
        $tabs.SelectedIndex = $i
        [Windows.Forms.Application]::DoEvents()
        $bitmap = New-Object Drawing.Bitmap($form.Width, $form.Height)
        $form.DrawToBitmap($bitmap, (New-Object Drawing.Rectangle(0, 0, $form.Width, $form.Height)))
        $bitmap.Save((Join-Path $Screenshots "setup-$($i + 1).png"))
        $bitmap.Dispose()
    }
    $form.Close(); exit
}
[void]$form.ShowDialog()
