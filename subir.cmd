@echo off
setlocal
cd /d "%~dp0"
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
git commit -m "Retry Qloo rate limits, lower concurrency, do not cache partial plans"
git push
if errorlevel 1 (
  echo.
  echo La subida ha fallado. Copia este texto y pasaselo a Claude.
) else (
  echo.
  echo Listo: cambios subidos a GitHub.
)
pause
