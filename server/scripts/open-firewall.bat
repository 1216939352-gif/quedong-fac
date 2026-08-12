@echo off
rem ==========================================================
rem  开放防火墙入站端口 —— 局域网其它电脑要访问本机后端必须执行
rem  需要管理员权限
rem ==========================================================
setlocal EnableExtensions
call "%~dp0_env.bat"
if not "%ENV_OK%"=="1" exit /b 1

net session >nul 2>&1
if errorlevel 1 (
  echo   [错误] 需要管理员权限。请右键本文件, 选择"以管理员身份运行"。
  if not "%~1"=="--quiet" pause
  exit /b 1
)

set "RULE=Quedong Backend %APP_PORT%"
echo   正在配置防火墙规则: %RULE%
netsh advfirewall firewall delete rule name="%RULE%" >nul 2>&1
netsh advfirewall firewall add rule name="%RULE%" dir=in action=allow protocol=TCP localport=%APP_PORT% profile=any >nul 2>&1
if errorlevel 1 (
  echo   [失败] 防火墙规则添加失败, 局域网其它电脑可能无法访问。
  if not "%~1"=="--quiet" pause
  exit /b 1
)
echo   [完成] 已允许 TCP %APP_PORT% 入站。
if not "%~1"=="--quiet" pause
exit /b 0
