# ScriptCat native-messaging-host installer — Windows (doc: workspace/.ref-docs/
# 06-native-host-and-installers.md §5). Never uses Invoke-Expression; every path is quoted.
#
# Usage: .\install.ps1 -ExtensionIds <id1>,<id2> [-Browsers chrome,edge]
#        .\install.ps1 -Rollback

param(
    [string[]]$ExtensionIds,

    [string[]]$Browsers = @("chrome"),

    [switch]$Rollback
)

$ErrorActionPreference = "Stop"

$ConfigDir = Join-Path $env:LOCALAPPDATA "ScriptCat\NativeHost"

# -Rollback re-points each browser's registry entry back at the previous version's manifest file
# (doc 06 §5 "Upgrades": "keep previous version dir for rollback (--rollback restores prior
# manifest)"). Unlike the POSIX installer, Windows manifests live inside the versioned install
# dir (manifest-<browser>.json) rather than at one fixed path per browser, so the previous
# version's manifest was never overwritten by the upgrade — no regeneration needed, just
# re-pointing the registry value. Does not delete the newer version's install dir.
if ($Rollback) {
    $MetadataPath = Join-Path $ConfigDir "install-metadata.json"
    if (-not (Test-Path $MetadataPath)) {
        Write-Error "No install-metadata.json found at $MetadataPath — nothing to roll back."
        exit 1
    }
    $Metadata = Get-Content -Raw $MetadataPath | ConvertFrom-Json
    if (-not $Metadata.previous) {
        Write-Error "No previous version recorded in $MetadataPath — nothing to roll back to."
        exit 1
    }
    $Previous = $Metadata.previous

    $RegistryRootsForRollback = @{
        chrome   = "HKCU:\Software\Google\Chrome\NativeMessagingHosts"
        edge     = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts"
        chromium = "HKCU:\Software\Chromium\NativeMessagingHosts"
        brave    = "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts"
    }
    for ($i = 0; $i -lt $Previous.browsers.Count; $i++) {
        $browser = $Previous.browsers[$i]
        $manifestPath = $Previous.manifests[$i]
        if (-not (Test-Path $manifestPath)) {
            Write-Error "Previous manifest missing at $manifestPath — cannot roll back for $browser."
            exit 1
        }
        $keyPath = "$($RegistryRootsForRollback[$browser])\com.scriptcat.native_host"
        New-Item -Path $keyPath -Force | Out-Null
        Set-ItemProperty -Path $keyPath -Name "(default)" -Value $manifestPath
        Write-Host "Restored ${browser}: $manifestPath -> $($Previous.launcher)"
    }

    $RolledBackMetadata = @{
        version     = $Previous.version
        installDir  = $Previous.installDir
        launcher    = $Previous.launcher
        manifests   = $Previous.manifests
        browsers    = $Previous.browsers
        installedAt = (Get-Date -Format "o")
    }
    ($RolledBackMetadata | ConvertTo-Json -Depth 5) | Set-Content -Path $MetadataPath -Encoding UTF8

    Write-Host "Rolled back to ScriptCat native host $($Previous.version)"
    exit 0
}

if (-not $ExtensionIds -or $ExtensionIds.Count -eq 0) {
    Write-Error "-ExtensionIds <id1>,<id2>,... is required (unless -Rollback)."
    exit 1
}

foreach ($id in $ExtensionIds) {
    if ($id -notmatch '^[a-p]{32}$') {
        Write-Error "Invalid extension ID: $id (must be exactly 32 characters, each a-p)."
        exit 1
    }
}

$PackageRoot = Split-Path -Parent $PSScriptRoot
$PackageJsonPath = Join-Path $PackageRoot "package.json"
$Version = (Get-Content -Raw $PackageJsonPath | ConvertFrom-Json).version

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

# A re-run of the SAME version (e.g. re-registering a browser) is not an upgrade and must not
# overwrite an already-recorded `previous`.
$MetadataPath = Join-Path $ConfigDir "install-metadata.json"
$Previous = $null
if (Test-Path $MetadataPath) {
    $ExistingMetadata = Get-Content -Raw $MetadataPath | ConvertFrom-Json
    if ($ExistingMetadata.version -ne $Version) {
        $Previous = @{
            version    = $ExistingMetadata.version
            installDir = $ExistingMetadata.installDir
            launcher   = $ExistingMetadata.launcher
            manifests  = $ExistingMetadata.manifests
            browsers   = $ExistingMetadata.browsers
        }
    }
}

$Metadata = @{
    version     = $Version
    installDir  = $InstallDir
    launcher    = $Launcher
    manifests   = $InstalledManifests
    browsers    = $Browsers
    installedAt = (Get-Date -Format "o")
}
if ($Previous) {
    $Metadata.previous = $Previous
}
($Metadata | ConvertTo-Json -Depth 5) | Set-Content -Path $MetadataPath -Encoding UTF8

Write-Host "Installed ScriptCat native host $Version to $InstallDir"
Write-Host "Run 'node $HostJs --doctor' to verify."
