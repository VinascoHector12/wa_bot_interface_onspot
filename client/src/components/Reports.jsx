import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import reportsService from '../services/reportsService';
import dayjs from 'dayjs';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('trends'); // 'trends' o 'keywords'
  const [dateRange, setDateRange] = useState({
    from: dayjs().subtract(6, 'days').format('YYYY-MM-DD'),
    to: dayjs().format('YYYY-MM-DD')
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopics, setSelectedTopics] = useState('');
  
  // Datos de tendencias
  const [trendsChartData, setTrendsChartData] = useState(null);
  const [trendsTableData, setTrendsTableData] = useState([]);
  
  // Datos de keywords
  const [keywordsChartData, setKeywordsChartData] = useState(null);
  const [keywordsTableData, setKeywordsTableData] = useState([]);

  const TOPICS = ['pagos', 'cuentas', 'cambiar cuenta', 'bloqueos', 'documentos', 
                  'ayuda', 'token', 'monetizacion', 'vinculacion', 'soporte'];

  const TOPIC_COLORS = {
    'pagos': 'rgb(34, 197, 94)',           // green
    'cuentas': 'rgb(59, 130, 246)',        // blue
    'cambiar cuenta': 'rgb(251, 146, 60)', // orange
    'bloqueos': 'rgb(239, 68, 68)',        // red
    'documentos': 'rgb(168, 85, 247)',     // purple
    'ayuda': 'rgb(245, 158, 11)',          // amber
    'token': 'rgb(20, 184, 166)',          // teal
    'monetizacion': 'rgb(236, 72, 153)',   // pink
    'vinculacion': 'rgb(124, 58, 237)',    // violet
    'soporte': 'rgb(100, 116, 139)',       // slate
  };

  useEffect(() => {
    loadReports();
  }, [dateRange, selectedTopics]);

  const loadReports = async () => {
    setLoading(true);
    try {
      if (activeTab === 'trends') {
        await loadTrendsData();
      } else {
        await loadKeywordsData();
      }
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTrendsData = async () => {
    // Cargar mensajes diarios
    const dailyData = await reportsService.getMessagesDailyReport({
      from: dateRange.from,
      to: dateRange.to
    });

    // Cargar tabla de usuarios
    const usersData = await reportsService.getUsersReport({
      from: dateRange.from,
      to: dateRange.to,
      search: searchQuery,
      limit: 100,
      sort: 'total_desc'
    });

    processTrendsChart(dailyData);
    setTrendsTableData(usersData);
  };

  const loadKeywordsData = async () => {
    // Cargar keywords diarios
    const keywordsDaily = await reportsService.getKeywordsDailyReport({
      from: dateRange.from,
      to: dateRange.to,
      topics: selectedTopics
    });

    // Cargar tabla de usuarios con keywords
    const keywordsUsers = await reportsService.getKeywordsUsersReport({
      from: dateRange.from,
      to: dateRange.to,
      search: searchQuery,
      limit: 100,
      sort: 'total_desc',
      topics: selectedTopics
    });

    processKeywordsChart(keywordsDaily);
    setKeywordsTableData(keywordsUsers);
  };

  const processTrendsChart = (data) => {
    const labels = data.map(d => dayjs(d.day_local).format('DD/MM'));
    
    const datasets = [
      {
        label: 'Chats',
        data: data.map(d => d.chats || 0),
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.4,
      },
      {
        label: 'Preguntas (user)',
        data: data.map(d => d.user_msgs || 0),
        borderColor: 'rgb(251, 146, 60)',
        backgroundColor: 'rgba(251, 146, 60, 0.1)',
        tension: 0.4,
      },
      {
        label: 'Respuestas (bot)',
        data: data.map(d => d.assistant_msgs || 0),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
      }
    ];

    setTrendsChartData({ labels, datasets });
  };

  const processKeywordsChart = (data) => {
    // Agrupar por día
    const dayMap = {};
    data.forEach(item => {
      const day = dayjs(item.day_local).format('DD/MM');
      if (!dayMap[day]) {
        dayMap[day] = {};
        TOPICS.forEach(t => dayMap[day][t] = 0);
      }
      if (item.topic && dayMap[day].hasOwnProperty(item.topic)) {
        dayMap[day][item.topic] = (item.total || 0);
      }
    });

    const labels = Object.keys(dayMap);
    const datasets = TOPICS.map(topic => ({
      label: topic.charAt(0).toUpperCase() + topic.slice(1),
      data: labels.map(day => dayMap[day][topic] || 0),
      backgroundColor: TOPIC_COLORS[topic] || 'rgb(156, 163, 175)',
    }));

    setKeywordsChartData({ labels, datasets });
  };

  const handleDateChange = (field, value) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  const handleApplyFilters = () => {
    loadReports();
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    // Recargar datos cuando cambia el tab
    setTimeout(() => {
      if (tab === 'trends') {
        loadTrendsData();
      } else {
        loadKeywordsData();
      }
    }, 0);
  };

  if (loading && !trendsChartData && !keywordsChartData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 dark:border-green-400"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Chats */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 transition-colors">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-12 w-12 rounded-md bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                <span className="text-2xl">💬</span>
              </div>
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Chats</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {trendsChartData?.datasets?.[0]?.data?.reduce((sum, val) => sum + Number(val), 0) || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Total Usuarios */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 transition-colors">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-12 w-12 rounded-md bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                <span className="text-2xl">👥</span>
              </div>
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Usuarios Activos</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {trendsTableData?.length || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Total Preguntas */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 transition-colors">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                <span className="text-2xl">❓</span>
              </div>
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Preguntas</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {trendsChartData?.datasets?.[1]?.data?.reduce((sum, val) => sum + val, 0) || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Total Respuestas */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 transition-colors">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-12 w-12 rounded-md bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                <span className="text-2xl">🤖</span>
              </div>
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Respuestas Bot</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {trendsChartData?.datasets?.[2]?.data?.reduce((sum, val) => sum + val, 0) || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Header Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <span className="text-3xl">📊</span>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reportes</h1>
          </div>
        </div>
        
        {/* Filtros */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Desde
            </label>
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => handleDateChange('from', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Hasta (inclusive)
            </label>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => handleDateChange('to', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Buscar (teléfono, chatId o nombre)
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
              placeholder="Ej: 57300... Juan..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleApplyFilters}
              className="w-full px-4 py-2 bg-green-600 dark:bg-green-700 hover:bg-green-700 dark:hover:bg-green-600 text-white rounded-md text-sm font-medium transition-colors"
            >
              🔄 Aplicar filtros
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg transition-colors">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex">
            <button
              onClick={() => handleTabChange('trends')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'trends'
                  ? 'border-green-500 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              📈 Tendencia de chats
            </button>
            
            <button
              onClick={() => handleTabChange('keywords')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'keywords'
                  ? 'border-green-500 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              🏷️ Palabras clave
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'trends' && (
            <>
              {/* Gráfico de tendencias */}
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Análisis de la tendencia de los chats
                </h2>
                {trendsChartData ? (
                  <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-700" style={{ height: '400px' }}>
                    <Line
                      data={trendsChartData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            position: 'bottom',
                            labels: {
                              color: document.documentElement.classList.contains('dark') ? 'rgb(229, 231, 235)' : 'rgb(55, 65, 81)',
                              padding: 15,
                            }
                          },
                          tooltip: {
                            mode: 'index',
                            intersect: false,
                          }
                        },
                        scales: {
                          x: {
                            grid: {
                              color: document.documentElement.classList.contains('dark') ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.5)',
                            },
                            ticks: {
                              color: document.documentElement.classList.contains('dark') ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
                            }
                          },
                          y: {
                            beginAtZero: true,
                            grid: {
                              color: document.documentElement.classList.contains('dark') ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.5)',
                            },
                            ticks: {
                              color: document.documentElement.classList.contains('dark') ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
                              precision: 0
                            }
                          }
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-12">
                    <p>Cargando gráfico...</p>
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">
                  Haz clic en un usuario de la tabla inferior para filtrar su curva
                </p>
              </div>

              {/* Tabla de usuarios */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Top de usuarios (rango seleccionado)
                </h2>
                {trendsTableData.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="max-h-96 overflow-y-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                              Usuario
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                              Teléfono
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                              Usuario
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                              Bot
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                              Total
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                              Último
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {trendsTableData.map((user, index) => (
                            <tr 
                              key={index} 
                              className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                            >
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                                {user.name || '—'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 font-mono">
                                {user.phone || user.chatId?.split('@')[0] || '—'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900 dark:text-gray-100">
                                {user.user_msgs || 0}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900 dark:text-gray-100">
                                {user.assistant_msgs || 0}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-semibold text-gray-900 dark:text-white">
                                {user.total || 0}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                {user.last_ts_local ? dayjs(user.last_ts_local).format('YYYY-MM-DD HH:mm:ss') : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-12 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <p>No hay datos disponibles para el rango seleccionado</p>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'keywords' && (
            <>
              {/* Filtro de categorías */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Categoría
                </label>
                <select
                  value={selectedTopics}
                  onChange={(e) => setSelectedTopics(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Todas</option>
                  {TOPICS.map(topic => (
                    <option key={topic} value={topic}>
                      {topic.charAt(0).toUpperCase() + topic.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Gráfico de keywords */}
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Palabras clave por día - Categoría ({selectedTopics || 'Todas'})
                </h2>
                {keywordsChartData ? (
                  <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-700" style={{ height: '400px' }}>
                    <Bar
                      data={keywordsChartData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            position: 'bottom',
                            labels: {
                              color: document.documentElement.classList.contains('dark') ? 'rgb(229, 231, 235)' : 'rgb(55, 65, 81)',
                              padding: 10,
                              boxWidth: 15,
                            }
                          },
                          tooltip: {
                            mode: 'index',
                            intersect: false,
                          }
                        },
                        scales: {
                          x: {
                            stacked: true,
                            grid: {
                              color: document.documentElement.classList.contains('dark') ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.5)',
                            },
                            ticks: {
                              color: document.documentElement.classList.contains('dark') ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
                            }
                          },
                          y: {
                            stacked: true,
                            beginAtZero: true,
                            grid: {
                              color: document.documentElement.classList.contains('dark') ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.5)',
                            },
                            ticks: {
                              color: document.documentElement.classList.contains('dark') ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
                              precision: 0
                            }
                          }
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-12">
                    <p>Cargando gráfico...</p>
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">
                  Haz clic en un usuario de la tabla inferior para filtrar su gráfico
                </p>
              </div>

              {/* Tabla de usuarios con keywords */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Usuarios y frecuencia de palabras clave
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {keywordsTableData.length === 0 
                    ? 'Sólo se muestran categorías con eventos > 0' 
                    : `Se listan por defecto las 100 primeras`}
                </p>
                {keywordsTableData.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="max-h-96 overflow-y-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                              Teléfono
                            </th>
                            {TOPICS.map(topic => (
                              <th 
                                key={topic} 
                                className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                              >
                                {topic}
                              </th>
                            ))}
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                              Total
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                              Último
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {keywordsTableData.map((user, index) => (
                            <tr 
                              key={index} 
                              className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                            >
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-mono">
                                {user.phone || user.chatId?.split('@')[0] || '—'}
                              </td>
                              {TOPICS.map(topic => (
                                <td 
                                  key={topic} 
                                  className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900 dark:text-gray-100"
                                >
                                  {user[topic] || '—'}
                                </td>
                              ))}
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-semibold text-gray-900 dark:text-white">
                                {user.total || 0}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                {user.last_ts_local || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-12 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <p>No hay datos de palabras clave para el rango seleccionado</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
