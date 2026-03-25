// src/web/dashboardServer.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  listHelpRequests, pauseChat, resumeChat, removeHelpRequest, isPaused
} from '../utils/helpDeskStore.js';
import {
  listKeywords, addKeyword, deleteKeyword, ensureTable as ensureKeywordsTable
} from '../db/configKeywordsRepo.js';
import {
  listNumbers, addNumber, deleteNumber, toggleNumber,
  addKeywordToNumber, removeKeywordFromNumber, ensureTables as ensureAssistanceTables
} from '../db/assistanceRepo.js';
import { ensureTable as ensureChatTable } from '../db/chatRepo.js';
import { ensureTable as ensureKeywordEventsTable } from '../db/keywordRepo.js';
import { invalidateKeywordCache } from '../utils/keywordRules.js';
import { extractPhone } from '../core/textUtils.js';
import { loadChatHistory, saveChatHistory } from '../utils/historyStore.js';
import { clearHumanTakeover } from '../utils/humanTakeoverStore.js';
import { client } from '../services/whatsapp.js';

// ⬇⬇⬇ API de reportes
import registerReportsApi from './reportsApi.js';

// Nuevos imports para autenticación
import authService from '../services/authService.js';
import whatsappSessionService from '../services/whatsappSessionService.js';
import { authMiddleware } from '../middlewares/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.DASHBOARD_PORT ?? 3400);

/**
 * Helper: Parsear JWT sin validar (solo para extraer claims)
 * En producción debería usar jsonwebtoken.verify() con la clave pública
 */
function parseJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = parts[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    
    // Verificar expiración
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      return null;
    }
    
    return decoded;
  } catch (error) {
    console.error('[parseJWT] Error:', error);
    return null;
  }
}

