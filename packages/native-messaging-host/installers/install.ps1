# ScriptCat native-messaging-host installer — Windows (doc: workspace/.ref-docs/
# 06-native-host-and-installers.md §5). Never uses Invoke-Expression; every path is quoted.
#
# Usage: .\install.ps1 -ExtensionIds <id1>,<id2> [-Browsers chrome,edge]

param(
    [Parameter(Mandatory = $true)]
    [string[]]$ExtensionIds,

    [string[]]$Browsers = @("chrome")
)

$ErrorActionPreference = "Stop"

foreach ($id in $ExtensionIds) {
    if ($id -notmatch '^[a-p]{32}$') {
        Write-Error "Invalid extension ID: $id (must be exactly 32 characters, each a-p)."
        exit 1
    }
}

$PackageRoot = Split-Path -Parent $PSScriptRoot
$PackageJsonPath = Join-Path $PackageRoot "package.json"
$Version = (Get-Content -Raw $PackageJsonPath | ConvertFrom-Json).version

$ConfigDir = Join-Path $env:LOCALAPPDATA "ScriptCat\NativeHost"
$InstallDir = Join-Path $ConfigDir $Version

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Path (Join-Path $PackageRoot "dist\*") -Destination $InstallDir -Recurse -Force

# Restrict the config dir to the current user only (doc 04 §8 permission requirements — the
# Windows equivalent of chmod 0700).
icacls "$ConfigDir" /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" | Out-Null

# Pin the resolved node binary's absolute path in a launcher, rather than trusting whatever
# "node" resolves to on the browser's PATH at connectNative time (PATH-hijack guard, doc 06 §6).
$NodeCommand = Get-Command node -ErrorAction Stop
$NodePath = $NodeCommand.Source
$Launcher = Join-Path $InstallDir "launch-host.cmd"
$HostJs = Join-Path $InstallDir "host.js"
Set-Content -Path $Launcher -Value "@echo off`r`n`"$NodePath`" `"$HostJs`" %*`r`n" -Encoding ASCII

$ManifestArgs = @("--print-manifest", "--host-path", $Launcher)
foreach ($id in $ExtensionIds) {
    $ManifestArgs += @("--extension-id", $id)
}
$ManifestJson = & $NodePath $HostJs @ManifestArgs
if ($LASTEXITCODE -ne 0) {
    Write-Error "Manifest generation failed."
    exit 1
}

# doc 04 §3 defense in depth: the host re-verifies the caller origin against its own config,
# never trusting the registry-registered manifest's allowed_origins alone.
$HostConfigPath = Join-Path $ConfigDir "config.json"
$ExistingConfig = if (Test-Path $HostConfigPath) { Get-Content -Raw $HostConfigPath | ConvertFrom-Json } else { @{ allowedOrigins = @() } }
$NewOrigins = $ExtensionIds | ForEach-Object { "chrome-extension://$_/" }
$AllOrigins = @($ExistingConfig.allowedOrigins) + $NewOrigins | Select-Object -Unique
$ExistingConfig | Add-Member -NotePropertyName allowedOrigins -NotePropertyValue $AllOrigins -Force
($ExistingConfig | ConvertTo-Json -Depth 5) | Set-Content -Path $HostConfigPath -Encoding UTF8

$RegistryRoots = @{
    chrome   = "HKCU:\Software\Google\Chrome\NativeMessagingHosts"
    edge     = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts"
    chromium = "HKCU:\Software\Chromium\NativeMessagingHosts"
    brave    = "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts"
}

$InstalledManifests = @()
foreach ($browser in $Browsers) {
    $registryRoot = $RegistryRoots[$browser]
    if (-not $registryRoot) {
        Write-Error "Unknown browser: $browser (expected chrome, edge, chromium, or brave)"
        exit 1
    }

    $manifestPath = Join-Path $InstallDir "manifest-$browser.json"
    $tmpPath = "$manifestPath.tmp"
    Set-Content -Path $tmpPath -Value $ManifestJson -Encoding UTF8 -NoNewline
    Move-Item -Path $tmpPath -Destination $manifestPath -Force

    # Verify: re-read and parse before registering.
    $reread = Get-Content -Raw $manifestPath | ConvertFrom-Json
    if (-not $reread.name) {
        Write-Error "Manifest verification failed for $manifestPath"
        exit 1
    }

    $keyPath = "$registryRoot\com.scriptcat.native_host"
    New-Item -Path $keyPath -Force | Out-Null
    Set-ItemProperty -Path $keyPath -Name "(default)" -Value $manifestPath

    $InstalledManifests += $manifestPath
    Write-Host "Registered for ${browser}: $manifestPath"
}

$Metadata = @{
    version     = $Version
    installDir  = $InstallDir
    launcher    = $Launcher
    manifests   = $InstalledManifests
    browsers    = $Browsers
    installedAt = (Get-Date -Format "o")
}
($Metadata | ConvertTo-Json -Depth 5) | Set-Content -Path (Join-Path $ConfigDir "install-metadata.json") -Encoding UTF8

Write-Host "Installed ScriptCat native host $Version to $InstallDir"
Write-Host "Run 'node $HostJs --doctor' to verify."
