import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import authService from '../services/authService';
import '../styles/Login.css';

export default function Login() {
  const navigate = useNavigate();
  const { login, user } = useAuth();
  const [formData, setFormData] = useState({ tenantId: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  useEffect(() => {
    authService.getTenants().then((list) => {
      const match = list.find(
        (t) =>
          t.companyName?.toLowerCase().includes('onspot') ||
          t.tenantId?.toLowerCase().includes('onspot')
      );
      if (match) setFormData((p) => ({ ...p, tenantId: match.tenantId }));
    }).catch(() => {});
  }, []);

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(formData);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="os-root">
        <div className="os-card">

          {/* FORM PANEL */}
          <div className="os-form-panel">
            {/* Logo with gradient fallback */}
            <img
              src={`${import.meta.env.BASE_URL}onspot-logo.png`}
              alt="Onspot"
              className="os-logo"
              onError={(e) => {
                e.target.style.display = 'none';
                document.getElementById('os-logo-fb').style.display = 'block';
              }}
            />
            <span id="os-logo-fb" className="os-logo-fallback" style={{ display: 'none' }}>
              Onspot
            </span>

            <h1 className="os-title">Bienvenido a Onspot</h1>
            <p className="os-subtitle">Panel de Administración</p>

            {error && <div className="os-error">{error}</div>}

            <form className="os-form" onSubmit={handleSubmit}>
              <div className="os-field">
                <label htmlFor="email">Dirección de correo electrónico</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="usuario@onspot.com"
                  autoComplete="email"
                />
              </div>

              <div className="os-field">
                <label htmlFor="password">Contraseña</label>
                <div className="os-password-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="os-eye-btn"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar' : 'Mostrar'}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="os-btn"
                disabled={loading || !formData.tenantId}
              >
                {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </button>
            </form>

            <p className="os-footer">Acceso restringido a agentes autorizados</p>
          </div>

          {/* IMAGE PANEL */}
          <div
            className="os-image-panel"
            style={{ backgroundImage: `url(${import.meta.env.BASE_URL}onspot-login.webp)` }}
          >
            <div className="os-image-overlay" />
          </div>

        </div>
      </div>
  );
}
