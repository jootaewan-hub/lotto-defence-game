@echo off
setlocal
chcp 65001 >nul
title Moonlight Guardians
pushd "%~dp0"
if errorlevel 1 goto folder_error

where node.exe >nul 2>&1
if errorlevel 1 goto node_error
where npm.cmd >nul 2>&1
if errorlevel 1 goto node_error
if not exist "package.json" goto project_error

if /i "%~1"=="--check" goto check
if exist "node_modules\vite\bin\vite.js" goto launch

echo [준비] 처음 실행에 필요한 파일을 설치합니다. 인터넷 연결이 필요합니다.
call npm.cmd install
if errorlevel 1 goto install_error

:launch
echo.
echo 달빛 수호대를 실행합니다. 브라우저가 자동으로 열립니다.
echo 게임을 하는 동안 이 창을 열어 두세요. 종료하려면 이 창을 닫으세요.
echo.
call npm.cmd run dev -- --open
if errorlevel 1 goto launch_error
popd
exit /b 0

:check
if not exist "node_modules\vite\bin\vite.js" goto install_error
echo Launcher check passed.
popd
exit /b 0

:node_error
echo [오류] Node.js가 필요합니다. https://nodejs.org 에서 LTS 버전을 설치한 후 다시 실행하세요.
goto failure
:project_error
echo [오류] 게임 파일을 찾을 수 없습니다. 이 실행 파일을 게임 폴더 안에 두세요.
goto failure
:install_error
echo [오류] 실행에 필요한 파일이 준비되지 않았습니다. 인터넷 연결과 위 오류를 확인하세요.
goto failure
:launch_error
echo [오류] 게임을 실행하지 못했습니다. 위 오류 내용을 확인하세요.
goto failure
:folder_error
echo [오류] 게임 폴더를 열 수 없습니다.
pause
exit /b 1
:failure
pause
popd
exit /b 1
