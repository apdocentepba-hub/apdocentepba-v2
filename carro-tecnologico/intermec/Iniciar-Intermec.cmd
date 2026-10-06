@echo off
setlocal
set "PS1=%TEMP%\IntermecBridge-CarroTecnologico.ps1"
set "URL=https://alertasapd.com.ar/carro-tecnologico/intermec/IntermecBridge.ps1"

echo Descargando puente Intermec USB...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing '%URL%' -OutFile '%PS1%'"
if errorlevel 1 (
  echo.
  echo No se pudo descargar el puente.
  pause
  exit /b 1
)

echo Abriendo como administrador...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%PS1%""'"
endlocal
