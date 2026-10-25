param(
    [ValidateSet("receiver", "transmitter", "all")]
    [string]$Target = "all",

    [string]$ReceiverBuildPath = "",
    [string]$TransmitterBuildPath = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Resolve-Esptool {
    $cmd = Get-Command "esptool" -ErrorAction SilentlyContinue
    if ($cmd) {
        return @{ Command = $cmd.Source; Prefix = @() }
    }

    $py = Get-Command "py" -ErrorAction SilentlyContinue
    if ($py) {
        & $py.Source -m esptool version *> $null
        if ($LASTEXITCODE -eq 0) {
            return @{ Command = $py.Source; Prefix = @("-m", "esptool") }
        }
    }

    $python = Get-Command "python" -ErrorAction SilentlyContinue
    if ($python) {
        & $python.Source -m esptool version *> $null
        if ($LASTEXITCODE -eq 0) {
            return @{ Command = $python.Source; Prefix = @("-m", "esptool") }
        }
    }

    throw "No se encontró esptool. Instálalo con: py -m pip install --upgrade esptool"
}

function Get-BuildFiles([string]$BuildPath, [string]$Name) {
    if ([string]::IsNullOrWhiteSpace($BuildPath)) {
        $BuildPath = Read-Host "Pega la ruta de la carpeta build de Arduino para $Name"
    }

    $BuildPath = $BuildPath.Trim().Trim('"')
    if (-not (Test-Path -LiteralPath $BuildPath -PathType Container)) {
        throw "No existe la carpeta de compilación: $BuildPath"
    }

    $bootloader = Get-ChildItem -LiteralPath $BuildPath -File -Filter "*.bootloader.bin" |
        Select-Object -First 1
    $partitions = Get-ChildItem -LiteralPath $BuildPath -File -Filter "*.partitions.bin" |
        Select-Object -First 1
    $bootApp = Get-ChildItem -LiteralPath $BuildPath -File -Filter "boot_app0.bin" |
        Select-Object -First 1
    $firmware = Get-ChildItem -LiteralPath $BuildPath -File -Filter "*.ino.bin" |
        Where-Object { $_.Name -notmatch '\.(bootloader|partitions|merged)\.bin$' } |
        Select-Object -First 1

    $missing = @()
    if (-not $bootloader) { $missing += "*.bootloader.bin" }
    if (-not $partitions) { $missing += "*.partitions.bin" }
    if (-not $bootApp) { $missing += "boot_app0.bin" }
    if (-not $firmware) { $missing += "*.ino.bin (firmware principal)" }

    if ($missing.Count -gt 0) {
        throw "En '$BuildPath' faltan estos archivos: $($missing -join ', '). Vuelve a compilar el sketch en Arduino IDE."
    }

    return @{
        Bootloader = $bootloader.FullName
        Partitions = $partitions.FullName
        BootApp = $bootApp.FullName
        Firmware = $firmware.FullName
    }
}

function Merge-Firmware([string]$Name, [string]$BuildPath) {
    $files = Get-BuildFiles -BuildPath $BuildPath -Name $Name
    $outDir = Join-Path $Root "firmware/release/$Name"
    $outFile = Join-Path $outDir "${Name}_merged.bin"
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null

    Write-Host ""
    Write-Host "=============================================="
    Write-Host " Generando firmware combinado: $Name"
    Write-Host "=============================================="
    Write-Host "Bootloader : $($files.Bootloader)"
    Write-Host "Partitions : $($files.Partitions)"
    Write-Host "boot_app0  : $($files.BootApp)"
    Write-Host "Firmware   : $($files.Firmware)"
    Write-Host "Salida     : $outFile"
    Write-Host ""

    $tool = Resolve-Esptool
    $esptoolArgs = @()
    $esptoolArgs += $tool.Prefix
    $esptoolArgs += @(
        "--chip", "esp32", "merge-bin",
        "-o", $outFile,
        "--flash-mode", "qio",
        "--flash-freq", "80m",
        "--flash-size", "4MB",
        "0x1000", $files.Bootloader,
        "0x8000", $files.Partitions,
        "0xE000", $files.BootApp,
        "0x10000", $files.Firmware
    )

    & $tool.Command @esptoolArgs
    if ($LASTEXITCODE -ne 0) {
        throw "esptool terminó con código $LASTEXITCODE al generar $Name."
    }

    if (-not (Test-Path -LiteralPath $outFile) -or (Get-Item -LiteralPath $outFile).Length -eq 0) {
        throw "esptool no generó un archivo válido: $outFile"
    }

    Write-Host "OK: $outFile" -ForegroundColor Green
}

try {
    if ($Target -eq "receiver" -or $Target -eq "all") {
        Merge-Firmware -Name "receiver" -BuildPath $ReceiverBuildPath
    }
    if ($Target -eq "transmitter" -or $Target -eq "all") {
        Merge-Firmware -Name "transmitter" -BuildPath $TransmitterBuildPath
    }

    Write-Host ""
    Write-Host "Proceso terminado. Los archivos quedan en firmware/release." -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
