# WhatsApp Agent Dashboard - Nueva Interfaz con Autenticación

## 🎯 Descripción

Este sistema implementa un dashboard moderno con React para el agente de WhatsApp, con las siguientes características:

- **Autenticación JWT**: Login con validación contra el servicio de autenticación
- **Validación de Tenant Key**: Verifica que el usuario tenga acceso al tenant de WhatsApp
- **QR de WhatsApp**: Muestra código QR si no hay sesión de WhatsApp activa
- **Dashboard de Agentes**: Gestión en tiempo real de chats con usuarios
- **Reportes con Gráficos**: Estadísticas visuales usando Chart.js
- **Responsivo**: Funciona en desktop, tablet y móvil

## 🏗️ Arquitectura

```
wa-bot-prod-interface-v3/
├── src/                          # Backend (Node.js + Express)
│   ├── middlewares/
│   │   └── auth.js              # Middleware de autenticación JWT
│   ├── services/
│   │   ├── authService.js       # Cliente para auth_service
│   │   └── whatsappSessionService.js  # Gestión de sesión WA
│   └── web/
│       └── dashboardServer.js   # API REST actualizada
│
└── client/                       # Frontend (React + Vite)
    ├── src/
    │   ├── components/          # Componentes React
    │   │   ├── Login.jsx        # Pantalla de login
    │   │   ├── WhatsAppQR.jsx   # Pantalla de QR
    │   │   ├── Dashboard.jsx    # Panel de chats
    │   │   ├── Reports.jsx      # Reportes con gráficos
    │   │   └── Layout.jsx       # Layout principal
    │   ├── contexts/            # React Contexts
    │   │   ├── AuthContext.jsx  # Contexto de autenticación
    │   │   └── WhatsAppContext.jsx  # Contexto de WhatsApp
    │   ├── services/            # Servicios API
    │   │   ├── authService.js
    │   │   ├── whatsappService.js
    │   │   ├── chatService.js
    │   │   └── reportsService.js
    │   └── App.jsx              # App principal con rutas
    └── package.json
```

## 🔐 Flujo de Autenticación

1. **Login**: Usuario ingresa tenant, email y contraseña
2. **Validación**: Backend valida contra `auth_service`
3. **Tenant Key**: Verifica que el usuario tenga acceso al tenant de WhatsApp
4. **Token JWT**: Almacena access token y refresh token
5. **Verificación WhatsApp**: 
   - Si hay sesión → Dashboard
   - Si no hay sesión → Pantalla de QR
6. **Auto-refresh**: Los tokens se renuevan automáticamente

## 🚀 Instalación y Configuración

### 1. Variables de Entorno

Asegúrate de tener estas variables en `src/.env`:

```bash
# Servicios de autenticación
AUTH_SERVICE_URL=http://localhost:3001
LLM_SERVICE_URL=http://localhost:3003
JWT_SECRET=super-secret-local  # Mismo que auth_service

# WhatsApp API Key (tenant key)
WHATSAPP_API_KEY=wa_company2_18af0ed3f01c65f752d38eb418f38f29

# Dashboard
DASHBOARD_PORT=3400
```

### 2. Instalar Dependencias

#### Backend (si hay cambios)
```bash
# Ya están instaladas, pero si agregaste nuevos paquetes:
npm install
```

#### Frontend (Primera vez)
```bash
cd client
npm install
```

### 3. Compilar Frontend

```bash
cd client
npm run build
```

Esto generará la carpeta `client/dist/` con los archivos estáticos.

### 4. Iniciar el Servidor

```bash
# Desde la raíz de wa-bot-prod-interface-v3
npm start
```

El servidor iniciará en:
- **Nueva interfaz React**: http://localhost:3400/app
- **Panel legacy**: http://localhost:3400/agent (con basicAuth)
- **Reportes legacy**: http://localhost:3400/agent/reports

## 📱 Uso del Sistema

### Login

1. Accede a http://localhost:3400/app
2. Selecciona la compañía (tenant)
3. Ingresa email y contraseña
4. Click en "Iniciar Sesión"

### Vinculación de WhatsApp

Si no hay sesión de WhatsApp:
1. Se mostrará automáticamente el código QR
2. Escanea con WhatsApp (Configuración → Dispositivos vinculados)
3. Una vez vinculado, serás redirigido al dashboard

### Dashboard de Agentes

**Funcionalidades:**
- Ver lista de chats activos en tiempo real
- Ver historial de conversación de cada chat
- Pausar/Reanudar bot para un chat específico
- Enviar mensajes manualmente
- Cerrar chats resueltos
- Búsqueda de chats por nombre o teléfono

