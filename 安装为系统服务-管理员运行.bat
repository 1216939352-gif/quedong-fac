@echo off
rem ==========================================================
rem  鹊动体重管理系统 —— 一键部署（推荐在诊所主机上执行一次）
rem
rem  会依次完成：
rem    1. 安装 node 依赖
rem    2. 开放防火墙端口（局域网其它电脑才能访问）
rem    3. 注册开机自启（nssm 服务，无 nssm 时用计划任务兜底）
rem    4. 注册每日自动备份（00:30 / 12:30）
rem    5. 体检并显示访问地址
rem ==========================================================
title 鹊动体重管理系统 - 一键部署
setlocal EnableExtensions

rem ---------- 自动提权 ----------
net session >nul 2>&1
if not errorlevel 1 goto :is_admin
echo.
echo   本脚本需要管理员权限, 正在弹出授权窗口 ...
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" >nul 2>&1
if errorlevel 1 (
  echo   [错误] 自动提权失败。请右键本文件, 选择"以管理员身份运行"。
  pause
)
exit /b 0

:is_admin
call "%~dp0server\scripts\_env.bat"
if not "%ENV_OK%"=="1" goto :fail

echo.
echo   ================================================
echo    鹊动体重管理系统 - 一键部署
echo   ================================================
echo    Node   : %NODE_VER%
echo    目录   : %SRV_DIR%
echo    端口   : %APP_PORT%
echo   ================================================
echo.

rem ---------- 1. 依赖 ----------
echo   [步骤 1/4] 检查 node 依赖 ...
if exist "%SRV_DIR%\node_modules\express" goto :deps_ok
set "NODE_DIR="
for %%I in ("%NODE_EXE%") do set "NODE_DIR=%%~dpI"
pushd "%SRV_DIR%"
if exist "%NODE_DIR%npm.cmd" (call "%NODE_DIR%npm.cmd" install --omit=dev) else (call npm install --omit=dev)
popd
if not exist "%SRV_DIR%\node_modules\express" (
  echo   [错误] 依赖安装失败。本机若无外网, 请从有网电脑拷贝 server\node_modules 过来。
  goto :fail
)
:deps_ok
echo            依赖就绪。
echo.

rem ---------- 2. 防火墙 ----------
echo   [步骤 2/4] 配置防火墙 ...
call "%SRV_DIR%\scripts\open-firewall.bat" --quiet
echo.

rem ---------- 3. 开机自启 ----------
echo   [步骤 3/4] 注册开机自启 ...
call "%SRV_DIR%\scripts\install-service.bat" --quiet
echo.

rem ---------- 4. 自动备份 ----------
echo   [步骤 4/4] 注册每日自动备份 ...
call "%SRV_DIR%\scripts\install-backup-task.bat" --quiet
echo.

rem ---------- 体检 ----------
echo   ================================================
echo    部署完成, 下面是体检结果
echo   ================================================
call "%SRV_DIR%\scripts\status.bat" --quiet

echo.
echo   请把上面的「局域网」地址告诉其它电脑/平板的使用者。
echo.
pause
exit /b 0

:fail
echo.
pause
exit /b 1
