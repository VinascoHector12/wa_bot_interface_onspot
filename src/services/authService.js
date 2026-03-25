import axios from 'axios';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const LLM_SERVICE_URL = process.env.LLM_SERVICE_URL || 'http://localhost:3002';

/**
 * Servicio para manejar autenticación contra el auth_service
 */
class AuthServiceClient {
  /**
   * Obtener lista de tenants disponibles
   */
  async getTenants() {
    try {
      const response = await axios.get(`${LLM_SERVICE_URL}/v1/tenant/list`);
      return response.data.tenants || [];
    } catch (error) {
      console.error('[AuthService] Error fetching tenants:', error.message);
      throw new Error('Failed to fetch tenants');
    }
  }

  /**
   * Login de usuario
   */
  async login({ tenantId, email, password }) {
    try {
      const response = await axios.post(`${AUTH_SERVICE_URL}/v1/auth/login`, {
        tenantId,
        email,
        password
      });

      return response.data;
    } catch (error) {
      console.error('[AuthService] Login error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Login failed');
    }
  }

  /**
   * Refrescar token
   */
  async refreshToken({ tenantId, refreshToken }) {
    try {
      const response = await axios.post(`${AUTH_SERVICE_URL}/v1/auth/refresh`, {
        tenantId,
        refreshToken
      });

      return response.data;
    } catch (error) {
      console.error('[AuthService] Refresh error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Token refresh failed');
    }
  }

  /**
   * Validar un tenant key contra la configuración
   */
  validateTenantKey(tenantKey) {
    const expectedKey = process.env.WHATSAPP_API_KEY;
    
    if (!expectedKey) {
      console.warn('[AuthService] WHATSAPP_API_KEY not configured');
      return true; // Si no está configurada, permitir acceso
    }

    return tenantKey === expectedKey;
  }

  /**
   * Obtener información del tenant por su key
   */
  async getTenantByKey(tenantKey) {
    try {
      // En el sistema actual, el tenantKey se usa como WHATSAPP_API_KEY
      // Extraer el tenantId del formato: wa_companyX_hash
      const match = tenantKey.match(/^wa_([^_]+)_/);
      if (!match) {
        throw new Error('Invalid tenant key format');
      }

      const tenants = await this.getTenants();
      const tenant = tenants.find(t => 
        tenantKey.includes(t.tenantId) || 
        tenantKey.includes(t.companyName.toLowerCase().replace(/\s+/g, ''))
      );

      return tenant || null;
    } catch (error) {
      console.error('[AuthService] Error getting tenant by key:', error.message);
      return null;
    }
  }
}

export default new AuthServiceClient();
