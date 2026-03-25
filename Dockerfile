# ============================================
# Stage 1: Build Frontend (React + Vite)
# ============================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./

# Eliminar .env para que los build args tengan prioridad
RUN rm -f .env .env.local .env.production .env.development

# Declarar ARGs para que Vite los tome como variables de entorno en build time
ARG VITE_AUTH_SERVICE_URL
ARG VITE_LLM_SERVICE_URL
ARG VITE_CHAT_SERVICE_URL
ARG VITE_API_BASE_URL

# Exportar como ENV para que Vite los detecte
ENV VITE_AUTH_SERVICE_URL=$VITE_AUTH_SERVICE_URL
ENV VITE_LLM_SERVICE_URL=$VITE_LLM_SERVICE_URL
ENV VITE_CHAT_SERVICE_URL=$VITE_CHAT_SERVICE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ============================================
# Stage 2: Backend + Runtime
# ============================================
FROM node:20-bullseye-slim

RUN apt-get update && apt-get install -y \
    wget ca-certificates fonts-liberation libappindicator3-1 \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 \
    libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 \
    libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
    libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
    libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 \
    libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/
COPY --from=frontend-builder /app/client/dist ./client/dist

RUN mkdir -p .wwebjs_auth .wwebjs_cache src/history src/media

EXPOSE 3400

ENV NODE_ENV=production \
    DASHBOARD_PORT=3400 \
    HEADLESS=true

CMD ["node", "src/index.js"]
