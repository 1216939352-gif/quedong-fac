@echo off
rem ==========================================================
rem  注册每日自动备份计划任务（00:30 与 12:30 各一次）
rem  备份内容：SQLite 数据库（VACUUM INTO 一致性快照）+ 媒体目录
rem  自动保留最近 30 份，日志见 server\backups\backup.log
rem  需要管理员权限
rem ==========================================================
setlocal EnableExtensions
call "%~dp0_env.bat"
if not "%ENV_OK%"=="1" goto :fail

net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo   [错误] 需要管理员权限。请右键本文件, 选择"以管理员身份运行"。
  echo.
  goto :fail
)

echo.
echo   ============================================
echo    鹊动系统 - 安装每日自动备份
echo   ============================================
echo    脚本 : %SRV_DIR%\backup.js
echo    时间 : 每天 00:30 与 12:30
echo    保留 : 最近 30 份
echo   ============================================
echo.

rem 路径含空格/中文时 schtasks 引号处理很脆弱，优先用 8.3 短路径
set "BKJS=%SRV_DIR%\backup.js"
set "NODE_SHORT="
set "BK_SHORT="
for %%I in ("%NODE_EXE%") do set "NODE_SHORT=%%~sI"
for %%I in ("%BKJS%") do set "BK_SHORT=%%~sI"

set "CMDLINE="
if defined NODE_SHORT if defined BK_SHORT if exist "%NODE_SHORT%" if exist "%BK_SHORT%" set "CMDLINE=%NODE_SHORT% %NODE_FLAGS% %BK_SHORT%"
if not defined CMDLINE set "CMDLINE=\"%NODE_EXE%\" %NODE_FLAGS% \"%BKJS%\""

echo   [1/3] 注册 %TASK_BK1% (00:30) ...
schtasks /Create /TN "%TASK_BK1%" /TR "%CMDLINE%" /SC DAILY /ST 00:30 /RU SYSTEM /RL HIGHEST /F >nul 2>&1
if errorlevel 1 goto :task_fail

echo   [2/3] 注册 %TASK_BK2% (12:30) ...
schtasks /Create /TN "%TASK_BK2%" /TR "%CMDLINE%" /SC DAILY /ST 12:30 /RU SYSTEM /RL HIGHEST /F >nul 2>&1
if errorlevel 1 goto :task_fail

echo   [3/3] 立即试跑一次, 验证任务真的能跑通 ...
schtasks /Run /TN "%TASK_BK1%" >nul 2>&1
timeout /t 6 /nobreak >nul

set "BKCNT=0"
for /f %%c in ('dir /b /ad "%SRV_DIR%\backups" 2^>nul ^| find /c /v ""') do set "BKCNT=%%c"

echo.
echo   ============================================
echo    [成功] 每日自动备份已启用
echo   ============================================
echo    当前备份份数 : %BKCNT%
echo    备份目录     : %SRV_DIR%\backups
echo    备份日志     : %SRV_DIR%\backups\backup.log
echo.
echo    查看/调整时间: 运行 taskschd.msc, 找到 %TASK_BK1% / %TASK_BK2%
echo.
if not "%~1"=="--quiet" pause
exit /b 0

:task_fail
echo   [失败] 计划任务创建失败, 请确认以管理员身份运行。
goto :fail

:fail
if not "%~1"=="--quiet" pause
exit /b 1
