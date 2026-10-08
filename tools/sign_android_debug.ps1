param(
    [Parameter(Mandatory = $true)][string]$InputApk,
    [string]$OutputApk = "$PSScriptRoot/../.artifacts/android/Inspectra-mumu-debug.apk",
    [string]$SdkPath = "$env:LOCALAPPDATA/Android/Sdk",
    [string]$BuildToolsVersion = "36.0.0",
    [string]$KeyStorePath = "$env:USERPROFILE/.android/inspectra-debug.keystore"
)

$ErrorActionPreference = "Stop"
$source = (Resolve-Path -LiteralPath $InputApk).Path
$destination = [IO.Path]::GetFullPath($OutputApk)
$artifactRoot = [IO.Path]::GetFullPath("$PSScriptRoot/../.artifacts")
if (!$destination.StartsWith($artifactRoot + [IO.Path]::DirectorySeparatorChar,
        [StringComparison]::OrdinalIgnoreCase) -or $source -eq $destination) {
    throw "Output must be a separate APK inside the project's .artifacts directory."
}
$buildTools = Join-Path $SdkPath "build-tools/$BuildToolsVersion"
$signer = Join-Path $buildTools "apksigner.bat"
$aligner = Join-Path $buildTools "zipalign.exe"
if (!(Test-Path -LiteralPath $signer) -or !(Test-Path -LiteralPath $aligner)) {
    throw "Android SDK build tools $BuildToolsVersion are required."
}
if (!(Test-Path -LiteralPath $KeyStorePath)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $KeyStorePath) | Out-Null
    # This standard debug password is for QA only; never use this key for production.
    & keytool -genkeypair -keystore $KeyStorePath -alias inspectra-debug -storepass android `
        -keypass android -keyalg RSA -keysize 2048 -validity 3650 `
        -dname "CN=Inspectra Debug,O=Inspectra QA,C=ID"
    if ($LASTEXITCODE -ne 0) { throw "Debug key generation failed." }
}
New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
& $signer sign --ks $KeyStorePath --ks-key-alias inspectra-debug --ks-pass pass:android `
    --key-pass pass:android --out $destination $source
if ($LASTEXITCODE -ne 0) { throw "APK signing failed." }
$verification = & $signer verify --verbose --print-certs $destination
if ($LASTEXITCODE -ne 0) { throw "APK signature verification failed." }
& $aligner -c -P 16 4 $destination
if ($LASTEXITCODE -ne 0) { throw "APK ZIP alignment verification failed." }
$verification | Set-Content -LiteralPath ($destination + ".signing.txt") -Encoding utf8
Get-FileHash -LiteralPath $destination -Algorithm SHA256 | Format-List Hash, Path
