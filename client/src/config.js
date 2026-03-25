// Configuración de la aplicación
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const config = {
  apiUrl: API_BASE_URL,
  refreshInterval: 5000, // 5 segundos para polling de chats
  qrRefreshInterval: 3000, // 3 segundos para polling de QR
};

// URLs de los microservicios (como en el frontend de referencia)
export const API_CONFIG = {
  AUTH_SERVICE: import.meta.env.VITE_AUTH_SERVICE_URL || 'http://localhost:3004/auth',
  LLM_SERVICE: import.meta.env.VITE_LLM_SERVICE_URL || 'http://localhost:3002/chat',
  CHAT_SERVICE: import.meta.env.VITE_CHAT_SERVICE_URL || 'http://localhost:3400/waonspot', // wa-bot backend
};
