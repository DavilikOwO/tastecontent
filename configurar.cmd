@echo off
setlocal
cd /d "%~dp0"
title TasteToContent - configurar
echo.
echo ==== TasteToContent: conectar con GitHub, instalar y subir ====
echo.

where git >nul 2>&1 || (echo No encuentro Git en este ordenador. & pause & exit /b 1)
where npm >nul 2>&1 || (echo No encuentro Node.js en este ordenador. & pause & exit /b 1)

if exist ".git" goto have_git
echo Abre tu repositorio en github.com y copia la direccion de la barra del navegador.
echo Ejemplo: https://github.com/tu-usuario/tastetocontent
echo (Tambien vale escribir solo tu usuario de GitHub.)
echo.
set "REPO="
set /p REPO=Pega aqui la direccion (clic derecho para pegar) y pulsa Enter: 
if "%REPO%"=="" (echo No has escrito nada. & pause & exit /b 1)
echo %REPO% | findstr /b /i "http" >nul
if errorlevel 1 set "REPO=https://github.com/%REPO%/tastetocontent"
git init -q
git remote add origin %REPO%
echo.
echo Conectando con %REPO% ...
git fetch origin
if errorlevel 1 goto bad_repo
git reset -q --soft origin/main
if errorlevel 1 goto bad_repo
git branch -M main
git branch --set-upstream-to=origin/main main >nul
echo Conectado con GitHub.
goto have_git

:bad_repo
echo.
echo No he podido conectar con ese repositorio. Revisa la direccion y vuelve a abrir este programa.
echo Si el error de arriba no se entiende, haz una captura y pasasela a Claude.
rmdir /s /q ".git"
pause
exit /b 1

:have_git
echo.
echo ==== Instalando dependencias (puede tardar un minuto) ====
call npm install --no-fund --no-audit
if errorlevel 1 (echo La instalacion ha fallado. Copia este mensaje y pasaselo a Claude. & pause & exit /b 1)

if exist ".env" goto have_env
copy /y ".env.example" ".env" >nul
echo.
echo ==== Tu clave de Claude ====
echo Ahora se abrira el Bloc de notas. Pega tu clave de Claude justo detras de
echo ANTHROPIC_API_KEY=   (sin espacios), guarda con Ctrl+S y cierra el Bloc de notas.
echo.
pause
start /wait notepad ".env"

:have_env
echo.
echo ==== Comprobando la clave de Qloo ====
call qloo setup --status

echo.
echo ==== Subiendo a GitHub ====
git add -A
git ls-files --error-unmatch .env >nul 2>&1
if not errorlevel 1 (echo ATENCION: el archivo .env iba a subirse. Paro aqui sin subir nada. & git reset -q & pause & exit /b 1)
git status --short
git commit -q -m "Usage limits and Render deployment"
git push -u origin main
if errorlevel 1 (echo La subida ha fallado. Copia este mensaje y pasaselo a Claude. & pause & exit /b 1)

echo.
echo ==== Listo: proyecto conectado con GitHub, instalado y subido ====
echo Ya puedes cerrar esta ventana.
pause
