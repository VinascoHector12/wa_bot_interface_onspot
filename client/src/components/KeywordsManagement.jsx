import React, { useState, useEffect, useCallback } from 'react';
import authService from '../services/authService';

function groupByTopic(keywords) {
  return keywords.reduce((acc, kw) => {
    if (!acc[kw.topic]) acc[kw.topic] = [];
    acc[kw.topic].push(kw);
    return acc;
  }, {});
}

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

/** Fila inline de agregar keyword dentro de un tópico existente */
function TopicAddRow({ topic, onAdd }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!value.trim()) return;
    setSaving(true);
    await onAdd(topic, value.trim());
    setValue('');
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-1.5 mt-2">
      <input
        type="text"
        placeholder="Nueva palabra…"
        value={value}
        onChange={e => setValue(e.target.value)}
        className="flex-1 px-2.5 py-1 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
      />
      <button
        type="submit"
        disabled={saving || !value.trim()}
        className="px-3 py-1 text-xs font-medium text-white bg-green-600 dark:bg-green-700 rounded-md hover:bg-green-700 dark:hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
      >
        {saving ? '…' : '+ Agregar'}
      </button>
    </form>
  );
}

export default function KeywordsManagement() {
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState({ type: '', text: '' });
  const [form, setForm] = useState({ topic: '', keyword: '' });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await authService.axios.get('/api/keywords');
      setKeywords(data.keywords ?? []);
    } catch {
      setAlert({ type: 'error', text: 'No se pudieron cargar las palabras clave.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addKeyword(topic, keyword) {
    try {
      const { data } = await authService.axios.post('/api/keywords', { topic, keyword });
      if (!data.ok) throw new Error(data.error || 'Error al agregar');
      setAlert({ type: 'success', text: `Keyword "${keyword}" agregada al tópico "${topic}".` });
      await load();
    } catch (err) {
      setAlert({ type: 'error', text: err.response?.data?.error || err.message });
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.topic.trim() || !form.keyword.trim()) return;
    setSaving(true);
    await addKeyword(form.topic.trim(), form.keyword.trim());
    setForm({ topic: '', keyword: '' });
    setSaving(false);
  }

  async function handleDelete(id) {
    setDeletingId(id);
    try {
      await authService.axios.delete(`/api/keywords/${id}`);
      setKeywords(prev => prev.filter(k => k.id !== id));
      setAlert({ type: 'success', text: 'Palabra clave eliminada.' });
    } catch (err) {
      setAlert({ type: 'error', text: err.response?.data?.error || err.message });
    } finally {
      setDeletingId(null);
    }
  }

  const grouped = groupByTopic(keywords);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 transition-colors">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">🏷️ Palabras Clave</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Define las palabras que el bot detectará en los mensajes para clasificar temas y enviar notificaciones.
        </p>
      </div>

      {/* Formulario nuevo tópico */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 transition-colors">
        <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">Agregar palabra clave</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Para agregar a un tópico existente, usa el campo "+" que aparece bajo cada grupo.
        </p>

        <Alert type={alert.type} text={alert.text} onClose={() => setAlert({ type: '', text: '' })} />

        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Tópico (ej: pagos)"
            value={form.topic}
            onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            type="text"
            placeholder="Palabra clave (ej: saldo)"
            value={form.keyword}
            onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            type="submit"
            disabled={saving || !form.topic.trim() || !form.keyword.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 dark:bg-green-700 rounded-md hover:bg-green-700 dark:hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
          >
            {saving ? 'Agregando…' : '+ Nuevo tópico / keyword'}
          </button>
        </form>
      </div>

      {/* Lista agrupada por tópico */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 transition-colors">
        <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-4">
          Keywords configuradas ({keywords.length})
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 dark:border-green-400"></div>
          </div>
        ) : keywords.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
            No hay palabras clave configuradas. El bot usará las reglas internas por defecto.
          </p>
        ) : (
          <div className="space-y-5">
            {Object.entries(grouped).map(([topic, kws]) => (
              <div key={topic} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                  {topic}
                </p>
                <div className="flex flex-wrap gap-2">
                  {kws.map(kw => (
                    <span
                      key={kw.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-800 dark:text-green-300 text-sm rounded-full"
                    >
                      {kw.keyword}
                      <button
                        onClick={() => handleDelete(kw.id)}
                        disabled={deletingId === kw.id}
                        title="Eliminar"
                        className="text-green-400 hover:text-red-500 disabled:opacity-40 leading-none"
                      >
                        {deletingId === kw.id ? '…' : '×'}
                      </button>
                    </span>
                  ))}
                </div>
                {/* Agregar keyword al tópico existente */}
                <TopicAddRow topic={topic} onAdd={addKeyword} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Nota */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 p-4 rounded text-sm text-amber-700 dark:text-amber-300">
        <strong>Nota:</strong> Si no hay keywords configuradas, el bot usa las reglas internas predeterminadas.
        La palabra <strong>"ayuda"</strong> siempre pausa el chat y notifica a los contactos de asistencia, independientemente de esta configuración.
      </div>
    </div>
  );
}
