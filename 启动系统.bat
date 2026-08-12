@echo off
rem ==========================================================
rem  鹊动体重管理系统 —— 一键启动（双击即可）
rem  本窗口就是后端控制台，关闭窗口 = 停止服务。
rem  想让它开机自动在后台运行，请改用「安装为系统服务-管理员运行.bat」
rem ==========================================================
title 鹊动体重管理系统 - 后端运行中（关闭本窗口即停止）
setlocal EnableExtensions

call "%~dp0server\scripts\_env.bat"
if not "%ENV_OK%"=="1" goto :fail

echo.
echo   ================================================
echo    鹊动体重管理与肌少症评估系统
echo   ================================================
echo    Node   : %NODE_VER%
echo    目录   : %SRV_DIR%
echo    端口   : %APP_PORT%
echo   ================================================
echo.

rem ---------- 已经在跑就不重复启动 ----------
curl.exe -s -m 2 "http://127.0.0.1:%APP_PORT%/health" >nul 2>&1
if not errorlevel 1 goto :already_running

rem ---------- 端口被别的程序占了 ----------
set "OCCUPIED="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%APP_PORT% .*LISTENING"') do set "OCCUPIED=%%p"
if defined OCCUPIED goto :port_busy

rem ---------- 首次运行：安装依赖 ----------
if exist "%SRV_DIR%\node_modules\express" goto :start_server
echo   首次运行, 正在安装依赖（需要几十秒, 请勿关闭窗口）...
set "NODE_DIR="
for %%I in ("%NODE_EXE%") do set "NODE_DIR=%%~dpI"
pushd "%SRV_DIR%"
if exist "%NODE_DIR%npm.cmd" (call "%NODE_DIR%npm.cmd" install --omit=dev) else (call npm install --omit=dev)
popd
if not exist "%SRV_DIR%\node_modules\express" (
  echo.
  echo   [错误] 依赖安装失败。若本机无法访问外网, 请从有网的电脑上
  echo          把 server\node_modules 整个文件夹拷贝过来。
  echo.
  goto :fail
)
echo   依赖安装完成。
echo.

:start_server
echo   正在启动后端 ... 启动成功后会自动打开浏览器。
echo   ^(要停止服务, 直接关闭本窗口, 或按 Ctrl+C^)
echo.
start "" /min "%SRV_DIR%\scripts\_open-when-ready.bat" %APP_PORT%
cd /d "%SRV_DIR%"
set "PORT=%APP_PORT%"
"%NODE_EXE%" %NODE_FLAGS% server.js
echo.
echo   后端已停止（退出代码 %errorlevel%）。
goto :fail

:already_running
echo   后端已在运行, 直接打开浏览器。
start "" "http://localhost:%APP_PORT%/"
timeout /t 2 /nobreak >nul
exit /b 0

:port_busy
echo   [错误] 端口 %APP_PORT% 已被进程 PID %OCCUPIED% 占用, 但它不是本系统后端。
echo.
echo   处理办法（任选其一）：
echo     1. 结束该进程:  taskkill /PID %OCCUPIED% /F
echo     2. 换个端口启动: 先执行  set APP_PORT=8081  再运行本脚本
echo.
goto :fail

:fail
echo.
pause
exit /b 1
