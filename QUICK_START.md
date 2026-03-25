# 🚀 Guía Rápida de Instalación y Uso

## Paso 1: Compilar el Frontend

Desde la raíz del proyecto `wa-bot-prod-interface-v3`, ejecuta:

```powershell
cd client
npm install
npm run build
cd ..
```

## Paso 2: Configurar Variables de Entorno

### Backend (wa-bot)
Asegúrate de tener estas variables en `src/.env`:

```env
# Servicios
AUTH_SERVICE_URL=http://localhost:3001
LLM_SERVICE_URL=http://localhost:3002
JWT_SECRET=super-secret-local

# WhatsApp
WHATSAPP_API_KEY=wa_company2_18af0ed3f01c65f752d38eb418f38f29

# Dashboard
DASHBOARD_PORT=3400
```

### Frontend (cliente)
**IMPORTANTE**: Si tus servicios están en puertos diferentes, crea `client/.env`:

```env
VITE_AUTH_SERVICE_URL=http://localhost:3001
VITE_LLM_SERVICE_URL=http://localhost:3002
VITE_CHAT_SERVICE_URL=http://localhost:3400
```

⚠️ **Nota**: Los valores por defecto en `client/src/config.js` ya están configurados para estos puertos. Solo necesitas crear el archivo `.env` si tus servicios usan puertos diferentes.

## Paso 3: Verificar Servicios Prerequisites

Antes de iniciar wa-bot, asegúrate de que estos servicios estén corriendo:

1. **auth_service** en puerto **3001**
2. **llm_chat_service** o **basic_chat_llm_service** en puerto **3002**

## Paso 4: Iniciar el Servidor

```powershell
npm start
```

## Paso 5: Acceder al Sistema

Abre tu navegador en: **http://localhost:3400/app**

### Credenciales de Prueba

1. Selecciona la compañía (tenant)
2. Email: `admin@company2.com` (ejemplo)
3. Contraseña: tu contraseña configurada

## Flujo de Uso

1. **Login** → Ingresa credenciales
2. **
 QR** (si no hay sesión) → Escanea con WhatsApp
3. **Dashboard** → Gestiona chats en tiempo real
4. **Reportes** → Ve estadísticas y gráficos

## Características

✅ Autenticación con JWT  
✅ Validación de tenant key  
✅ QR de WhatsApp automático  
✅ Dashboard responsive  
✅ Gráficos con Chart.js  
✅ Actualización en tiempo real  
✅ Compatible con el sistema legacy  

## Problemas Comunes

**Error "Failed to fetch tenants"**: 
- Verifica que el LLM_SERVICE esté corriendo en puerto 3002
- Verifica que la URL en `client/src/config.js` sea correcta

**Error "Invalid token"**: 
- Verifica que JWT_SECRET coincida en src/.env y en auth_service
- Asegúrate de que AUTH_SERVICE esté corriendo en puerto 3001

**Error "Login failed"**:
- Verifica que AUTH_SERVICE esté accesible en puerto 3001
- Verifica las credenciales del usuario

**No aparece el QR**: 
- Espera unos segundos y recarga
- Revisa la consola del backend para ver si hay errores de WhatsApp

**Página en blanco**: 
- Verifica que hayas compilado el frontend (`npm run build` en client/)
- Revisa la consola del navegador (F12) para ver errores de CORS o red

## Documentación Completa

Ver [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) para más detalles.