**Indicadores:**
- 🟢 **Conectado**: WhatsApp listo
- 🟡 **Autenticado**: Vinculado pero no listo
- 🟠 **Esperando QR**: Necesita escanear QR
- 🔴 **Desconectado**: Sin conexión

### Reportes

Accede a la pestaña "Reportes" para ver:

**Estadísticas:**
- Total de mensajes en el período
- Usuarios activos
- Promedio de mensajes por usuario

**Gráficos:**
- 📈 **Mensajes por día**: Líneas con mensajes de usuarios vs bot
- 🥧 **Tópicos más consultados**: Distribución por categorías
- 🏆 **Top 10 usuarios**: Tabla con usuarios más activos

**Filtros:**
- Rango de fechas personalizado
- Actualización en tiempo real

## 🔧 API Endpoints

### Autenticación (sin auth requerido)

```
GET  /api/auth/tenants          # Lista de tenants disponibles
POST /api/auth/login            # Login de usuario
POST /api/auth/refresh          # Refrescar token
```

### WhatsApp (requiere JWT)

```
GET  /api/whatsapp/session      # Estado de la sesión
GET  /api/whatsapp/qr           # Obtener QR code
POST /api/whatsapp/logout       # Cerrar sesión de WhatsApp
```

### Chats (requiere JWT)

```
GET    /api/help-chats          # Lista de chats activos
GET    /api/history/:chatId     # Historial de un chat
POST   /api/chats/:chatId/pause # Pausar bot
POST   /api/chats/:chatId/resume # Reanudar bot
POST   /api/chats/:chatId/message # Enviar mensaje
DELETE /api/chats/:chatId       # Cerrar chat
```

### Reportes (requiere JWT)

```
GET /api/reports/messages/daily    # Mensajes diarios
GET /api/reports/users             # Top usuarios
GET /api/reports/keywords/daily    # Keywords por día
GET /api/reports/keywords/users    # Keywords por usuario
```

## 🛠️ Desarrollo

### Modo Desarrollo Frontend

```bash
cd client
npm run dev
```

Esto iniciará Vite en http://localhost:5173 con hot-reload.
Las peticiones a `/api/*` se proxy-arán automáticamente al backend.

### Compilar para Producción

```bash
cd client
npm run build
```

### Estructura de Tokens JWT

Los tokens incluyen:
```json
{
  "userId": "uuid",
  "tenantId": "company2",
  "tenantKey": "wa_company2_hash",
  "role": "admin|user",
  "email": "user@example.com",
  "exp": 1234567890
}
```

## 🔒 Seguridad

1. **JWT Validation**: Todos los endpoints protegidos validan el JWT
2. **Tenant Key**: Verifica que el usuario tiene acceso al tenant de WhatsApp
3. **Auto Refresh**: Los tokens se renuevan automáticamente antes de expirar
4. **HTTPS**: En producción, usar HTTPS para todas las comunicaciones
5. **Secrets**: Mantener `JWT_SECRET` y `WHATSAPP_API_KEY` seguros

## 🎨 Tecnologías Utilizadas

**Backend:**
- Express.js
- JWT (jsonwebtoken)
- Axios
- whatsapp-web.js

**Frontend:**
- React 18
- React Router DOM
- Chart.js + react-chartjs-2
- Tailwind CSS
- Vite
- Axios
- qrcode.react
- dayjs

## 📝 Notas Importantes

1. **Compatibilidad**: El panel legacy (`/agent`) sigue funcionando con basicAuth
2. **Migraciones**: Los usuarios deben migrar a la nueva interfaz (`/app`)
3. **Tokens**: Los refresh tokens expiran según la configuración del auth_service
4. **QR Code**: Se regenera automáticamente cada 30 segundos si no se escanea
5. **Polling**: Los chats se actualizan cada 5 segundos automáticamente

## 🐛 Troubleshooting

### No aparece el QR
- Verifica que el servicio de WhatsApp esté iniciado
- Revisa los logs del servidor
- Intenta hacer click en "Actualizar QR"

### Error de autenticación
- Verifica que `AUTH_SERVICE_URL` esté correcto
- Confirma que `JWT_SECRET` coincida con auth_service
- Verifica que el usuario exista en la base de datos

### Error de tenant key
- Confirma que `WHATSAPP_API_KEY` esté configurado
- Verifica que el usuario tenga asignada la tenant key correcta

### Frontend no carga
- Ejecuta `cd client && npm run build`
- Verifica que exista `client/dist/`
- Revisa los logs del servidor

## 📄 Licencia

Proyecto interno - Todos los derechos reservados
