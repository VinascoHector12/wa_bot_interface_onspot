import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useWhatsApp } from '../contexts/WhatsAppContext';

export default function WhatsAppQR() {
  const navigate = useNavigate();
  const { sessionStatus, refreshSession, loading } = useWhatsApp();
  const [qrCode, setQrCode] = useState(null);

  useEffect(() => {
    // Si ya está autenticado, ir al dashboard
    if (sessionStatus?.isAuthenticated && sessionStatus?.isReady) {
      navigate('/');
      return;
    }

    // Actualizar QR code
    if (sessionStatus?.qrCode) {
      setQrCode(sessionStatus.qrCode);
    }
  }, [sessionStatus, navigate]);

  const handleRefresh = () => {
    refreshSession();
  };

  if (loading && !sessionStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600 dark:border-green-400 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Verificando sesión de WhatsApp...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">📱</div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Vincular WhatsApp</h2>
          <p className="text-gray-600 dark:text-gray-300 mt-2">
            Escanea el código QR con tu teléfono
          </p>
        </div>

        {sessionStatus?.hasQR && qrCode ? (
          <div className="space-y-4">
            <div className="flex justify-center p-4 bg-white border-2 border-gray-200 dark:border-gray-600 rounded-lg">
              <QRCodeSVG 
                value={qrCode} 
                size={256}
                level="M"
                includeMargin={true}
              />
            </div>

            <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">Instrucciones:</h3>
              <ol className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-decimal list-inside">
                <li>Abre WhatsApp en tu teléfono</li>
                <li>Ve a <strong>Configuración</strong> → <strong>Dispositivos vinculados</strong></li>
                <li>Toca en <strong>Vincular un dispositivo</strong></li>
                <li>Escanea este código QR</li>
              </ol>
            </div>

            <button
              onClick={handleRefresh}
              className="w-full py-2 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md transition-colors"
            >
              🔄 Actualizar QR
            </button>
          </div>
        ) : sessionStatus?.isAuthenticated ? (
          <div className="text-center space-y-4">
            <div className="text-green-600 dark:text-green-400">
              <svg className="w-16 h-16 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <p className="text-lg font-semibold">¡WhatsApp vinculado!</p>
              <p className="text-gray-600 dark:text-gray-300 mt-2">Conectando al panel de agentes...</p>
            </div>
            <div className="animate-pulse">
              <div className="h-2 bg-green-200 dark:bg-green-700 rounded"></div>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 dark:border-green-400 mx-auto"></div>
            <p className="text-gray-600 dark:text-gray-300">Esperando código QR...</p>
            <button
              onClick={handleRefresh}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm"
            >
              Hacer clic si no aparece el QR
            </button>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            Estado: <span className="font-mono">{sessionStatus?.state || 'DESCONOCIDO'}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
