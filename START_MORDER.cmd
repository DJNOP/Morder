@echo off
setlocal

set "MORDER_ROOT=%~dp0"

echo.
echo ========================================
echo Starting Morder development environment
echo ========================================
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%MORDER_ROOT%scripts\morder-session.ps1" -Action Start -ProjectRoot "%MORDER_ROOT%."
set "MORDER_EXIT_CODE=%ERRORLEVEL%"

if not "%MORDER_EXIT_CODE%"=="0" (
  echo.
  echo Morder did not start successfully. Review the message above and the Morder development window.
  pause
)

exit /b %MORDER_EXIT_CODE%
