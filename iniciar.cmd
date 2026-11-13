@echo off
rem Liga o Painel do Freelance sem janela e abre no navegador. Se já estiver ligado, só abre.
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\ligar.ps1" -Abrir
