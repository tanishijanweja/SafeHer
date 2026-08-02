@echo off
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM bun.exe >nul 2>&1
timeout /t 1 >nul
bun run dev