@echo off
rem ==========================================================
rem  把后端注册为开机自启的 Windows 服务
rem
rem  回落策略（内网机器常常没有外网，绝不硬依赖 nssm）：
rem    1) server\tools\nssm.exe   —— 随包自带，最优
rem    2) 系统 PATH 里的 nssm     —— 已装过
rem    3) 都没有 → 用 Windows 自带计划任务（开机启动 + SYSTEM 账户）兜底
rem
rem  本脚本全程无交互（会被一键部署脚本静默调用，不能卡在等待输入上）。
rem  想改用 nssm：先单独运行 download-nssm.bat，再重新执行本脚本。
rem
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
echo    鹊动系统 - 安装后端服务
echo   ============================================
echo    Node    : %NODE_VER%
echo    目录    : %SRV_DIR%
echo    端口    : %APP_PORT%
echo   ============================================
echo.

rem ---------- 清理旧安装，保证可重复执行 ----------
echo   [1/3] 清理旧的服务/任务 ...
call "%~dp0uninstall-service.bat" --quiet >nul 2>&1

rem ---------- 定位 nssm ----------
echo   [2/3] 检测 nssm ...
set "NSSM="
if exist "%SRV_DIR%\tools\nssm.exe" set "NSSM=%SRV_DIR%\tools\nssm.exe"
if not defined NSSM for /f "delims=" %%i in ('where nssm 2^>nul') do if not defined NSSM set "NSSM=%%i"
if defined NSSM goto :have_nssm

echo         未找到 nssm, 改用 Windows 自带计划任务方案（同样开机自启, 不需要外网）。
echo         如需改用 nssm: 先运行 download-nssm.bat, 再重新执行本脚本。
goto :use_schtasks

rem ==========================================================
:have_nssm
echo         使用 nssm: %NSSM%
echo   [3/3] 注册服务 %SVC_NAME% ...
"%NSSM%" install %SVC_NAME% "%NODE_EXE%" >nul 2>&1
"%NSSM%" set %SVC_NAME% AppDirectory "%SRV_DIR%" >nul 2>&1
"%NSSM%" set %SVC_NAME% AppParameters "%NODE_FLAGS% server.js" >nul 2>&1
"%NSSM%" set %SVC_NAME% DisplayName "鹊动体重管理系统 后端服务" >nul 2>&1
"%NSSM%" set %SVC_NAME% Description "鹊动体重管理与肌少症评估系统 局域网后端（数据同步/媒体/报错收集）" >nul 2>&1
"%NSSM%" set %SVC_NAME% Start SERVICE_AUTO_START >nul 2>&1
"%NSSM%" set %SVC_NAME% AppEnvironmentExtra PORT=%APP_PORT% >nul 2>&1
"%NSSM%" set %SVC_NAME% AppStdout "%LOG_DIR%\service-out.log" >nul 2>&1
"%NSSM%" set %SVC_NAME% AppStderr "%LOG_DIR%\service-err.log" >nul 2>&1
"%NSSM%" set %SVC_NAME% AppRotateFiles 1 >nul 2>&1
"%NSSM%" set %SVC_NAME% AppRotateOnline 1 >nul 2>&1
"%NSSM%" set %SVC_NAME% AppRotateBytes 10485760 >nul 2>&1
"%NSSM%" set %SVC_NAME% AppExit Default Restart >nul 2>&1
"%NSSM%" set %SVC_NAME% AppRestartDelay 5000 >nul 2>&1
"%NSSM%" start %SVC_NAME% >nul 2>&1
set "MODE=Windows 服务 (nssm)"
goto :verify

rem ==========================================================
:use_schtasks
echo   [3/3] 注册计划任务 %TASK_SVC% ...
rem 路径含空格或中文时 schtasks 的引号处理很脆弱，优先用 8.3 短路径规避
set "RUNBAT=%SRV_DIR%\scripts\run-service.bat"
set "RUNSHORT="
for %%I in ("%RUNBAT%") do set "RUNSHORT=%%~sI"
if defined RUNSHORT if exist "%RUNSHORT%" goto :st_short
schtasks /Create /TN "%TASK_SVC%" /TR "\"%RUNBAT%\"" /SC ONSTART /RU SYSTEM /RL HIGHEST /F >nul 2>&1
goto :st_done
:st_short
schtasks /Create /TN "%TASK_SVC%" /TR "%RUNSHORT%" /SC ONSTART /RU SYSTEM /RL HIGHEST /F >nul 2>&1
:st_done
if errorlevel 1 (
  echo   [失败] 计划任务创建失败。
  goto :fail
)
schtasks /Run /TN "%TASK_SVC%" >nul 2>&1
set "MODE=计划任务 (开机启动)"
goto :verify

rem ==========================================================
:verify
echo.
echo   等待后端启动 ...
for /l %%i in (1,1,20) do (
  curl.exe -s -m 2 "http://127.0.0.1:%APP_PORT%/health" >nul 2>&1
  if not errorlevel 1 goto :healthy
  timeout /t 1 /nobreak >nul
)
goto :unhealthy

:healthy
echo.
echo   ============================================
echo    [成功] 后端已运行, 且已设置为开机自动启动
echo    方式: %MODE%
echo   ============================================
echo    本机访问 : http://localhost:%APP_PORT%/
call :show_lan
echo.
echo    提示: 若局域网其它电脑打不开, 请以管理员运行 open-firewall.bat
echo.
if not "%~1"=="--quiet" pause
exit /b 0

:unhealthy
echo.
echo   [警告] 已注册开机自启, 但 %APP_PORT% 端口在 20 秒内没有响应。
echo   请查看日志目录: %LOG_DIR%
echo   也可先手动运行 启动系统.bat 看具体报错。
echo.
if not "%~1"=="--quiet" pause
exit /b 1

rem ==========================================================
:show_lan
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%j in ("%%i") do echo    局域网访问 : http://%%j:%APP_PORT%/
)
goto :eof

:fail
if not "%~1"=="--quiet" pause
exit /b 1
