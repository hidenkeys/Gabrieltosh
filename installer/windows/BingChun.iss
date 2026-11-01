#ifndef PackageVersion
  #define PackageVersion "0.2.0"
#endif
#ifndef SourceRoot
  #define SourceRoot "..\..\build\windows\app"
#endif
#ifndef VCMajor
  #define VCMajor 14
  #define VCMinor 44
  #define VCBuild 35211
  #define VCRbld 0
#endif
[Setup]
AppId={{97701B93-8D04-46B6-82EC-9216955FA99A}
AppName=Bing Chun Surulere POS
AppVersion={#PackageVersion}
AppPublisher=Bing Chun Surulere
DefaultDirName={autopf}\BingChunPOS
DisableDirPage=yes
DefaultGroupName=Bing Chun POS
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir=..\..\build\windows\output
OutputBaseFilename=BingChun-Setup-{#PackageVersion}-x64
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
SetupLogging=yes
CloseApplications=no
UninstallDisplayName=Bing Chun Surulere POS (store data preserved)
InfoBeforeFile=INSTALL-NOTES.txt

[Files]
Source: "{#SourceRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{commondesktop}\Bing Chun POS"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\windows\Maintenance.ps1"" -Action Open"
Name: "{group}\Open POS"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\windows\Maintenance.ps1"" -Action Open"
Name: "{group}\Store setup"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File ""{app}\scripts\windows\Setup.ps1"""
Name: "{group}\Check system and printers"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File ""{app}\scripts\windows\Setup.ps1"" -Diagnostics"
Name: "{group}\Back up now"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\windows\Maintenance.ps1"" -Action Backup"
Name: "{group}\Installation guide"; Filename: "{app}\docs\WINDOWS-INSTALLER.md"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File ""{app}\scripts\windows\Setup.ps1"""; Description: "Configure database, network and printers"; Flags: postinstall nowait skipifsilent; Check: CanConfigure

[UninstallDelete]
Type: filesandordirs; Name: "{app}\services"

[Code]
var
  VCRuntimeNeedsRestart: Boolean;

function VCRuntimeInstalled: Boolean;
var Installed, Major, Minor, Bld, Rbld: Cardinal; Key: String;
begin
  Key := 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64';
  Result := RegQueryDWordValue(HKLM64, Key, 'Installed', Installed) and (Installed = 1)
    and RegQueryDWordValue(HKLM64, Key, 'Major', Major)
    and RegQueryDWordValue(HKLM64, Key, 'Minor', Minor)
    and RegQueryDWordValue(HKLM64, Key, 'Bld', Bld)
    and RegQueryDWordValue(HKLM64, Key, 'Rbld', Rbld);
  if Result then
    Result := (Major > {#VCMajor}) or ((Major = {#VCMajor}) and
      ((Minor > {#VCMinor}) or ((Minor = {#VCMinor}) and
      ((Bld > {#VCBuild}) or ((Bld = {#VCBuild}) and (Rbld >= {#VCRbld}))))));
end;

procedure CurStepChanged(CurStep: TSetupStep);
var Code: Integer;
begin
  if (CurStep = ssPostInstall) and not VCRuntimeInstalled then begin
    if not Exec(ExpandConstant('{app}\runtime\vc_redist.x64.exe'), '/install /quiet /norestart', '', SW_HIDE, ewWaitUntilTerminated, Code) then
      RaiseException('Could not start the Microsoft runtime installer. Run setup again before opening the POS.');
    if Code = 3010 then VCRuntimeNeedsRestart := True
    else if (Code <> 0) and (Code <> 1638) then
      RaiseException('Microsoft runtime installation failed (' + IntToStr(Code) + '). Run setup again before configuring the store.');
  end;
end;

function NeedRestart: Boolean;
begin
  Result := VCRuntimeNeedsRestart;
end;

function CanConfigure: Boolean;
begin
  Result := not VCRuntimeNeedsRestart;
end;

function RunMaintenance(Action: String): Boolean;
var ExitCode: Integer; Script: String;
begin
  Script := ExpandConstant('{app}\scripts\windows\Maintenance.ps1');
  Result := True;
  if FileExists(Script) then
    Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      '-NoProfile -ExecutionPolicy Bypass -File "' + Script + '" -Action ' + Action,
      ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ExitCode) and (ExitCode = 0);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if not RunMaintenance('BeforeUpdate') then
    Result := 'Could not back up or stop the existing store services. Open Check system before retrying. Store data has not been replaced.';
end;

function InitializeUninstall: Boolean;
begin
  Result := RunMaintenance('Uninstall');
  if not Result then
    MsgBox('The store services could not be removed. Application files and store data have been kept. Check the Windows service logs.', mbError, MB_OK);
end;
