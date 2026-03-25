import authService from './authService';

class ChatService {
  constructor() {
    this.axios = authService.axios;
  }

  async getHelpChats() {
    try {
      const { data } = await this.axios.get('/api/help-chats');
      return data;
    } catch (error) {
      console.error('Error getting help chats:', error);
      throw error;
    }
  }

  async getChatHistory(chatId) {
    try {
      const { data } = await this.axios.get(`/api/history/${encodeURIComponent(chatId)}`);
      return data;
    } catch (error) {
      console.error('Error getting chat history:', error);
      throw error;
    }
  }

  async pauseChat(chatId) {
    try {
      const { data } = await this.axios.post(`/api/chats/${encodeURIComponent(chatId)}/pause`);
      return data;
    } catch (error) {
      console.error('Error pausing chat:', error);
      throw error;
    }
  }

  async resumeChat(chatId) {
    try {
      const { data } = await this.axios.post(`/api/chats/${encodeURIComponent(chatId)}/resume`);
      return data;
    } catch (error) {
      console.error('Error resuming chat:', error);
      throw error;
    }
  }

  async sendMessage(chatId, text) {
    try {
      const { data } = await this.axios.post(`/api/chats/${encodeURIComponent(chatId)}/message`, {
        text
      });
      return data;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  async closeChat(chatId) {
    try {
      const { data } = await this.axios.delete(`/api/chats/${encodeURIComponent(chatId)}`);
      return data;
    } catch (error) {
      console.error('Error closing chat:', error);
      throw error;
    }
  }
}

export default new ChatService();
