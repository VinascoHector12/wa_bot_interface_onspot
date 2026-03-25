import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WhatsAppProvider } from './contexts/WhatsAppContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Login from './components/Login';
import WhatsAppQR from './components/WhatsAppQR';
import WhatsAppGuard from './components/WhatsAppGuard';
import Dashboard from './components/Dashboard';
import Reports from './components/Reports';
import Settings from './components/Settings';
import KeywordsManagement from './components/KeywordsManagement';
import AssistanceManagement from './components/AssistanceManagement';
import Layout from './components/Layout';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return user ? children : <Navigate to="/login" />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <WhatsAppProvider>
              <Layout>
                <Routes>
                  {/* Ruta del QR - No requiere WhatsApp conectado */}
                  <Route path="/qr" element={<WhatsAppQR />} />
                  
                  {/* Rutas protegidas - Requieren WhatsApp conectado */}
                  <Route path="/" element={
                    <WhatsAppGuard>
                      <Dashboard />
                    </WhatsAppGuard>
                  } />
                  <Route path="/reports" element={
                    <WhatsAppGuard>
                      <Reports />
                    </WhatsAppGuard>
                  } />
                  <Route path="/settings" element={
                    <WhatsAppGuard>
                      <Settings />
                    </WhatsAppGuard>
                  } />
                  <Route path="/keywords" element={
                    <WhatsAppGuard>
                      <KeywordsManagement />
                    </WhatsAppGuard>
                  } />
                  <Route path="/assistance" element={
                    <WhatsAppGuard>
                      <AssistanceManagement />
                    </WhatsAppGuard>
                  } />
                </Routes>
              </Layout>
            </WhatsAppProvider>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router basename="/waonspot">
          <AppRoutes />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
