@echo off
rem Liga o Painel do Freelance e abre no navegador. Feche esta janela para desligar.
title Painel do Freelance
cd /d "%~dp0"
if not exist node_modules call npm install
if not exist dist call npm run build
set ABRIR_NAVEGADOR=1
node src\servidor\index.ts
if errorlevel 1 pause
