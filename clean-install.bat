@echo off
echo Cleaning previous installation...

REM Remove old node_modules
if exist "node_modules" (
    echo Removing old node_modules...
    rmdir /s /q node_modules
)

REM Remove package-lock.json
if exist "package-lock.json" (
    echo Removing package-lock.json...
    del package-lock.json
)

echo Installing fresh dependencies...
npm install

if %ERRORLEVEL% NEQ 0 (
    echo Installation failed!
    pause
    exit /b 1
)

echo Installation completed successfully!
echo You can now run the application with run.bat
pause