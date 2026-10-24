@echo off
chcp 65001 >nul
title Conecta Seguro - Servidor local
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js nao encontrado. Instale Node.js LTS em https://nodejs.org/
 pause
 exit /b 1
)
if not exist node_modules\ws (
 echo Instalando dependencia necessaria...
 call npm install --omit=dev
 if errorlevel 1 (echo Falha ao instalar dependencias. Verifique a internet. & pause & exit /b 1)
)
echo.
node server.js
pause
