@echo off
echo Starting GIF Converter...

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if npm is installed
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo npm is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if %ERRORLEVEL% NEQ 0 (
        echo Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Check for FFmpeg binaries
if exist "ffmpeg\ffmpeg.exe" (
    echo Found bundled FFmpeg binaries
) else (
    echo FFmpeg binaries not found in ffmpeg folder
    echo Will try to use npm-installed version
)

REM Start the application
echo Starting GIF Converter...
npm start

if %ERRORLEVEL% NEQ 0 (
    echo Application failed to start
    pause
    exit /b 1
)

pause