export function startDashboardServer() {
  const app = express();
  // Reescribir /waonspot/* → /* para compatibilidad con el prefijo del ALB
  app.use((req, res, next) => {
    if (req.url.startsWith('/waonspot/')) {
      req.url = req.url.slice('/waonspot'.length); // elimina /waonspot dejando /api/... o /assets/...
    } else if (req.url === '/waonspot') {
      req.url = '/';
    }
    next();
  });
  app.use(express.json());
  
  // Inicializar servicio de sesión de WhatsApp
  whatsappSessionService.initialize();

  // Crear tablas si no existen (sin sembrar datos)
  ensureChatTable()
    .catch(e => console.error('[dashboard] ensureChatTable:', e.message));
  ensureKeywordEventsTable()
    .catch(e => console.error('[dashboard] ensureKeywordEventsTable:', e.message));
  ensureKeywordsTable()
    .catch(e => console.error('[dashboard] ensureKeywordsTable:', e.message));
  ensureAssistanceTables()
    .catch(e => console.error('[dashboard] ensureAssistanceTables:', e.message));

  // ========== NUEVAS RUTAS DE AUTENTICACIÓN (sin auth) ==========
  
  // Obtener lista de tenants
  app.get('/api/auth/tenants', async (req, res) => {
    try {
      const tenants = await authService.getTenants();
      res.json({ tenants });
    } catch (error) {
      console.error('[API] Error fetching tenants:', error);
      res.status(500).json({ error: 'Failed to fetch tenants' });
    }
  });

  // Login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { tenantId, email, password } = req.body;
      
      if (!tenantId || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const result = await authService.login({ tenantId, email, password });
      
      // Validar tenant key si está configurada
      if (result.tenantKey) {
        const isValid = authService.validateTenantKey(result.tenantKey);
        if (!isValid) {
          return res.status(403).json({ error: 'Invalid tenant key for WhatsApp access' });
        }
      }

      // Decodificar el JWT para extraer campos adicionales si no vienen en la respuesta
      if (result.accessToken && !result.email) {
        try {
          const decoded = parseJWT(result.accessToken);
          if (decoded) {
            result.email = decoded.email || email; // Usar el email del token o el enviado en la petición
            if (decoded.nombre) result.nombre = decoded.nombre;
            if (decoded.apellido) result.apellido = decoded.apellido;
          }
        } catch (err) {
          console.warn('[API] Could not decode token:', err.message);
        }
      }

      res.json(result);
    } catch (error) {
      console.error('[API] Login error:', error);
      res.status(401).json({ error: error.message });
    }
  });

  // Refresh token
  app.post('/api/auth/refresh', async (req, res) => {
    try {
      const { tenantId, refreshToken } = req.body;
      
      if (!tenantId || !refreshToken) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const result = await authService.refreshToken({ tenantId, refreshToken });
      res.json(result);
    } catch (error) {
      console.error('[API] Refresh error:', error);
      res.status(401).json({ error: error.message });
    }
  });

  // Obtener estado de la sesión de WhatsApp (requiere auth JWT)
  app.get('/api/whatsapp/session', authMiddleware, async (req, res) => {
    try {
      const status = await whatsappSessionService.getSessionStatus();
      const info = await whatsappSessionService.getInfo();
      
      res.json({
        ...status,
        info
      });
    } catch (error) {
      console.error('[API] Error getting WhatsApp session:', error);
      res.status(500).json({ error: 'Failed to get session status' });
    }
  });

  // Obtener QR code para vincular WhatsApp
  app.get('/api/whatsapp/qr', authMiddleware, (req, res) => {
    try {
      const qrCode = whatsappSessionService.getQRCode();
      
      if (!qrCode) {
        return res.status(404).json({ error: 'No QR code available' });
      }

      res.json({ qrCode });
    } catch (error) {
      console.error('[API] Error getting QR:', error);
      res.status(500).json({ error: 'Failed to get QR code' });
    }
  });

  // Cerrar sesión de WhatsApp y eliminar archivos de sesión
  app.post('/api/whatsapp/logout', authMiddleware, async (req, res) => {
    try {
      console.log('[API] Cerrando sesión de WhatsApp y eliminando archivos...');
      
      // 1. Cerrar sesión en WhatsApp
      await whatsappSessionService.logout();
      
      // 2. Eliminar archivos de sesión
      const fs = await import('fs/promises');
      const sessionPath = path.join(process.cwd(), '.wwebjs_auth', 'session-bot-onspot');
      
      try {
        await fs.rm(sessionPath, { recursive: true, force: true });
        console.log('[API] Archivos de sesión eliminados');
      } catch (err) {
        console.warn('[API] No se pudieron eliminar archivos de sesión:', err.message);
      }
      
      // 3. Reinicializar el cliente para generar nuevo QR
      try {
        console.log('[API] Reinicializando cliente de WhatsApp...');
        const { client } = await import('../services/whatsapp.js');
        // Destruir el cliente actual
        await client.destroy();
        console.log('[API] Cliente destruido, inicializando nuevo cliente...');
        // Reinicializar
        await client.initialize();
        console.log('[API] Cliente reinicializado, generando nuevo QR...');
      } catch (err) {
        console.warn('[API] Error al reinicializar cliente:', err.message);
      }
      
      // 4. Notificar éxito
      res.json({ 
        success: true, 
        message: 'Sesión cerrada exitosamente. Redirigiendo a página de QR...' 
      });
    } catch (error) {
      console.error('[API] Error logging out:', error);
      res.status(500).json({ error: 'Failed to logout' });
    }
  });

  // ⬇⬇⬇ API de reportes bajo /api/reports - Ahora con JWT auth
  registerReportsApi(app, authMiddleware);

  // ========== API DEL PANEL (ahora con JWT auth) ==========

  // Lista de chats en ayuda
  app.get('/api/help-chats', authMiddleware, async (req, res) => {
    const requests = listHelpRequests();

    const items = await Promise.all(
      requests.map(async (x) => {
        let phone = x.phone || '';   // guardado en addHelpRequest si estaba disponible
        let name  = x.name  || '';
        try {
          const contact = await client.getContactById(x.chatId);
          // contact.number es el número real (ej: 573113406420), sin @c.us ni @lid
          if (!phone) phone = contact?.number || extractPhone(x.chatId);
          if (!name)  name  = (contact?.name || contact?.pushname || '').trim();
        } catch {
          if (!phone) phone = extractPhone(x.chatId);
        }

        const display = name ? `${name} - ${phone}` : phone;

        const hist = await loadChatHistory(x.chatId);
        const lastUser = [...hist].reverse().find(m => m.role === 'user')?.content ?? '';
        const lastBot  = [...hist].reverse().find(m => m.role === 'assistant')?.content ?? '';

        return {
          chatId: x.chatId,
          phone,
          name,
          display,
          createdAt: x.createdAt,
          paused: isPaused(x.chatId),
          lastUser,
          lastBot
        };
      })
    );

    items.sort((a, b) => (b.createdAt - a.createdAt));
    res.json(items);
  });

  app.get('/api/history/:chatId', authMiddleware, async (req, res) => {
    const hist = await loadChatHistory(req.params.chatId);
    res.json(hist.slice(-50));
  });

  app.post('/api/chats/:chatId/pause', authMiddleware, (req, res) => {
    pauseChat(req.params.chatId);
    res.json({ ok: true });
  });

  app.post('/api/chats/:chatId/resume', authMiddleware, (req, res) => {
    resumeChat(req.params.chatId);
    clearHumanTakeover(req.params.chatId);
    res.json({ ok: true });
  });

  // Enviar mensaje desde el panel
  app.post('/api/chats/:chatId/message', authMiddleware, async (req, res) => {
    const rawParam = req.params.chatId || '';
    const decodedParam = decodeURIComponent(rawParam);
    let chatId = decodedParam;
    const text = (req.body?.text ?? '').toString().trim();

    if (!text) return res.status(400).json({ error: 'text is required' });

    // normaliza a @c.us si es numérico
    const looksNumeric = /^\d+$/.test(chatId);
    if (looksNumeric && !/@[cg]\.us$/.test(chatId)) {
      chatId = `${chatId}@c.us`;
    }

    try {
      const state = await client.getState().catch(() => 'DISCONNECTED');
      if (!state || !/CONNECTED|OPEN/i.test(state)) {
        return res.status(503).json({ error: `WhatsApp no está listo (${state || 'UNKNOWN'}).` });
      }

      let chat = null;
      try {
        chat = await client.getChatById(chatId);
      } catch (e) {
        if (!/@[cg]\.us$/.test(decodedParam) && /^\d+$/.test(decodedParam)) {
          chatId = `${decodedParam}@c.us`;
          chat = await client.getChatById(chatId);
        } else {
          throw e;
        }
      }

      const sent = await chat.sendMessage(text);

      const hist = await loadChatHistory(chatId);
      hist.push({ role: 'assistant', content: text, ts: Date.now(), by: 'agent' });
      saveChatHistory(chatId, hist);

      return res.json({ ok: true, id: sent?.id?._serialized || null });
    } catch (e) {
      console.error('[dashboard] Error enviando mensaje:', e);
      return res.status(500).json({ error: e?.message || String(e) });
    }
  });

  app.delete('/api/chats/:chatId', authMiddleware, (req, res) => {
    removeHelpRequest(req.params.chatId);
    res.json({ ok: true });
  });

  // ========== API PALABRAS CLAVE CONFIGURABLES ==========

  app.get('/api/keywords', authMiddleware, async (req, res) => {
    try {
      const rows = await listKeywords();
      res.json({ ok: true, keywords: rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/keywords', authMiddleware, async (req, res) => {
    try {
      const { topic, keyword } = req.body ?? {};
      if (!topic?.trim() || !keyword?.trim()) {
        return res.status(400).json({ error: 'topic y keyword son requeridos' });
      }
      const row = await addKeyword(topic, keyword);
      invalidateKeywordCache();
      res.json({ ok: true, keyword: row });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/keywords/:id', authMiddleware, async (req, res) => {
    try {
      await deleteKeyword(Number(req.params.id));
      invalidateKeywordCache();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========== API NÚMEROS DE ASISTENCIA ==========

  app.get('/api/assistance-numbers', authMiddleware, async (req, res) => {
    try {
      const numbers = await listNumbers();
      res.json({ ok: true, numbers });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/assistance-numbers', authMiddleware, async (req, res) => {
    try {
      const { phone, name } = req.body ?? {};
      if (!phone?.trim()) return res.status(400).json({ error: 'phone es requerido' });
      const row = await addNumber(phone, name || '');
      res.json({ ok: true, number: row });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/assistance-numbers/:id', authMiddleware, async (req, res) => {
    try {
      await deleteNumber(Number(req.params.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/assistance-numbers/:id/toggle', authMiddleware, async (req, res) => {
    try {
      const { active } = req.body ?? {};
      await toggleNumber(Number(req.params.id), Boolean(active));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/assistance-numbers/:id/keywords', authMiddleware, async (req, res) => {
    try {
      const { keyword } = req.body ?? {};
      if (!keyword?.trim()) return res.status(400).json({ error: 'keyword es requerida' });
      await addKeywordToNumber(Number(req.params.id), keyword);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/assistance-numbers/:id/keywords/:keyword', authMiddleware, async (req, res) => {
    try {
      await removeKeywordFromNumber(Number(req.params.id), req.params.keyword);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========== RUTAS ESTÁTICAS (AL FINAL para no interferir con APIs) ==========

  // ✅ Nueva interfaz React (servir build de Vite en la raíz)
  const clientDistPath = path.join(process.cwd(), 'client', 'dist');
  
  // Servir archivos estáticos del build de React (assets, favicon, etc.)
  app.use('/waonspot', express.static(clientDistPath));
  app.use(express.static(clientDistPath));
  
  // Catch-all para React Router - Sirve index.html para todas las rutas SPA
  // IMPORTANTE: Este debe ser el ÚLTIMO handler registrado
  app.get(['/', '/waonspot', '/waonspot/', '/waonspot/login', '/waonspot/qr', '/waonspot/reports', '/waonspot/settings',
         '/login', '/qr', '/reports', '/settings'], (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });

  app.listen(PORT, () => {
    console.log(`🖥️  Panel principal: http://localhost:${PORT}/`);
  });
}

// Arrancar si se ejecuta directo: node src/web/dashboardServer.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startDashboardServer();
}
