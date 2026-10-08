param([switch]$SkipFrontendBuild)
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$python = Join-Path $project '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Project .venv is missing' }
if (-not $SkipFrontendBuild) {
    Push-Location (Join-Path $project 'frontend')
    try {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
    } finally { Pop-Location }
}
Push-Location $project
try {
    $dataFiles = @(
        'backend\alembic.ini;backend',
        'backend\migrations;backend\migrations',
        'backend\app\report\render_word.ps1;backend\app\report',
        'frontend\dist;frontend\dist',
        'templates\catalog.json;templates',
        'templates\poliform.docx;templates',
        'templates\rh.docx;templates',
        'templates\default.docx;templates'
    )
    Get-Process -Name 'QC-Report-Assistant*','Inspectra*' -ErrorAction SilentlyContinue | Stop-Process -Force
    $arguments = @('-m', 'PyInstaller', '--noconfirm', '--clean', '--onefile', '--windowed',
        '--name', 'Inspectra', '--paths', 'backend', '--distpath', '.artifacts\desktop',
        '--icon', 'assets\qc-windows.ico', '--collect-all', 'webview', '--collect-all', 'pythonnet')
    foreach ($entry in $dataFiles) { $arguments += @('--add-data', $entry) }
    $arguments += 'tools\desktop_launcher.py'
    & $python @arguments
    if ($LASTEXITCODE -ne 0) { throw 'PyInstaller failed' }
    $output = Join-Path $project '.artifacts\desktop\Inspectra.exe'
    if (-not (Test-Path -LiteralPath $output)) { throw 'EXE output missing' }
    Get-Item -LiteralPath $output | Select-Object FullName,Length
    Get-FileHash -LiteralPath $output -Algorithm SHA256 | Select-Object Hash
} finally { Pop-Location }
