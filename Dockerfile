# Container for hosting the demo (Render, Railway, Fly.io...).
# Qloo's harness must run next to the backend: serverless platforms are not supported.
FROM node:22-slim

ENV NODE_ENV=production \
    QLOO_BASE_URL=https://hackathon.api.qloo.com \
    QLOO_TRUSTED_BASE_URL=https://hackathon.api.qloo.com \
    PORT=3000

RUN npm install --global @qloo/qloo-harness@0.1.26

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

# Provide QLOO_API_KEY and ANTHROPIC_API_KEY as secrets in your hosting dashboard.
EXPOSE 3000
CMD ["node", "server.mjs"]
