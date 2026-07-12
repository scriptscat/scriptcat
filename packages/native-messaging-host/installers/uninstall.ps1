# ScriptCat native-messaging-host uninstaller — Windows (doc 06 §5). Removes registry keys and
# files, leaving nothing stale.

$ErrorActionPreference = "Stop"

$ConfigDir = Join-Path $env:LOCALAPPDATA "ScriptCat\NativeHost"
$MetadataPath = Join-Path $ConfigDir "install-metadata.json"

if (-not (Test-Path $MetadataPath)) {
    Write-Host "No install-metadata.json found at $MetadataPath — nothing to uninstall."
    exit 0
}

$Metadata = Get-Content -Raw $MetadataPath | ConvertFrom-Json

$RegistryRoots = @{
    chrome   = "HKCU:\Software\Google\Chrome\NativeMessagingHosts"
    edge     = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts"
    chromium = "HKCU:\Software\Chromium\NativeMessagingHosts"
    brave    = "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts"
}

foreach ($browser in $Metadata.browsers) {
    $registryRoot = $RegistryRoots[$browser]
    if (-not $registryRoot) { continue }
    $keyPath = "$registryRoot\com.scriptcat.native_host"
    if (Test-Path $keyPath) {
        Remove-Item -Path $keyPath -Force
        Write-Host "Removed registry key $keyPath"
    }
}

foreach ($manifestPath in $Metadata.manifests) {
    if (Test-Path $manifestPath) {
        Remove-Item -Path $manifestPath -Force
        Write-Host "Removed $manifestPath"
    }
}

if ($Metadata.installDir -and (Test-Path $Metadata.installDir)) {
    Remove-Item -Path $Metadata.installDir -Recurse -Force
    Write-Host "Removed $($Metadata.installDir)"
}

Remove-Item -Path $MetadataPath -Force
Write-Host "ScriptCat native host uninstalled."
