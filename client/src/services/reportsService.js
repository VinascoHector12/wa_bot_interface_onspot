import authService from './authService';

class ReportsService {
  constructor() {
    this.axios = authService.axios;
  }

  async getMessagesDailyReport({ from, to, chatId, phone }) {
    try {
      const params = new URLSearchParams();
      if (from) params.append('from', from);
      if (to) params.append('to', to);
      if (chatId) params.append('chatId', chatId);
      if (phone) params.append('phone', phone);

      const { data } = await this.axios.get(`/api/reports/messages/daily?${params}`);
      return data;
    } catch (error) {
      console.error('Error getting daily messages report:', error);
      throw error;
    }
  }

  async getUsersReport({ from, to, search, limit = 100, offset = 0, sort = 'total_desc' }) {
    try {
      const params = new URLSearchParams();
      if (from) params.append('from', from);
      if (to) params.append('to', to);
      if (search) params.append('search', search);
      params.append('limit', limit);
      params.append('offset', offset);
      params.append('sort', sort);

      const { data } = await this.axios.get(`/api/reports/users?${params}`);
      return data;
    } catch (error) {
      console.error('Error getting users report:', error);
      throw error;
    }
  }

  async getKeywordsDailyReport({ from, to, chatId, phone, topics }) {
    try {
      const params = new URLSearchParams();
      if (from) params.append('from', from);
      if (to) params.append('to', to);
      if (chatId) params.append('chatId', chatId);
      if (phone) params.append('phone', phone);
      if (topics) params.append('topics', topics);

      const { data } = await this.axios.get(`/api/reports/keywords/daily?${params}`);
      return data;
    } catch (error) {
      console.error('Error getting keywords daily report:', error);
      throw error;
    }
  }

  async getKeywordsUsersReport({ from, to, search, limit = 100, offset = 0, sort = 'total_desc', topics }) {
    try {
      const params = new URLSearchParams();
      if (from) params.append('from', from);
      if (to) params.append('to', to);
      if (search) params.append('search', search);
      params.append('limit', limit);
      params.append('offset', offset);
      params.append('sort', sort);
      if (topics) params.append('topics', topics);

      const { data } = await this.axios.get(`/api/reports/keywords/users?${params}`);
      return data;
    } catch (error) {
      console.error('Error getting keywords users report:', error);
      throw error;
    }
  }
}

export default new ReportsService();
