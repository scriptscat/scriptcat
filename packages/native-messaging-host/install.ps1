param(
    [string]$ExtensionId = "fomrtutthjerocmw"
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$distPath = Join-Path $scriptDir "dist\native-host.bat"

if (-not (Test-Path $distPath)) {
    Write-Error "Build output not found: $distPath"
    exit 1
}

$manifestPath = Join-Path $scriptDir "manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$manifest.path = $distPath
$manifest.allowed_origins = @("chrome-extension://$ExtensionId/")
$manifest | ConvertTo-Json -Depth 5 | Set-Content $manifestPath -Encoding UTF8
Write-Host "[OK] manifest.json updated"

$regs = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.scriptcat.native_host",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.scriptcat.native_host"
)
foreach ($regPath in $regs) {
    New-Item -Path $regPath -Force | Out-Null
    Set-ItemProperty -Path $regPath -Name "(Default)" -Value $manifestPath
    Write-Host "[OK] Registered: $regPath"
}
Write-Host "Done"