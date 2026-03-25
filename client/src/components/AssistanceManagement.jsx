import React, { useState, useEffect, useCallback } from 'react';
import authService from '../services/authService';

function Alert({ type, text, onClose }) {
  if (!text) return null;
  const isSuccess = type === 'success';
  return (
    <div className={`flex justify-between items-start p-3 rounded-md text-sm mb-4 ${
      isSuccess
        ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
        : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
    }`}>
      <span>{text}</span>
      <button onClick={onClose} className="ml-3 opacity-60 hover:opacity-100 text-lg leading-none">×</button>
    </div>
  );
}

function KeywordTag({ keyword, onRemove, removing }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 text-xs rounded-full">
      {keyword}
      <button
        onClick={() => onRemove(keyword)}
        disabled={removing}
        title="Quitar keyword"
        className="text-green-400 hover:text-red-500 disabled:opacity-40 leading-none"
      >
        {removing ? '…' : '×'}
      </button>
    </span>
  );
}

function NumberCard({ num, onDelete, onToggle, onAddKeyword, onRemoveKeyword }) {
  const [kwInput, setKwInput] = useState('');
  const [addingKw, setAddingKw] = useState(false);
  const [removingKw, setRemovingKw] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleAddKw(e) {
    e.preventDefault();
    if (!kwInput.trim()) return;
    setAddingKw(true);
    await onAddKeyword(num.id, kwInput.trim());
    setKwInput('');
    setAddingKw(false);
  }

  async function handleRemoveKw(kw) {
    setRemovingKw(kw);
    await onRemoveKeyword(num.id, kw);
    setRemovingKw(null);
  }

  async function handleToggle() {
    setToggling(true);
    await onToggle(num.id, !num.active);
    setToggling(false);
  }

  async function handleDelete() {
    setDeleting(true);
    await onDelete(num.id);
    setDeleting(false);
  }

  return (
    <div className={`border rounded-lg p-4 space-y-3 transition-colors ${
      num.active
        ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
        : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 opacity-60'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-white truncate">{num.name || '(sin nombre)'}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{num.phone}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Toggle activo */}
          <button
            onClick={handleToggle}
            disabled={toggling}
            title={num.active ? 'Desactivar' : 'Activar'}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
              num.active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              num.active ? 'translate-x-4' : 'translate-x-1'
            }`} />
          </button>
          {/* Eliminar */}
          {confirmDelete ? (
            <span className="flex items-center gap-1 text-xs">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-600 dark:text-red-400 font-medium hover:text-red-800 disabled:opacity-50"
              >
                {deleting ? '…' : 'Sí'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                No
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              title="Eliminar número"
              className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0a1 1 0 01-1-1V5a1 1 0 011-1h6a1 1 0 011 1v1a1 1 0 01-1 1H9z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Keywords asociadas */}
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Tópicos que activan notificación (ej: pagos, bloqueos, ayuda):</p>
        <div className="flex flex-wrap gap-1.5 min-h-[24px]">
          {num.keywords.length === 0 ? (
            <span className="text-xs text-gray-400 dark:text-gray-500 italic">Sin keywords — no recibirá notificaciones</span>
          ) : (
            num.keywords.map(kw => (
              <KeywordTag
                key={kw}
                keyword={kw}
                onRemove={handleRemoveKw}
                removing={removingKw === kw}
              />
            ))
          )}
        </div>
      </div>

      {/* Agregar keyword */}
      <form onSubmit={handleAddKw} className="flex gap-2">
        <input
          type="text"
          placeholder="Ej: pagos, ayuda…"
          value={kwInput}
          onChange={e => setKwInput(e.target.value)}
          className="flex-1 px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <button
          type="submit"
          disabled={addingKw || !kwInput.trim()}
          className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 dark:bg-green-700 rounded-md hover:bg-green-700 dark:hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
        >
          {addingKw ? '…' : '+ Agregar'}
        </button>
      </form>
    </div>
  );
}

export default function AssistanceManagement() {
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState({ type: '', text: '' });
  const [form, setForm] = useState({ phone: '', name: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await authService.axios.get('/api/assistance-numbers');
      setNumbers(data.numbers ?? []);
    } catch {
      setAlert({ type: 'error', text: 'No se pudieron cargar los números.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.phone.trim()) return;
    setSaving(true);
    try {
      const { data } = await authService.axios.post('/api/assistance-numbers', {
        phone: form.phone.trim(),
        name: form.name.trim()
      });
      if (!data.ok) throw new Error(data.error || 'Error al agregar');
      setForm({ phone: '', name: '' });
      setAlert({ type: 'success', text: 'Número de asistencia agregado.' });
      await load();
    } catch (err) {
      setAlert({ type: 'error', text: err.response?.data?.error || err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await authService.axios.delete(`/api/assistance-numbers/${id}`);
      setNumbers(prev => prev.filter(n => n.id !== id));
      setAlert({ type: 'success', text: 'Número eliminado.' });
    } catch (err) {
      setAlert({ type: 'error', text: err.response?.data?.error || err.message });
    }
  }

  async function handleToggle(id, active) {
    try {
      await authService.axios.patch(`/api/assistance-numbers/${id}/toggle`, { active });
      setNumbers(prev => prev.map(n => n.id === id ? { ...n, active } : n));
    } catch (err) {
      setAlert({ type: 'error', text: err.response?.data?.error || err.message });
    }
  }

  async function handleAddKeyword(numberId, keyword) {
    try {
      const { data } = await authService.axios.post(`/api/assistance-numbers/${numberId}/keywords`, { keyword });
      if (!data.ok) throw new Error(data.error || 'Error');
      setNumbers(prev => prev.map(n =>
        n.id === numberId && !n.keywords.includes(keyword)
          ? { ...n, keywords: [...n.keywords, keyword] }
          : n
      ));
    } catch (err) {
      setAlert({ type: 'error', text: err.response?.data?.error || err.message });
    }
  }

  async function handleRemoveKeyword(numberId, keyword) {
    try {
      await authService.axios.delete(`/api/assistance-numbers/${numberId}/keywords/${encodeURIComponent(keyword)}`);
      setNumbers(prev => prev.map(n =>
        n.id === numberId
          ? { ...n, keywords: n.keywords.filter(k => k !== keyword) }
          : n
      ));
    } catch (err) {
      setAlert({ type: 'error', text: err.response?.data?.error || err.message });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 transition-colors">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">📞 Números de Asistencia</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Configura los números de WhatsApp que recibirán notificaciones cuando se detecten palabras clave en los chats.
          La palabra <strong>"ayuda"</strong> también pausa el chat automáticamente.
        </p>
      </div>

      {/* Formulario agregar */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 transition-colors">
        <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-4">Agregar número</h2>

        <Alert type={alert.type} text={alert.text} onClose={() => setAlert({ type: '', text: '' })} />

        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Teléfono (ej: 573001234567)"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            type="text"
            placeholder="Nombre del asesor (opcional)"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            type="submit"
            disabled={saving || !form.phone.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 dark:bg-green-700 rounded-md hover:bg-green-700 dark:hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
          >
            {saving ? 'Agregando…' : '+ Agregar'}
          </button>
        </form>
      </div>

      {/* Lista */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 transition-colors">
        <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-4">
          Números registrados ({numbers.length})
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 dark:border-green-400"></div>
          </div>
        ) : numbers.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
            No hay números registrados. Agrega uno arriba.
          </p>
        ) : (
          <div className="space-y-3">
            {numbers.map(num => (
              <NumberCard
                key={num.id}
                num={num}
                onDelete={handleDelete}
                onToggle={handleToggle}
                onAddKeyword={handleAddKeyword}
                onRemoveKeyword={handleRemoveKeyword}
              />
            ))}
          </div>
        )}
      </div>

      {/* Nota */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 p-4 rounded text-sm text-blue-700 dark:text-blue-300 space-y-1">
        <p>El número debe estar registrado en WhatsApp. Incluye el código de país sin el <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">+</code> (ej: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">573001234567</code>).</p>
        <p>Asocia <strong>tópicos</strong> al número (ej: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">pagos</code>, <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">bloqueos</code>). Cuando el bot detecte ese tópico en un chat, notificará a este número con el contacto y mensaje.</p>
        <p>Agrega <strong>"ayuda"</strong> para recibir alertas cuando un usuario solicite asistencia humana (también pausa el chat).</p>
      </div>
    </div>
  );
}
