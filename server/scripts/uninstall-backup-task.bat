@echo off
rem ==========================================================
rem  移除每日自动备份计划任务（已生成的备份文件不会被删除）
rem  需要管理员权限
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

schtasks /Delete /TN "%TASK_BK1%" /F >nul 2>&1
schtasks /Delete /TN "%TASK_BK2%" /F >nul 2>&1

if not defined QUIET (
  echo   [完成] 已移除自动备份任务。
  echo   已生成的备份仍保留在: %SRV_DIR%\backups
  pause
)
exit /b 0
