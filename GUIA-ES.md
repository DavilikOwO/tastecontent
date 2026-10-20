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

Esto guarda en la carpeta `probe-output` unas cuantas respuestas reales de Qloo y una ejecución completa de la app (`pipeline.json`). **Pásame esos archivos** (no contienen ninguna clave) para revisar que todo encaja con los datos reales. Luego `npm start` y el indicador pasará a **"Live Qloo data"**.

Si al configurar la clave te pregunta "Choose a model provider", pulsa Esc: no hace falta.

## 5. Clave de Claude
Va en el archivo `.env`, en la línea `ANTHROPIC_API_KEY=`. **Nunca subas `.env` a GitHub** (ya está excluido en `.gitignore`). Si la clave falla o se queda sin saldo, la app sigue funcionando: escribe el plan con plantillas y lo avisa.

## 6. Publicar la demo online (Render)
Antes, sube a GitHub la última versión (el archivo `render.yaml` tiene que estar en el repositorio).

1. Entra en https://render.com y regístrate con tu cuenta de **GitHub**.
2. Pulsa **New** y elige **Blueprint**. Conecta tu repositorio `tastetocontent`. Render leerá `render.yaml` y preparará un servicio web gratuito.
3. Te pedirá dos valores secretos. Pégalos ahí y **en ningún otro sitio**:
   - `QLOO_API_KEY`: la clave de Qloo que te llegó por email.
   - `ANTHROPIC_API_KEY`: la clave de Claude (la misma de tu archivo `.env`).
4. Pulsa **Apply** o **Deploy**. La primera construcción tarda unos minutos. Si falla, copia el final del registro (Logs) y pásamelo.
5. Abre la dirección que te da Render (algo como `https://tastetocontent.onrender.com`). Arriba a la derecha debe poner **"Live Qloo data"**.
6. Pega esa dirección en el campo **Website** del repositorio en GitHub (engranaje junto a "About").

Ten en cuenta:
- En el plan gratuito, la app **se duerme tras 15 minutos sin visitas** y tarda alrededor de un minuto en despertar. Lo indicaremos en la descripción para los jueces.
- La demo tiene **límites de uso**: 6 planes por visitante y hora, y 150 al día en total. Los planes repetidos (en caché) y las preguntas de "¿cuál querías decir?" no cuentan. Se cambian en Render, en **Environment**: `RATE_LIMIT_PER_HOUR` y `DAILY_PLAN_LIMIT`.
- Revisa en la consola de Anthropic los límites de gasto de tu cuenta, para que una demo pública nunca pueda gastar más de lo que quieras.

## 7. Qué queda por hacer
- Publicar la demo online (paso 6).
- Grabar el vídeo de demostración (menos de 3 minutos) y escribir la descripción en inglés.
- Entregar en Devpost antes del **31 de octubre a las 04:45** (hora de Madrid).
