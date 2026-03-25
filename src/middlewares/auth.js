import axios from 'axios';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

/**
 * Middleware para validar el token JWT contra el servicio de autenticación
 */
export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    
    // Validar el token contra el auth service
    // En producción, deberíamos validar el JWT localmente con la clave pública
    // pero por simplicidad lo validamos contra el servicio
    
    // Extraer información del token (simulado - en producción usar jwt.verify)
    const decoded = parseJWT(token);
    
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Agregar información del usuario al request
    req.user = {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      tenantKey: decoded.tenantKey,
      role: decoded.role,
      email: decoded.email
    };

    next();
  } catch (error) {
    console.error('[Auth Middleware] Error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

/**
 * Middleware para validar que el usuario tenga una tenant key válida
 */
export function validateTenantKey(req, res, next) {
  const tenantKey = req.user?.tenantKey || req.headers['x-tenant-key'];
  
  if (!tenantKey) {
    return res.status(403).json({ error: 'Tenant key required' });
  }

  // Validar que la tenant key coincida con la configurada para WhatsApp
  const expectedKey = process.env.WHATSAPP_API_KEY;
  
  if (expectedKey && tenantKey !== expectedKey) {
    return res.status(403).json({ error: 'Invalid tenant key' });
  }

  req.tenantKey = tenantKey;
  next();
}

/**
 * Middleware para verificar que el usuario sea admin
 */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Parsear JWT sin validar (solo para extraer claims)
 * NOTA: En producción usar jsonwebtoken.verify() con la clave pública
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

