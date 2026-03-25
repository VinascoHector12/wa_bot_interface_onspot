import React, { useState, useEffect } from 'react';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import axios from 'axios';
import { API_CONFIG } from '../config';

export default function Settings() {
  const { sessionStatus, refreshSession } = useWhatsApp();
  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    refreshSession();
  }, []);

  const handleDisconnect = async () => {
    if (!confirm('¿Estás seguro de que deseas desconectar WhatsApp?\n\nEsto eliminará la sesión actual y serás redirigido a la página de QR para vincular una nueva línea.')) {
      return;
    }

    setDisconnecting(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await axios.post(
        `${API_CONFIG.CHAT_SERVICE}/api/whatsapp/logout`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      setMessage({
        type: 'success',
        text: 'Sesión desconectada exitosamente. Redirigiendo a página de QR...'
      });

      // Redirigir a la página de QR después de 1.5 segundos
      setTimeout(() => {
        window.location.href = '/waonspot/qr';
      }, 1500);

    } catch (error) {
      console.error('Error disconnecting WhatsApp:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Error al desconectar WhatsApp'
      });
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 dark:border-green-400"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 transition-colors">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">⚙️ Configuración</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Administra la configuración del sistema y la sesión de WhatsApp
        </p>
      </div>

      {/* Mensaje de feedback */}
      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
        }`}>
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      {/* Sesión de WhatsApp */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 transition-colors">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
              <span className="text-2xl mr-2">📱</span>
              WhatsApp Vinculado
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Información de la línea de WhatsApp conectada
            </p>
          </div>
          
          {sessionStatus?.isReady && (
            <span className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full text-sm font-medium">
              ✓ Conectado
            </span>
          )}
        </div>

        {sessionStatus?.isReady && sessionStatus?.info ? (
          <div className="space-y-4">
            {/* Información de la sesión */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Número
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white font-mono">
                  +{sessionStatus.info.phone || 'No disponible'}
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Nombre
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {sessionStatus.info.pushname || 'Sin nombre'}
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Plataforma
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {sessionStatus.info.platform || 'WhatsApp'}
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Estado
                </p>
                <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                  Operativo
                </p>
              </div>
            </div>

            {/* Botón de desconectar */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <span className="text-2xl">⚠️</span>
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">
                      Advertencia
                    </h3>
                    <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                      Al desconectar WhatsApp, se eliminará la sesión actual y serás redirigido a la página de QR para vincular una nueva línea.
                    </p>
                    <button
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="px-4 py-2 bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-600 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {disconnecting ? (
                        <>
                          <span className="inline-block animate-spin mr-2">⏳</span>
                          Desconectando...
                        </>
                      ) : (
                        <>
                          🔌 Desconectar WhatsApp
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📵</div>
            <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">
              No hay WhatsApp conectado
            </p>
            <p className="text-gray-500 dark:text-gray-500 text-sm">
              Vincula un número de WhatsApp escaneando el código QR en la página de inicio
            </p>
          </div>
        )}
      </div>

      {/* Información del sistema */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 transition-colors">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center mb-4">
          <span className="text-2xl mr-2">ℹ️</span>
          Información del Sistema
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Versión del Panel
            </p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              v3.0.0
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Estado del Servidor
            </p>
            <p className="text-lg font-semibold text-green-600 dark:text-green-400">
              ✓ En línea
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
