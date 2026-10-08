param(
    [Parameter(Mandatory=$true)][string]$Source,
    [Parameter(Mandatory=$true)][string]$Output
)
$ErrorActionPreference = 'Stop'
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$outputPath = [IO.Path]::GetFullPath($Output)
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
function Get-SharedFileHash([string]$Path) {
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '') }
    finally { $hasher.Dispose(); $stream.Dispose() }
}
$sourceHash = Get-SharedFileHash $sourcePath
$word = $null
$document = $null
$ownsWord = $false
try {
    # Dedicated hidden Word instance. Open read-only, no link updates or macros.
    $word = New-Object -ComObject Word.Application
    if ($word.Documents.Count -gt 0) { throw 'Word instance contains user documents; refusing to modify it' }
    $ownsWord = $true
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $word.AutomationSecurity = 3
    $document = $word.Documents.Open($sourcePath, $false, $true, $false)
    $document.Repaginate()
    $pages = $document.ComputeStatistics(2)
    $document.ExportAsFixedFormat((Join-Path $outputPath 'reference.pdf'), 17)
    @{renderer='Microsoft Word read-only COM export'; page_count=$pages; source_sha256=$sourceHash} |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputPath 'render.json') -Encoding utf8
} finally {
    if ($null -ne $document) { $document.Close(0); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) }
    if ($null -ne $word) {
        if ($ownsWord) { $word.Quit(0) }
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)
    }
}
if ((Get-SharedFileHash $sourcePath) -ne $sourceHash) {
    throw 'Reference changed during read-only export'
}
Get-Content -LiteralPath (Join-Path $outputPath 'render.json')
