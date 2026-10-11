# Guía rápida en español (Windows)

## 1. Requisitos (ya los tienes)
- Node.js 22.19 o superior
- Git
- Herramientas de Qloo: `npm install --global @qloo/qloo-harness`
- Variables `QLOO_BASE_URL` y `QLOO_TRUSTED_BASE_URL` configuradas con `setx`

## 2. Arrancar la app
Abre PowerShell **dentro de la carpeta del proyecto** (en el Explorador, escribe `powershell` en la barra de direcciones y pulsa Enter):

```powershell
npm install
npm start
```

Abre http://localhost:3000. Para pararla: `Ctrl + C`.
Si necesitas escribir otros comandos mientras la app funciona, abre una **segunda** ventana de PowerShell.

## 3. Actualizar el proyecto con una versión nueva
Cuando te pase un `tastetocontent.zip` nuevo:

1. Para la app con `Ctrl + C`.
2. Descarga el zip en tu carpeta **Descargas**.
3. En PowerShell, dentro de la carpeta del proyecto, comprueba que se llama `tastetocontent`:
   ```powershell
   Split-Path -Leaf (Get-Location)
   ```
4. Descomprime encima (sustituye los archivos del proyecto, pero **conserva** tu `.env`, Git y `node_modules`):
   ```powershell
   Expand-Archive -Path "$HOME\Downloads\tastetocontent.zip" -DestinationPath .. -Force
   ```
   Si el navegador guardó el archivo como `tastetocontent (1).zip`, cambia el nombre en el comando.
5. Arranca de nuevo:
   ```powershell
   npm install
   npm start
   ```
6. Si todo funciona, súbelo a GitHub:
   ```powershell
   git add .
   git status
   ```
   Comprueba que **no aparece `.env`** en la lista, y entonces:
   ```powershell
   git commit -m "Describe aquí el cambio"
   git push
   ```

## 4. Cuando llegue la clave de Qloo
```powershell
qloo setup --qloo
qloo setup --status
```
Debe salir **"Qloo data: ready"**. Después:

```powershell
npm run probe
```

Esto guarda las respuestas reales de Qloo en la carpeta `probe-output`. **Pásame el contenido de esos archivos** (no contienen la clave) y ajustaré el código a los datos reales. Luego `npm start` y el indicador pasará a **"Live Qloo data"**.

## 5. Clave de Claude
Va en el archivo `.env`, en la línea `ANTHROPIC_API_KEY=`. **Nunca subas `.env` a GitHub** (ya está excluido en `.gitignore`). Si la clave falla o se queda sin saldo, la app sigue funcionando: escribe el plan con plantillas y lo avisa.

## 6. Qué queda por hacer
- Ajustar el código con las respuestas reales de Qloo (paso 4).
- Probar con varias audiencias y pulir los textos del plan.
- Alojar la demo online (Render o Railway con el `Dockerfile` incluido).
- Grabar el vídeo de demostración (menos de 3 minutos) y escribir la descripción en inglés.
- Entregar en Devpost antes del **31 de octubre a las 04:45** (hora de Madrid).
