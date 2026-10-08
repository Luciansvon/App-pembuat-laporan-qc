param(
    [Parameter(Mandatory=$true)][string]$Source,
    [Parameter(Mandatory=$true)][string]$Pdf
)
$ErrorActionPreference = 'Stop'
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$pdfPath = [IO.Path]::GetFullPath($Pdf)
$word = $null
$document = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $word.AutomationSecurity = 3
    $document = $word.Documents.Open($sourcePath, $false, $true, $false)
    $document.Repaginate()
    $document.ExportAsFixedFormat($pdfPath, 17)
} finally {
    if ($null -ne $document) {
        $document.Close()
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document)
    }
    if ($null -ne $word) {
        $word.Quit()
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)
    }
}
if (-not (Test-Path -LiteralPath $pdfPath)) { throw 'Word did not create the preview PDF' }
