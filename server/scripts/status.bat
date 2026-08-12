@echo off
rem ==========================================================
rem  一键体检 —— 出问题时先跑这个，把窗口内容截图发给维护人员
rem  不需要管理员权限
rem ==========================================================
setlocal EnableExtensions
call "%~dp0_env.bat"
if not "%ENV_OK%"=="1" goto :end

rem ---- 应用侧数据交给 node 计算（只回 ASCII 的 KEY=VALUE，中文标签由本脚本打印，避免编码乱码）----
set "QD_ST=%TEMP%\qd_status_%RANDOM%.txt"
"%NODE_EXE%" %NODE_FLAGS% "%~dp0_status.js" "%QD_ST%" >nul 2>&1
if exist "%QD_ST%" (
  for /f "usebackq delims=" %%L in ("%QD_ST%") do set "%%L"
  del "%QD_ST%" >nul 2>&1
)

echo.
echo   ================================================
echo    鹊动体重管理系统 - 运行状态体检
echo   ================================================
echo.
echo   --- 运行环境 ---
echo    Node 版本     : %NODE_VER%
echo    Node 路径     : %NODE_EXE%
if defined NODE_FLAGS echo    额外参数      : %NODE_FLAGS%
echo    程序目录      : %SRV_DIR%
echo    端口          : %APP_PORT%

echo.
echo   --- 后端状态 ---
if "%HEALTH_OK%"=="1" (
  echo    健康检查      : 正常 ^(HTTP %HEALTH_CODE%^)
) else (
  echo    健康检查      : 无法连接, 后端未运行或端口不对
)
set "PORTUSED="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%APP_PORT% .*LISTENING"') do (
  set "PORTUSED=1"
  echo    端口监听      : %APP_PORT% 由进程 PID %%p 占用
)
if not defined PORTUSED echo    端口监听      : %APP_PORT% 无人监听

echo.
echo   --- 开机自启 ---
set "FOUND="
sc query %SVC_NAME% >nul 2>&1
if not errorlevel 1 (
  set "FOUND=1"
  for /f "tokens=3" %%s in ('sc query %SVC_NAME% ^| findstr /c:"STATE" /c:"状态"') do echo    Windows 服务  : 已安装, 状态 %%s
)
schtasks /Query /TN "%TASK_SVC%" >nul 2>&1
if not errorlevel 1 (
  set "FOUND=1"
  echo    计划任务      : 已安装
)
if not defined FOUND echo    开机自启      : [未配置] 电脑重启后需手动启动, 建议运行 安装为系统服务-管理员运行.bat

schtasks /Query /TN "%TASK_BK1%" >nul 2>&1
if errorlevel 1 (
  echo    自动备份      : [未配置] 建议运行 install-backup-task.bat
) else (
  echo    自动备份      : 已启用, 每天 00:30 与 12:30
)

echo.
echo   --- 防火墙 ---
netsh advfirewall firewall show rule name="Quedong Backend %APP_PORT%" >nul 2>&1
if errorlevel 1 (
  echo    入站规则      : [未配置] 局域网其它电脑可能无法访问
  echo                    需要时以管理员运行 open-firewall.bat
) else (
  echo    入站规则      : 已允许 TCP %APP_PORT% 入站
)

echo.
echo   --- 数据 ---
if "%DB_EXISTS%"=="1" (
  echo    数据库        : %DB_SIZE%   用户 %DB_USERS% / 同步条目 %DB_SYNC% / 报错 %DB_ERRS%
) else (
  echo    数据库        : 尚未创建, 后端还没成功运行过
)
echo    媒体文件      : %MEDIA_FILES% 个 / %MEDIA_SIZE%
if "%BK_COUNT%"=="0" (
  echo    备份          : 0 份   [提醒] 尚未生成任何备份
) else (
  echo    备份          : %BK_COUNT% 份, 最近一次 %BK_LATEST%
)
if "%BK_STALE%"=="1" echo    [提醒] 距上次备份已 %BK_AGEH% 小时, 请检查备份计划任务是否正常。

echo.
echo   --- 访问地址 ---
echo    本机          : http://localhost:%APP_PORT%/
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%j in ("%%i") do echo    局域网        : http://%%j:%APP_PORT%/
)
echo.
echo   ================================================
echo.

:end
if not "%~1"=="--quiet" pause
exit /b 0
