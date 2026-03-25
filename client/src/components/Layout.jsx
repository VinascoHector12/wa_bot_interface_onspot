import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import { useTheme } from '../contexts/ThemeContext';

const NAV_ITEMS = [
  { to: '/',           label: 'Chats',          icon: '💬' },
  { to: '/reports',    label: 'Reportes',        icon: '📊' },
  { to: '/keywords',   label: 'Palabras Clave',  icon: '🏷️' },
  { to: '/assistance', label: 'Asistencia',      icon: '📞' },
  { to: '/settings',   label: 'Configuración',   icon: '⚙️' },
];

function SidebarContent({ onNavigate, status, user, isDark, toggleTheme, handleLogout }) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💬</span>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white text-sm">WhatsApp Agent</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[140px]">
              {user?.tenantId}
            </p>
          </div>
        </div>
      </div>

      {/* Estado WA */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium
          bg-${status.color}-100 dark:bg-${status.color}-900/30
          text-${status.color}-800 dark:text-${status.color}-300`}>
          <span>{status.icon}</span>
          <span>{status.text}</span>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
              }`
            }
          >
            <span className="text-base flex-shrink-0">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer sidebar */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
        {/* Usuario */}
        {user && (
          <div className="px-3 py-2 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {user.nombre ? `${user.nombre} ${user.apellido || ''}`.trim() : user.email}
            </p>
            {user.role === 'admin' && (
              <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                Admin
              </span>
            )}
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-2">
          <button
            onClick={toggleTheme}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title={isDark ? 'Tema claro' : 'Tema oscuro'}
          >
            <span>{isDark ? '☀️' : '🌙'}</span>
            <span className="hidden sm:inline">{isDark ? 'Claro' : 'Oscuro'}</span>
          </button>

          <button
            onClick={handleLogout}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
          >
            <span>🚪</span>
            <span>Salir</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { sessionStatus, isReady, isAuthenticated } = useWhatsApp();
  const { isDark, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getWhatsAppStatus = () => {
    if (!sessionStatus) return { color: 'gray', text: 'Verificando...', icon: '⏳' };
    if (isReady && isAuthenticated) return { color: 'green', text: 'Conectado', icon: '✅' };
    if (isAuthenticated && !isReady) return { color: 'yellow', text: 'Autenticado', icon: '🔐' };
    if (sessionStatus.hasQR) return { color: 'orange', text: 'Esperando QR', icon: '📱' };
    return { color: 'red', text: 'Desconectado', icon: '❌' };
  };

  const status = getWhatsAppStatus();
  const sharedProps = { status, user, isDark, toggleTheme, handleLogout };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex transition-colors">

      {/* ── Overlay móvil ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar escritorio (siempre visible, pegado al viewport) ── */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 xl:w-64 bg-white dark:bg-gray-800 shadow-lg flex-shrink-0 sticky top-0 h-screen transition-colors overflow-hidden">
        <SidebarContent {...sharedProps} onNavigate={() => {}} />
      </aside>

      {/* ── Sidebar móvil (drawer) ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-gray-800 shadow-xl flex flex-col transform transition-transform duration-200 lg:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="absolute top-3 right-3">
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <SidebarContent {...sharedProps} onNavigate={() => setSidebarOpen(false)} />
      </aside>

      {/* ── Área principal ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden h-screen">

        {/* Top bar móvil */}
        <header className="lg:hidden bg-white dark:bg-gray-800 shadow-sm px-4 py-3 flex items-center justify-between flex-shrink-0 transition-colors">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1 rounded-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            aria-label="Abrir menú"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-white">
            <span>💬</span> WhatsApp Agent
          </span>

          <button
            onClick={toggleTheme}
            className="p-1 rounded-md text-gray-600 dark:text-gray-300"
          >
            {isDark ? '☀️' : '🌙'}
          </button>
        </header>

        {/* Contenido */}
        <main className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6 xl:p-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-2 transition-colors">
          <p className="text-center text-xs text-gray-400 dark:text-gray-500">
            Tenant: {user?.tenantId}
          </p>
        </footer>
      </div>
    </div>
  );
}
