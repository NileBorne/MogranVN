@echo off
cd C:\Users\Borai\Desktop\MogranVNv1\server

echo Starting MogranVN Server...
:: This starts the npm server in a separate window so the script can keep running
start "MogranVN Server" cmd /c "npm start"

echo Waiting for the server to load...
:: Pauses for 3 seconds to give the server time to start before opening the browser
timeout /t 3 /nobreak > NUL

echo Opening your browser...
:: Change "3000" to whatever port your server actually uses!
start http://localhost:11434