@echo off
cd /d "%~dp0"
echo 正在同步前端资源到 _dl3（局域网部署目录）...
where node >nul 2>nul
if %errorlevel%==0 ( node build-lan.js ) else ( "C://Users//侯总//.workbuddy//binaries//node//versions//22.22.2//node.exe" build-lan.js )
echo.
echo 完成。可双击「启动系统.bat」启动局域网后端。
pause
