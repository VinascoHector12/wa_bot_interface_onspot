# Arquitectura en Capas - WhatsApp Bot

## 📐 Estructura del Proyecto

```
src/
├── handlers/                    # 🎯 PRESENTATION LAYER
│   ├── messageHandler.js        # Manejo de eventos de mensajes
│   └── readyHandler.js          # Manejo de evento ready
│
├── services/
│   ├── business/                # 💼 BUSINESS LOGIC LAYER
│   │   ├── messageOrchestrator.js      # Orquestador principal de mensajes
│   │   ├── messageBatchService.js      # Acumulación de mensajes (batching)
│   │   ├── conversationService.js      # Lógica de LLM y conversación
│   │   ├── imageProcessingService.js   # Procesamiento OCR de imágenes
│   │   ├── audioProcessingService.js   # Procesamiento ASR de audios
│   │   ├── identityService.js          # Gestión de identidad de usuarios
│   │   ├── keywordService.js           # Detección de keywords
│   │   └── startupService.js           # Lógica de inicialización
│   │
│   ├── whatsapp.js              # 🔌 INFRASTRUCTURE - Cliente WhatsApp
│   ├── openai.js                # 🔌 INFRASTRUCTURE - Cliente OpenAI
│   └── asr.js                   # 🔌 INFRASTRUCTURE - Transcripción de audio
│
├── db/                          # 💾 DATA ACCESS LAYER
│   ├── chatRepo.mssql.js        # Repositorio de mensajes
│   ├── identityRepo.mssql.js    # Repositorio de identidades
│   └── keywordRepo.mssql.js     # Repositorio de keywords
│
├── core/                        # 🔧 CORE UTILITIES
│   ├── textUtils.js             # Utilidades de texto (sin dependencias)
│   └── fileUtils.js             # Utilidades de archivos (sin dependencias)
│
├── utils/                       # 🛠️ SHARED UTILITIES
│   ├── historyStore.js          # Gestión de historial
│   ├── identityStore.js         # Store de identidades
│   ├── locks.js                 # Control de concurrencia
│   └── ...
│
├── web/                         # 🌐 WEB INTERFACE
│   └── dashboardServer.js       # Servidor del dashboard
│
└── index.js                     # 🚀 ENTRY POINT
```

## 🏗️ Arquitectura en Capas

### 1. **Presentation Layer** (`/handlers`)
- **Responsabilidad**: Solo recibir eventos y delegar
- **NO contiene**: Lógica de negocio
- **Ejemplos**:
  - `messageHandler.js`: Recibe evento 'message' → delega a batch service
  - `readyHandler.js`: Recibe evento 'ready' → delega a startup service

### 2. **Business Logic Layer** (`/services/business`)
- **Responsabilidad**: Toda la lógica de negocio
- **Contiene**: 
  - Orquestación de flujos
  - Procesamiento de mensajes
  - Reglas de negocio
  - Coordinación entre servicios

**Servicios principales**:

#### `messageOrchestrator.js` 
Orquestador central que coordina:
- Gestión de identidad
- Carga de historial
- Delegación a procesadores específicos (texto/imagen/audio)
- Envío de respuestas

#### `messageBatchService.js`
Sistema de acumulación de mensajes:
- Agrupa mensajes del mismo usuario
- Temporizador configurable (default: 60s)
- Procesa todos juntos cuando expira

#### `conversationService.js`
Interacción con LLM:
- Generación de respuestas
- Gestión de prompts
- Filtrado de contenido

#### `imageProcessingService.js`
Procesamiento de imágenes:
- Descarga de medios
- Extracción de texto (OCR)
- Manejo de errores

#### `audioProcessingService.js`
Procesamiento de audio:
- Descarga de medios
- Transcripción (ASR)
- Manejo de errores

#### `identityService.js`
Gestión de identidad:
- Extracción de nombre/origen
- Solicitud de datos faltantes
- Validaciones

#### `keywordService.js`
Análisis de keywords:
- Detección de palabras clave
- Categorización por temas
- Persistencia en BD

### 3. **Infrastructure Layer** (`/services`)
- **Responsabilidad**: Servicios externos
- **Contiene**:
  - Cliente de WhatsApp
  - Cliente de OpenAI
  - Servicios de transcripción

### 4. **Data Access Layer** (`/db`)
- **Responsabilidad**: Acceso a base de datos
- **Contiene**: Repositorios MSSQL
- **Patrón**: Repository Pattern

### 5. **Core Layer** (`/core`)
- **Responsabilidad**: Utilidades puras sin dependencias
- **Características**:
  - Sin imports de otros módulos
  - Funciones puras
  - Reutilizables en cualquier capa

## 🔄 Flujo de Procesamiento

```
1. WhatsApp Event
   ↓
2. Handler (Presentation)
   ↓
3. Batch Service (accumulate messages)
   ↓
4. Message Orchestrator (Business Logic)
   ├→ Identity Service
   ├→ Image/Audio/Text Processing Service
   ├→ Conversation Service (LLM)
   ├→ Keyword Service
   └→ Send Response
   ↓
5. Data Layer (persist to DB)
```

## 📋 Principios Aplicados

### ✅ Separation of Concerns
Cada capa tiene responsabilidades bien definidas

### ✅ Single Responsibility
Cada servicio hace una cosa y la hace bien

### ✅ Dependency Inversion
Las capas superiores dependen de abstracciones, no de implementaciones

### ✅ DRY (Don't Repeat Yourself)
Utilidades compartidas en `/core` y `/utils`

### ✅ Clean Architecture
Independencia de frameworks y servicios externos

## 🚀 Migración Gradual

### ✅ Completado
- ✅ Handlers desacoplados
- ✅ Message Batch Service
- ✅ Business Services (imagen, audio, conversación, identidad, keywords)
- ✅ Message Orchestrator
- ✅ Core utilities

### 🔄 En Progreso
- `startupService.js`: Migrar lógica completa de `onReady.js`

### 📝 Pendiente
- Pruebas unitarias por capa
- Documentación de APIs
- Métricas y observabilidad

## 🎯 Beneficios

1. **Mantenibilidad**: Código organizado y fácil de encontrar
2. **Testabilidad**: Cada servicio se puede probar independientemente
3. **Escalabilidad**: Fácil agregar nuevas funcionalidades
4. **Reusabilidad**: Servicios compartibles entre diferentes handlers
5. **Claridad**: Separación clara de responsabilidades

## 📖 Guía de Uso

### Agregar nuevo tipo de mensaje
1. Crear servicio en `/services/business/` (ej: `videoProcessingService.js`)
2. Agregar lógica en `messageOrchestrator.js`
3. No tocar handlers ni core utilities

### Modificar lógica de negocio
1. Editar el servicio correspondiente en `/services/business/`
2. Mantener handlers simples (solo delegación)

### Agregar nueva utilidad
1. Si es pura (sin dependencias) → `/core/`
2. Si tiene dependencias → `/utils/`
