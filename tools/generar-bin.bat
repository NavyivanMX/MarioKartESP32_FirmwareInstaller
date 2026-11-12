@echo off
setlocal
title MarioKart ESP32 RC - Generador de BIN

echo.
echo ==================================================
echo MarioKart ESP32 RC - Generador de firmware .bin
echo ==================================================
echo.
echo Compila Receiver y/o Transmitter en Arduino IDE antes de continuar.
echo Pega la ruta completa de cada carpeta build.
echo Puedes dejar vacio el que no quieras generar.
echo.

set /p RECEIVER_PATH=Ruta de la carpeta build del Receiver: 
set /p TRANSMITTER_PATH=Ruta de la carpeta build del Transmitter: 

if "%RECEIVER_PATH%"=="" if "%TRANSMITTER_PATH%"=="" (
  echo.
  echo ERROR: Debes indicar al menos una carpeta build.
  pause
  exit /b 1
)

if not "%RECEIVER_PATH%"=="" if not "%TRANSMITTER_PATH%"=="" (
  set "TARGET=all"
) else (
  if not "%RECEIVER_PATH%"=="" (
    set "TARGET=receiver"
  ) else (
    set "TARGET=transmitter"
  )
)

set "ARGS=-Target %TARGET%"
if not "%RECEIVER_PATH%"=="" set "ARGS=%ARGS% -ReceiverBuildPath ""%RECEIVER_PATH%"""
if not "%TRANSMITTER_PATH%"=="" set "ARGS=%ARGS% -TransmitterBuildPath ""%TRANSMITTER_PATH%"""

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0merge-firmware.ps1" %ARGS%
if errorlevel 1 (
  echo.
  echo No se pudieron generar los archivos.
  pause
  exit /b 1
)

echo.
echo Terminado. Revisa firmware\release\receiver y firmware\release\transmitter.
pause
