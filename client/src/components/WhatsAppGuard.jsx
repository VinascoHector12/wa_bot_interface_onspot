import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useWhatsApp } from '../contexts/WhatsAppContext';

/**
 * Componente que verifica si WhatsApp está conectado
 * Redirige a /qr si no hay sesión de WhatsApp
 */
export default function WhatsAppGuard({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionStatus, loading } = useWhatsApp();

  useEffect(() => {
    // No hacer nada mientras carga
    if (loading) return;

    // Si ya estamos en /qr, no redirigir
    if (location.pathname === '/qr') return;

    // Si WhatsApp no está listo o no está autenticado, ir a QR
    if (!sessionStatus?.isReady || !sessionStatus?.isAuthenticated) {
      console.log('[WhatsAppGuard] WhatsApp no está listo, redirigiendo a QR');
      navigate('/qr', { replace: true });
    }
  }, [sessionStatus, loading, location.pathname, navigate]);

  // Mostrar loading mientras verifica
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando estado de WhatsApp...</p>
        </div>
      </div>
    );
  }

  // Si no está listo, mostrar mensaje mientras redirige
  if (!sessionStatus?.isReady || !sessionStatus?.isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Redirigiendo a vinculación de WhatsApp...</p>
        </div>
      </div>
    );
  }

  // Si está listo, mostrar el componente hijo
  return children;
}
