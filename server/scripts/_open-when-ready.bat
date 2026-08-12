@echo off
rem 等后端健康检查通过后再打开浏览器，避免用户看到白屏/连接失败
setlocal EnableExtensions
set "P=%~1"
if not defined P set "P=8080"

for /l %%i in (1,1,40) do (
  curl.exe -s -m 2 "http://127.0.0.1:%P%/health" >nul 2>&1
  if not errorlevel 1 goto :ready
  timeout /t 1 /nobreak >nul
)
rem 超时也打开，让用户能看到具体报错
:ready
start "" "http://localhost:%P%/"
exit /b 0
