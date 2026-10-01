@echo off
setlocal
echo.
echo ========================================
echo MarioKart ESP32 RC - Merge Firmware
echo ========================================
echo.
echo Este script requiere esptool instalado y disponible en PATH.
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0merge-firmware.ps1" %*
if errorlevel 1 (
    echo.
    echo ERROR al generar los BIN.
    pause
    exit /b 1
)
echo.
echo Firmware generado correctamente.
pause
