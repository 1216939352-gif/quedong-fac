@echo off
rem ==========================================================
rem  停止后端（前台运行、服务、计划任务三种方式都能停）
rem  不会删除任何数据；重启电脑后若装过服务仍会自动启动。
rem ==========================================================
title 鹊动体重管理系统 - 停止后端
setlocal EnableExtensions
call "%~dp0server\scripts\_env.bat"
if not "%ENV_OK%"=="1" (pause & exit /b 1)

echo.
echo   正在停止后端 ...

rem 服务方式（需要管理员，非管理员时静默失败即可）
net session >nul 2>&1
if not errorlevel 1 (
  sc stop %SVC_NAME% >nul 2>&1
  schtasks /End /TN "%TASK_SVC%" >nul 2>&1
)

rem 兜底：结束占用端口的进程
set "KILLED="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%APP_PORT% .*LISTENING"') do (
  taskkill /PID %%p /F >nul 2>&1
  set "KILLED=1"
)

timeout /t 1 /nobreak >nul
curl.exe -s -m 2 "http://127.0.0.1:%APP_PORT%/health" >nul 2>&1
if errorlevel 1 (
  echo   [完成] 后端已停止, 端口 %APP_PORT% 已释放。
) else (
  echo   [警告] 后端仍在响应。若它是以 Windows 服务运行,
  echo          请以管理员身份重新运行本脚本。
)
echo.
pause
exit /b 0
