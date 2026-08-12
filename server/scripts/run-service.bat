@echo off
rem ==========================================================
rem  后端常驻运行包装（计划任务回落方案专用，nssm 方案不走这里）
rem  职责：崩溃自动重启 + 输出落日志
rem ==========================================================
setlocal EnableExtensions
call "%~dp0_env.bat"
if not "%ENV_OK%"=="1" exit /b 1

cd /d "%SRV_DIR%"
set "PORT=%APP_PORT%"
set "SVC_LOG=%LOG_DIR%\service.log"

:run_loop
echo [%date% %time%] 启动后端 ^(端口 %APP_PORT%^) >> "%SVC_LOG%"
"%NODE_EXE%" %NODE_FLAGS% "%SRV_DIR%\server.js" >> "%SVC_LOG%" 2>&1
echo [%date% %time%] 后端退出, 代码=%errorlevel%, 5 秒后重启 >> "%SVC_LOG%"

rem 日志超过 20MB 时轮转一次，避免无限增长
for %%F in ("%SVC_LOG%") do if %%~zF GTR 20971520 (
  move /y "%SVC_LOG%" "%SVC_LOG%.1" >nul 2>&1
)

timeout /t 5 /nobreak >nul
goto :run_loop
