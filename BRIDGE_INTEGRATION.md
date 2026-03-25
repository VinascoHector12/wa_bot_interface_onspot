# Integración WhatsApp Bot con Bridge Service

## ✅ Cambios Implementados

### 1. Nuevo Cliente Bridge (`src/services/bridgeClient.js`)
- Cliente HTTP para comunicarse con `whatsapp_bridge_service`
- Maneja autenticación con API Key
- Health check para verificar disponibilidad del bridge
- Envía mensajes y recibe respuestas del LLM

### 2. Modificaciones en Conversation Service
**Archivo**: `src/services/business/conversationService.js`

- ✅ Importa `bridgeClient`
- ✅ Detecta si `USE_BRIDGE_SERVICE=true` en `.env`
- ✅ Intenta usar bridge primero si está habilitado
- ✅ Fallback automático a OpenAI directo si bridge falla
- ✅ Nuevos parámetros `phone` y `userName` en todas las funciones

### 3. Modificaciones en Message Orchestrator
**Archivo**: `src/services/business/messageOrchestrator.js`

- ✅ Pasa `phone` y `userName` (extraído de `identity`) a las funciones de conversación
- ✅ Funciona para mensajes de texto, OCR (imágenes) y ASR (audio)

### 4. Configuración Actualizada
**Archivo**: `src/.env`

```env
# Bridge Service (Integración con Stack Multitenant)
USE_BRIDGE_SERVICE=true
BRIDGE_SERVICE_URL=http://localhost:3005
WHATSAPP_API_KEY=wa_company2_18af0ed3f01c65f752d38eb418f38f29

# OpenAI (Fallback si bridge falla)
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini
```

### 5. Health Check en Inicio
**Archivo**: `src/index.js`

- ✅ Verifica conexión con bridge al iniciar
- ✅ Muestra logs informativos del estado
- ✅ No bloquea el inicio si bridge está caído

---

## 🔄 Flujo de Procesamiento

### Modo Bridge (Actual)
```
WhatsApp → wa-bot → bridgeClient
                        ↓
                   whatsapp_bridge_service
                        ↓
            ┌───────────┴───────────┐
            ↓                       ↓
    basic_chat_llm_service    PostgreSQL
            ↓                       ↓
         OpenAI                  Messages
          RAG                    Persist
            ↓                       ↓
        Response ← ← ← ← ← ← ← Redis Pub
                                    ↓
                            Admin Dashboard (SSE)
```

### Modo Fallback (Si bridge falla)
```
WhatsApp → wa-bot → OpenAI (directo)
            ↓
        Response
```

---

## 📋 Próximos Pasos

### Fase 3: ✅ Completada
- [x] Crear `bridgeClient.js`
- [x] Modificar `conversationService.js`
- [x] Modificar `messageOrchestrator.js`
- [x] Actualizar `.env`
- [x] Agregar health check en `index.js`

### Fase 4: Migración de Training Data (Pendiente)
- [ ] Crear script para leer archivos `.txt` de `src/prompts/`
- [ ] POST a `basic_chat_llm_service` `/v1/rag/documents`
- [ ] Verificar embeddings generados
- [ ] Actualizar `system_prompt` si es necesario

### Fase 5: Testing
- [ ] Enviar mensaje de prueba por WhatsApp
- [ ] Verificar logs del bridge service
- [ ] Confirmar que aparece en dashboard de admin
- [ ] Verificar persistencia en PostgreSQL
- [ ] Probar fallback deshabilitando bridge

---

## 🧪 Testing Manual

### 1. Verificar Bridge está corriendo
```bash
curl http://localhost:3005/health \
  -H "X-API-Key: wa_company2_18af0ed3f01c65f752d38eb418f38f29"
```

**Respuesta esperada**:
```json
{
  "status": "ok",
  "databases": {
    "auth": true,
    "chat": true
  }
}
```

### 2. Iniciar wa-bot
```bash
cd wa-bot-prod-interface-v3
npm start
```

**Logs esperados**:
```
[Bridge] Modo habilitado, verificando conexión...
[Bridge] ✅ Conexión exitosa con bridge service
[MessageHandler] ✅ Handler registrado
```

### 3. Enviar mensaje de prueba
- Envía un mensaje de WhatsApp al número del bot
- Observa los logs del wa-bot
- Observa los logs del bridge service

**Logs esperados en bridge**:
```
[whatsapp_bridge_service] Processing message: {tenantId: 'company2', phone: '573001234567'}
[whatsapp_bridge_service] Calling LLM service...
[whatsapp_bridge_service] Published to Redis: chat:company2:whatsapp-573001234567
[whatsapp_bridge_service] Message processed successfully
```

### 4. Verificar Dashboard
- Abre el admin dashboard en el navegador
- Deberías ver una notificación con el mensaje de WhatsApp
- Icono 📱 indicando que es WhatsApp

---

## 🔧 Troubleshooting

### Bridge no responde
```bash
# Ver logs del bridge
docker logs llm_multitenant_stack_with_auth-whatsapp_bridge_service-1

# Verificar que está corriendo
docker ps | grep whatsapp_bridge
```

### Fallback a OpenAI activado
- Mensaje en logs: `[ConversationService] Bridge failed, falling back to OpenAI`
- Causas comunes:
  - Bridge service no está corriendo
  - API Key incorrecta en `.env`
  - Error de red (puerto 3005 no accesible)

### Mensajes no aparecen en dashboard
- Verificar Redis está corriendo
- Verificar que admin está conectado al SSE
- Ver logs del llm_chat_service

---

## 📊 Ventajas de la Integración

✅ **Centralización**: Toda la lógica de AI en un solo lugar (stack multitenant)  
✅ **RAG Compartido**: WhatsApp usa el mismo RAG que la web  
✅ **Persistencia**: Todos los chats en PostgreSQL para analytics  
✅ **Dashboard**: Admins ven conversaciones de WhatsApp en tiempo real  
✅ **Escalabilidad**: Múltiples bots pueden usar el mismo bridge  
✅ **Fallback**: Si bridge falla, wa-bot sigue funcionando con OpenAI directo  
✅ **Seguridad**: API Keys por tenant, sin exposición de credenciales  

---

## 🎯 Estado del Proyecto

| Fase | Estado | Descripción |
|------|--------|-------------|
| 1 | ✅ | Diseño de arquitectura |
| 2 | ✅ | Creación de whatsapp_bridge_service |
| 3 | ✅ | Modificación de wa-bot para usar bridge |
| 4 | ⏳ | Migración de training data a RAG |
| 5 | ⏳ | Testing end-to-end |

**Última actualización**: 2026-01-30
