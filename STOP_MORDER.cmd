@echo off
setlocal

set "MORDER_ROOT=%~dp0"

echo.
echo ========================================
echo Stopping Morder development environment
echo ========================================
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%MORDER_ROOT%scripts\morder-session.ps1" -Action Stop -ProjectRoot "%MORDER_ROOT%."
set "MORDER_EXIT_CODE=%ERRORLEVEL%"

if not "%MORDER_EXIT_CODE%"=="0" (
  echo.
  echo Morder could not be stopped cleanly. Review the message above.
  pause
)

exit /b %MORDER_EXIT_CODE%
