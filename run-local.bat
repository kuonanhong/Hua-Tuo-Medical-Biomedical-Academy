@echo off
rem 啟動本機伺服器 / Start the local server (Python 3.10+)
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 portable\server.py %*
) else (
  where python >nul 2>nul
  if not errorlevel 1 (
    python portable\server.py %*
  ) else (
    echo Python 3.10 or newer is required: https://www.python.org/downloads/  ^(tick "Add python.exe to PATH"^)
    pause
    exit /b 1
  )
)
endlocal
