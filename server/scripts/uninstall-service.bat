@echo off
rem ==========================================================
rem  卸载后端服务（nssm 服务 与 计划任务 两种方式都会清理）
rem  需要管理员权限；带 --quiet 参数时静默执行，供安装脚本复用
rem ==========================================================
setlocal EnableExtensions
call "%~dp0_env.bat"
if not "%ENV_OK%"=="1" exit /b 1

set "QUIET="
if "%~1"=="--quiet" set "QUIET=1"

net session >nul 2>&1
if errorlevel 1 (
  if not defined QUIET echo   [错误] 需要管理员权限。请右键本文件, 选择"以管理员身份运行"。
  if not defined QUIET pause
  exit /b 1
)

if not defined QUIET echo   正在停止并移除服务/任务 ...

rem ---------- nssm 服务 ----------
set "NSSM="
if exist "%SRV_DIR%\tools\nssm.exe" set "NSSM=%SRV_DIR%\tools\nssm.exe"
if not defined NSSM for /f "delims=" %%i in ('where nssm 2^>nul') do if not defined NSSM set "NSSM=%%i"
if defined NSSM (
  "%NSSM%" stop %SVC_NAME% >nul 2>&1
  "%NSSM%" remove %SVC_NAME% confirm >nul 2>&1
)
rem 即便没有 nssm，也用 sc 兜底清理（可能是别人装的同名服务）
sc query %SVC_NAME% >nul 2>&1
if not errorlevel 1 (
  sc stop %SVC_NAME% >nul 2>&1
  sc delete %SVC_NAME% >nul 2>&1
)

rem ---------- 计划任务 ----------
schtasks /Query /TN "%TASK_SVC%" >nul 2>&1
if not errorlevel 1 (
  schtasks /End /TN "%TASK_SVC%" >nul 2>&1
  schtasks /Delete /TN "%TASK_SVC%" /F >nul 2>&1
)

rem ---------- 兜底：结束仍占用端口的 node 进程 ----------
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%APP_PORT% .*LISTENING"') do (
  taskkill /PID %%p /F >nul 2>&1
)

if not defined QUIET (
  echo   [完成] 已移除开机自启, 端口 %APP_PORT% 已释放。
  echo   注意: 数据库与备份文件不会被删除, 仍在 %SRV_DIR%\data 与 %SRV_DIR%\backups
  pause
)
exit /b 0
