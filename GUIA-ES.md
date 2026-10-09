# Guía rápida en español (Windows)

## 1. Requisitos (ya los tienes)
- Node.js 22.19 o superior
- Git
- Herramientas de Qloo: `npm install --global @qloo/qloo-harness`
- Variables `QLOO_BASE_URL` y `QLOO_TRUSTED_BASE_URL` configuradas con `setx`

## 2. Poner el proyecto en marcha
Descomprime el zip en, por ejemplo, `Documentos\tastetocontent`. En PowerShell:

```powershell
cd $HOME\Documents\tastetocontent
npm install
npm start
```

Abre http://localhost:3000 en el navegador. Arriba a la derecha verás **"Sample data"**: está usando datos de ejemplo porque aún no hay clave de Qloo.

Para pararlo: `Ctrl + C` en PowerShell.

## 3. Cuando llegue la clave de Qloo
```powershell
qloo setup --qloo
qloo setup --status
```
Debe salir **"Qloo data: ready"**. Después:

```powershell
cd $HOME\Documents\tastetocontent
npm run probe
```

Esto guarda las respuestas reales de Qloo en la carpeta `probe-output`. **Pásame el contenido de esos archivos** (no contienen la clave) y ajustaré el código a los datos reales. Luego `npm start` y el indicador pasará a **"Live Qloo data"**.

## 4. Clave del modelo de IA (para que escriba las ideas)
Sin ella, el plan se escribe con plantillas. Para ideas de verdad:
1. Crea una clave en https://console.anthropic.com (es de pago por uso; unas pocas pruebas cuestan céntimos).
2. Copia `.env.example` como `.env` y pon la clave en `ANTHROPIC_API_KEY=`.
3. Reinicia con `npm start`.

**Nunca subas el archivo `.env` a GitHub** (ya está excluido en `.gitignore`).

## 5. Qué queda por hacer
- Ajustar el código con las respuestas reales de Qloo (paso 3).
- Probar con varias audiencias y pulir los textos del plan.
- Publicar el código en GitHub (repositorio público, licencia MIT incluida).
- Alojar la demo online (Render o Railway con el `Dockerfile` incluido).
- Grabar el vídeo de demostración y entregar en Devpost antes del **31 de octubre a las 04:45** (hora de Madrid).
