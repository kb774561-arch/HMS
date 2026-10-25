@echo off
REM Genius Girls PG - share this PC's app on the internet with a public link.
REM Keep both windows open while your client uses the app.
cd /d "%~dp0"

echo Building the website...
call npm run build --prefix frontend || goto :error

start "Genius Girls PG - Server" cmd /k "cd /d %~dp0backend && npx tsx src/index.ts"
timeout /t 8 /nobreak >nul
start "Genius Girls PG - Public link" cmd /k ""C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --no-autoupdate --url http://127.0.0.1:5000"

echo.
echo In the "Public link" window, copy the https://....trycloudflare.com address and send it to your client.
echo The link changes every time you restart this file.
pause
exit /b 0

:error
echo Build failed - see the messages above.
pause
exit /b 1
