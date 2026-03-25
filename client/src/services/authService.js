import axios from 'axios';
import { config, API_CONFIG } from '../config';

class AuthService {
  constructor() {
    // Este axios es usado por whatsappService y chatService
    // Apunta al backend de wa-bot (puerto 3400)
    this.axios = axios.create({
      baseURL: API_CONFIG.CHAT_SERVICE.endsWith('/') 
        ? API_CONFIG.CHAT_SERVICE 
        : API_CONFIG.CHAT_SERVICE + '/'
    });

    // Interceptor para agregar token a todas las peticiones
    this.axios.interceptors.request.use(
      (config) => {
        const token = this.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Interceptor para manejar errores de autenticación
    this.axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const refreshToken = this.getRefreshToken();
            const tenantId = this.getTenantId();

            if (refreshToken && tenantId) {
              const { data } = await axios.post(`${API_CONFIG.AUTH_SERVICE}/v1/auth/refresh`, {
                tenantId,
                refreshToken
              });

              this.saveTokens(data);
              originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
              
              return this.axios(originalRequest);
            }
          } catch (refreshError) {
            this.logout();
            window.location.href = '/waonspot/';
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  async getTenants() {
    try {
      const { data } = await axios.get(`${API_CONFIG.LLM_SERVICE}/v1/tenant/list`);
      return data.tenants || [];
    } catch (error) {
      console.error('Error fetching tenants:', error);
      throw new Error('No se pudieron cargar las compañías');
    }
  }

  async login({ tenantId, email, password }) {
    try {
      const { data } = await axios.post(`${API_CONFIG.AUTH_SERVICE}/v1/auth/login`, {
        tenantId,
        email,
        password
      });

      this.saveTokens(data);
      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw new Error(error.response?.data?.error || 'Error al iniciar sesión');
    }
  }

  saveTokens(data) {
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('tenantId', data.tenantId);
    localStorage.setItem('userId', data.userId);
    localStorage.setItem('role', data.role);
    localStorage.setItem('email', data.email || '');
    
    if (data.nombre) localStorage.setItem('nombre', data.nombre);
    if (data.apellido) localStorage.setItem('apellido', data.apellido);
    if (data.tenantKey) localStorage.setItem('tenantKey', data.tenantKey);
  }

  logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('tenantId');
    localStorage.removeItem('userId');
    localStorage.removeItem('role');
    localStorage.removeItem('email');
    localStorage.removeItem('nombre');
    localStorage.removeItem('apellido');
    localStorage.removeItem('tenantKey');
  }

  getToken() {
    return localStorage.getItem('accessToken');
  }

  getRefreshToken() {
    return localStorage.getItem('refreshToken');
  }

  getTenantId() {
    return localStorage.getItem('tenantId');
  }

  getUserId() {
    return localStorage.getItem('userId');
  }

  getRole() {
    return localStorage.getItem('role');
  }

  getEmail() {
    return localStorage.getItem('email');
  }

  getNombre() {
    return localStorage.getItem('nombre');
  }

  getApellido() {
    return localStorage.getItem('apellido');
  }

  getTenantKey() {
    return localStorage.getItem('tenantKey');
  }

  isAuthenticated() {
    return !!this.getToken();
  }

  isAdmin() {
    return this.getRole() === 'admin';
  }

  getUserInfo() {
    if (!this.isAuthenticated()) return null;

    return {
      userId: this.getUserId(),
      tenantId: this.getTenantId(),
      role: this.getRole(),
      email: this.getEmail(),
      nombre: this.getNombre(),
      apellido: this.getApellido(),
      tenantKey: this.getTenantKey()
    };
  }
}

export default new AuthService();
