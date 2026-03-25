import authService from './authService';

class WhatsAppService {
  constructor() {
    this.axios = authService.axios;
  }

  async getSessionStatus() {
    try {
      const { data } = await this.axios.get('/api/whatsapp/session');
      return data;
    } catch (error) {
      console.error('Error getting session status:', error);
      throw error;
    }
  }

  async getQRCode() {
    try {
      const { data } = await this.axios.get('/api/whatsapp/qr');
      return data.qrCode;
    } catch (error) {
      console.error('Error getting QR code:', error);
      throw error;
    }
  }

  async logout() {
    try {
      const { data } = await this.axios.post('/api/whatsapp/logout');
      return data;
    } catch (error) {
      console.error('Error logging out from WhatsApp:', error);
      throw error;
    }
  }
}

export default new WhatsAppService();
