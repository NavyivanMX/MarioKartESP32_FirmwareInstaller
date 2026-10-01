param(
    [ValidateSet("receiver","transmitter","all")]
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Esptool = "esptool"

function Merge-Firmware($Name) {
    $src = Join-Path $Root "firmware/source/$Name"
    $outDir = Join-Path $Root "firmware/release/$Name"
    $out = Join-Path $outDir "${Name}_merged.bin"

    New-Item -ItemType Directory -Force -Path $outDir | Out-Null

    $required = @(
        "bootloader.bin",
        "partitions.bin",
        "boot_app0.bin",
        "firmware.bin"
    )

    foreach ($file in $required) {
        $path = Join-Path $src $file
        if (-not (Test-Path $path)) {
            throw "Falta: $path"
        }
    }

    Write-Host ""
    Write-Host "========================================"
    Write-Host " Generando $Name"
    Write-Host "========================================"

    & $Esptool --chip esp32 merge-bin `
        -o $out `
        --flash-mode qio `
        --flash-freq 80m `
        --flash-size 4MB `
        0x1000 (Join-Path $src "bootloader.bin") `
        0x8000 (Join-Path $src "partitions.bin") `
        0xe000 (Join-Path $src "boot_app0.bin") `
        0x10000 (Join-Path $src "firmware.bin")

    if ($LASTEXITCODE -ne 0) {
        throw "esptool terminó con código $LASTEXITCODE"
    }

    Write-Host ""
    Write-Host "OK: $out" -ForegroundColor Green
}

if ($Target -eq "receiver" -or $Target -eq "all") {
    Merge-Firmware "receiver"
}

if ($Target -eq "transmitter" -or $Target -eq "all") {
    Merge-Firmware "transmitter"
}
