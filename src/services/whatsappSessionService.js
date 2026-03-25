import { client } from './whatsapp.js';

/**
 * Servicio para manejar el estado de la sesión de WhatsApp
 */
class WhatsAppSessionService {
  constructor() {
    this.qrCode = null;
    this.isReady = false;
    this.isAuthenticated = false;
    this.qrCallbacks = [];
    this.readyCallbacks = [];
  }

  /**
   * Inicializar listeners
   */
  initialize() {
    // Listener para QR code
    client.on('qr', (qr) => {
      console.log('[WhatsApp] QR Code recibido');
      this.qrCode = qr;
      this.isAuthenticated = false;
      
      // Notificar a todos los callbacks registrados
      this.qrCallbacks.forEach(callback => {
        try {
          callback(qr);
        } catch (error) {
          console.error('[WhatsApp] Error en QR callback:', error);
        }
      });
    });

    // Listener para ready
    client.on('ready', () => {
      console.log('[WhatsApp] Cliente listo');
      this.isReady = true;
      this.isAuthenticated = true;
      this.qrCode = null;
      
      // Notificar a todos los callbacks registrados
      this.readyCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error('[WhatsApp] Error en ready callback:', error);
        }
      });
    });

    // Listener para authenticated
    client.on('authenticated', () => {
      console.log('[WhatsApp] Sesión autenticada');
      this.isAuthenticated = true;
      this.qrCode = null;
    });

    // Listener para disconnected
    client.on('disconnected', (reason) => {
      console.log('[WhatsApp] Desconectado:', reason);
      this.isReady = false;
      this.isAuthenticated = false;
    });
  }

  /**
   * Obtener estado actual de la sesión
   */
  async getSessionStatus() {
    try {
      const state = await client.getState().catch(() => null);
      
      return {
        isReady: this.isReady,
        isAuthenticated: this.isAuthenticated,
        hasQR: !!this.qrCode,
        qrCode: this.qrCode,
        state: state || 'UNKNOWN'
      };
    } catch (error) {
      console.error('[WhatsApp] Error getting session status:', error);
      return {
        isReady: false,
        isAuthenticated: false,
        hasQR: false,
        qrCode: null,
        state: 'ERROR'
      };
    }
  }

  /**
   * Obtener el QR code actual
   */
  getQRCode() {
    return this.qrCode;
  }

  /**
   * Verificar si está listo
   */
  isClientReady() {
    return this.isReady;
  }

  /**
   * Verificar si está autenticado
   */
  isClientAuthenticated() {
    return this.isAuthenticated;
  }

  /**
   * Registrar callback para QR code
   */
  onQR(callback) {
    this.qrCallbacks.push(callback);
    
    // Si ya hay un QR, llamar inmediatamente
    if (this.qrCode) {
      callback(this.qrCode);
    }
  }

  /**
   * Registrar callback para ready
   */
  onReady(callback) {
    this.readyCallbacks.push(callback);
    
    // Si ya está listo, llamar inmediatamente
    if (this.isReady) {
      callback();
    }
  }

  /**
   * Cerrar sesión de WhatsApp
   */
  async logout() {
    try {
      await client.logout();
      this.isReady = false;
      this.isAuthenticated = false;
      this.qrCode = null;
      return { success: true };
    } catch (error) {
      console.error('[WhatsApp] Error al cerrar sesión:', error);
      throw error;
    }
  }

  /**
   * Obtener información de la sesión actual
   */
  async getInfo() {
    try {
      if (!this.isReady) {
        return null;
      }

      const info = await client.info;
      return {
        wid: info?.wid?._serialized,
        pushname: info?.pushname,
        phone: info?.wid?.user,
        platform: info?.platform
      };
    } catch (error) {
      console.error('[WhatsApp] Error getting info:', error);
      return null;
    }
  }
}

export default new WhatsAppSessionService();
