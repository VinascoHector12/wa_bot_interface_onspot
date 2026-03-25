import React, { createContext, useContext, useState, useEffect } from 'react';
import whatsappService from '../services/whatsappService';
import { config } from '../config';

const WhatsAppContext = createContext(null);

export function WhatsAppProvider({ children }) {
  const [sessionStatus, setSessionStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkSession = async () => {
    try {
      setError(null);
      const status = await whatsappService.getSessionStatus();
      setSessionStatus(status);
      setLoading(false);
      return status;
    } catch (err) {
      console.error('Error checking session:', err);
      setError(err.message);
      setLoading(false);
      return null;
    }
  };

  useEffect(() => {
    checkSession();

    // Poll para actualizar el estado de la sesión cada 10 segundos
    const interval = setInterval(checkSession, 10000);

    return () => clearInterval(interval);
  }, []);

  const refreshSession = () => {
    return checkSession();
  };

  const logout = async () => {
    try {
      await whatsappService.logout();
      await checkSession();
    } catch (err) {
      console.error('Error logging out:', err);
      throw err;
    }
  };

  return (
    <WhatsAppContext.Provider 
      value={{ 
        sessionStatus, 
        loading, 
        error,
        refreshSession,
        logout,
        isReady: sessionStatus?.isReady,
        isAuthenticated: sessionStatus?.isAuthenticated,
        hasQR: sessionStatus?.hasQR
      }}
    >
      {children}
    </WhatsAppContext.Provider>
  );
}

export function useWhatsApp() {
  const context = useContext(WhatsAppContext);
  if (!context) {
    throw new Error('useWhatsApp must be used within WhatsAppProvider');
  }
  return context;
}
