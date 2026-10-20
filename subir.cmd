@echo off
setlocal
cd /d "%~dp0"
set "MSG=%~1"
if "%MSG%"=="" set "MSG=Update README and tidy Qloo names"
echo Subiendo cambios a GitHub...
git add -A
git diff --cached --name-only | findstr /i /r "^\.env$" >nul
if not errorlevel 1 (
  echo ERROR: .env iba a subirse. Cancelado.
  git reset -q
  pause
  exit /b 1
)
git diff --cached --name-only
git commit -m "%MSG%"
git push
if errorlevel 1 (
  echo.
  echo La subida ha fallado. Copia este texto y pasaselo a Claude.
) else (
  echo.
  echo Listo: cambios subidos a GitHub.
)
pause
