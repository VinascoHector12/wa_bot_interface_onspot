# 🐳 Guía de Dockerización - WA Bot Interface

## Descripción

Este servicio dockerizado combina:
- **Backend Node.js**: Bot de WhatsApp con interfaz de gestión (puerto 3400)
- **Frontend React**: Panel de administración construido con Vite
- **WhatsApp Web.js**: Cliente de WhatsApp con Puppeteer

## 📋 Requisitos previos

1. Docker y Docker Compose instalados
2. Variables de entorno configuradas (ver `.env.example`)
3. Acceso a:
   - SQL Server (Azure SQL o local)
   - Auth Service (puerto 3004)
   - OpenAI API

## 🚀 Inicio rápido

### 1. Configurar variables de entorno

Copia el archivo de ejemplo y configura tus valores:

```bash
cp wa-bot-prod-interface-v3/.env.example wa-bot-prod-interface-v3/src/.env
```

Edita `wa-bot-prod-interface-v3/src/.env` con tus credenciales.

### 2. Levantar todos los servicios

Desde la raíz del proyecto:

```bash
docker-compose up -d
```

### 3. Levantar solo el bot de WhatsApp

```bash
docker-compose up -d wa_bot_interface
```

### 4. Ver logs

```bash
docker-compose logs -f wa_bot_interface
```

## 🔗 Acceso

- **Panel principal**: http://localhost:3400
- **Panel de agentes (legacy)**: http://localhost:3400/agent
- **Reportes**: http://localhost:3400/agent/reports

## 📱 Vincular WhatsApp

1. Accede a http://localhost:3400
2. Inicia sesión con credenciales del Auth Service
3. Escanea el código QR con WhatsApp
4. La sesión se guardará en el volumen Docker

## 💾 Volúmenes persistentes

El servicio usa volúmenes Docker para persistir:

- `wa_bot_auth`: Sesión de WhatsApp (*.wwebjs_auth*)
- `wa_bot_cache`: Cache de WhatsApp
- `wa_bot_history`: Historial de conversaciones
- `wa_bot_media`: Archivos multimedia

### Gestión de volúmenes

**Ver volúmenes:**
```bash
docker volume ls | grep wa_bot
```

**Inspeccionar volumen:**
```bash
docker volume inspect wa_bot_auth
```

**Limpiar sesión de WhatsApp:**
```bash
docker-compose down
docker volume rm wa_bot_auth wa_bot_cache
docker-compose up -d wa_bot_interface
```

**Backup de datos:**
```bash
# Crear directorio de backup
mkdir -p backups

# Backup de sesión de WhatsApp
docker run --rm -v wa_bot_auth:/data -v $(pwd)/backups:/backup alpine tar czf /backup/wa_bot_auth_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .

# Backup de historial
docker run --rm -v wa_bot_history:/data -v $(pwd)/backups:/backup alpine tar czf /backup/wa_bot_history_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
```

**Restaurar backup:**
```bash
# Restaurar sesión
docker run --rm -v wa_bot_auth:/data -v $(pwd)/backups:/backup alpine sh -c "cd /data && tar xzf /backup/wa_bot_auth_YYYYMMDD_HHMMSS.tar.gz"
```

## 🔧 Troubleshooting

### El bot no se conecta a WhatsApp

1. Verifica los logs:
```bash
docker-compose logs -f wa_bot_interface
```

2. Limpia la sesión y vuelve a vincular:
```bash
docker-compose exec wa_bot_interface rm -rf .wwebjs_auth/*
docker-compose restart wa_bot_interface
```

### Error de Puppeteer/Chromium

El Dockerfile ya incluye todas las dependencias necesarias. Si hay problemas:

```bash
docker-compose build --no-cache wa_bot_interface
docker-compose up -d wa_bot_interface
```

### No se conecta a SQL Server

Verifica las variables de entorno:
```bash
docker-compose exec wa_bot_interface env | grep MSSQL
```

### Frontend no carga

Verifica que el build se completó correctamente:
```bash
docker-compose build wa_bot_interface
```

## 🛠️ Desarrollo

Para desarrollo local sin Docker:

```bash
cd wa-bot-prod-interface-v3

# Build del frontend
cd client
npm install
npm run build

# Iniciar backend
cd ..
npm install
npm start
```

## 📦 Actualización

Para actualizar el servicio con cambios nuevos:

```bash
# Detener el servicio
docker-compose down wa_bot_interface

# Rebuild sin cache
docker-compose build --no-cache wa_bot_interface

# Levantar nuevamente
docker-compose up -d wa_bot_interface
```

## 🔐 Seguridad

- No incluyas archivos `.env` en el repositorio
- El archivo `service-account.json` debe montarse como volumen read-only
- Usa variables de entorno para información sensible
- Los volúmenes persisten datos fuera del contenedor

## 📊 Monitoreo

### Estado del contenedor
```bash
docker-compose ps wa_bot_interface
```

### Uso de recursos
```bash
docker stats wa_bot_interface
```

### Inspeccionar contenedor
```bash
docker-compose exec wa_bot_interface sh
```

## 🌐 Variables de entorno importantes

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `DASHBOARD_PORT` | Puerto del servidor | 3400 |
| `MSSQL_SERVER` | Servidor SQL Server | (requerido) |
| `WA_OPENAI_API_KEY` | API Key de OpenAI | (requerido) |
| `HEADLESS` | Puppeteer sin interfaz gráfica | true |
| `AUTH_SERVICE_URL` | URL del servicio de autenticación | http://auth_service:3004 |
| `USE_BRIDGE_SERVICE` | Usar bridge service | false |

Ver todas las variables en `.env.example`.
