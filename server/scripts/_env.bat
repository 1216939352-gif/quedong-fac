@echo off
rem ==========================================================
rem  鹊动系统 - 公共环境探测（供其它脚本 call，请勿直接双击）
rem  产出变量: ENV_OK / SRV_DIR / APP_DIR / NODE_EXE / NODE_FLAGS
rem            NODE_VER / APP_PORT / SVC_NAME / TASK_* / LOG_DIR
rem
rem  注意: 本文件必须以 GBK(cp936) 编码保存, 且不要执行 chcp 65001,
rem        否则含中文的目录路径(%%~dp0)会被破坏。
rem ==========================================================
set "ENV_OK=0"

rem ---------- 目录定位 ----------
pushd "%~dp0.." >nul 2>&1
set "SRV_DIR=%CD%"
popd >nul 2>&1
pushd "%SRV_DIR%\.." >nul 2>&1
set "APP_DIR=%CD%"
popd >nul 2>&1

set "LOG_DIR=%SRV_DIR%\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1

rem ---------- 常量 ----------
if not defined APP_PORT set "APP_PORT=8080"
set "SVC_NAME=QuedongBackend"
set "TASK_SVC=QuedongBackend"
set "TASK_BK1=QuedongBackup-0030"
set "TASK_BK2=QuedongBackup-1230"

rem ---------- 定位 node.exe ----------
rem 优先使用正式安装的 Node（服务要长期稳定运行，不绑定到临时/托管运行时）
set "NODE_EXE="
if defined QD_NODE if exist "%QD_NODE%" set "NODE_EXE=%QD_NODE%"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%i"

if not defined NODE_EXE (
  echo.
  echo   [错误] 未找到 Node.js 运行环境。
  echo.
  echo   请先安装 Node.js 22.5 或更高版本: https://nodejs.org/  ^(选 LTS 版即可^)
  echo   安装完成后, 关闭本窗口重新运行本脚本。
  echo   若 Node 装在非标准位置, 可设置环境变量 QD_NODE 指向 node.exe 完整路径。
  echo.
  goto :env_end
)

rem ---------- 版本与特性探测 ----------
rem 批处理做版本比较/异常捕获极易踩转义坑, 交给 node 输出 KEY=VALUE 再回读
set "QD_PROBE=%TEMP%\qd_probe_%RANDOM%.txt"
"%NODE_EXE%" "%~dp0_probe.js" > "%QD_PROBE%" 2>nul
if not exist "%QD_PROBE%" (
  echo   [错误] Node 无法执行: %NODE_EXE%
  goto :env_end
)
for /f "usebackq delims=" %%L in ("%QD_PROBE%") do set "%%L"
del "%QD_PROBE%" >nul 2>&1

if not defined NODE_VER (
  echo   [错误] Node 探测失败: %NODE_EXE%
  goto :env_end
)
if not "%VER_OK%"=="yes" (
  echo.
  echo   [错误] Node 版本过低: %NODE_VER%
  echo   本系统数据库使用 Node 内置 node:sqlite, 需要 22.5 或更高版本。
  echo   请升级 Node.js: https://nodejs.org/
  echo.
  goto :env_end
)

set "ENV_OK=1"
:env_end
