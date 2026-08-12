@echo off
rem ==========================================================
rem  可选：下载 nssm（Windows 服务包装器）到 server\tools\
rem
rem  不装 nssm 也能用 —— install-service.bat 会自动回落到计划任务方案。
rem  nssm 的好处：以标准 Windows 服务出现在 services.msc，崩溃自动重启、
rem  日志自动轮转，运维更规范。需要能访问 nssm.cc。
rem ==========================================================
setlocal EnableExtensions
call "%~dp0_env.bat"
if not "%ENV_OK%"=="1" goto :fail

if exist "%SRV_DIR%\tools\nssm.exe" (
  echo   已存在: %SRV_DIR%\tools\nssm.exe
  echo   直接运行 install-service.bat 即可使用 nssm 方案。
  goto :done
)

echo   正在下载 nssm 2.24 ...
set "NZIP=%TEMP%\nssm-2.24.zip"
set "NDIR=%TEMP%\nssm_extract"
curl.exe -L --max-time 90 -o "%NZIP%" "https://nssm.cc/release/nssm-2.24.zip"
if errorlevel 1 goto :dl_fail
if not exist "%NZIP%" goto :dl_fail

if exist "%NDIR%" rd /s /q "%NDIR%" >nul 2>&1
mkdir "%NDIR%" >nul 2>&1
tar -xf "%NZIP%" -C "%NDIR%" >nul 2>&1
if errorlevel 1 goto :dl_fail

set "ARCHDIR=win32"
if /i "%PROCESSOR_ARCHITECTURE%"=="AMD64" set "ARCHDIR=win64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCHDIR=win64"

if not exist "%SRV_DIR%\tools" mkdir "%SRV_DIR%\tools" >nul 2>&1
copy /y "%NDIR%\nssm-2.24\%ARCHDIR%\nssm.exe" "%SRV_DIR%\tools\nssm.exe" >nul 2>&1
rd /s /q "%NDIR%" >nul 2>&1
del "%NZIP%" >nul 2>&1

if not exist "%SRV_DIR%\tools\nssm.exe" goto :dl_fail
echo   [完成] 已保存到 %SRV_DIR%\tools\nssm.exe
echo   接下来以管理员运行 install-service.bat, 会自动改用 nssm 方案。
goto :done

:dl_fail
echo.
echo   [失败] 下载失败（本机可能无外网，或 nssm.cc 不可达）。
echo   不影响使用: 直接运行 install-service.bat, 会用 Windows 自带计划任务方案。
echo   如需手动安装: 到 https://nssm.cc/download 下载后, 把 win64\nssm.exe
echo                 放到 %SRV_DIR%\tools\nssm.exe
echo.
:fail
if not "%~1"=="--quiet" pause
exit /b 1

:done
if not "%~1"=="--quiet" pause
exit /b 0
