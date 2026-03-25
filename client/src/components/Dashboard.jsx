import React, { useState, useEffect } from 'react';
import chatService from '../services/chatService';
import { config } from '../config';

function cleanPhone(raw) {
  return (raw || '').replace(/@[cg]\.us$/, '');
}

export default function Dashboard() {
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    loadChats();
    const interval = setInterval(loadChats, config.refreshInterval);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedChat) {
      loadChatHistory(selectedChat.chatId);
      const interval = setInterval(() => loadChatHistory(selectedChat.chatId), config.refreshInterval);
      return () => clearInterval(interval);
    }
  }, [selectedChat]);

  const loadChats = async () => {
    try {
      const data = await chatService.getHelpChats();
      setChats(data);
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error('Error loading chats:', err);
      setError('Error al cargar los chats');
      setLoading(false);
    }
  };

  const loadChatHistory = async (chatId) => {
    try {
      const history = await chatService.getChatHistory(chatId);
      setChatHistory(history);
    } catch (err) {
      console.error('Error loading chat history:', err);
    }
  };

  const handleSelectChat = (chat) => {
    setSelectedChat(chat);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!message.trim() || !selectedChat) return;

    setSending(true);
    try {
      await chatService.sendMessage(selectedChat.chatId, message);
      setMessage('');
      await loadChatHistory(selectedChat.chatId);
    } catch (err) {
      console.error('Error sending message:', err);
      alert('Error al enviar mensaje: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const handlePauseChat = async (chatId) => {
    try {
      await chatService.pauseChat(chatId);
      await loadChats();
      
      // Actualizar el chat seleccionado inmediatamente
      if (selectedChat?.chatId === chatId) {
        setSelectedChat(prev => ({ ...prev, paused: true }));
      }
    } catch (err) {
      console.error('Error pausing chat:', err);
      alert('Error al pausar el chat');
    }
  };

  const handleResumeChat = async (chatId) => {
    try {
      await chatService.resumeChat(chatId);
      await loadChats();
      
      // Actualizar el chat seleccionado inmediatamente
      if (selectedChat?.chatId === chatId) {
        setSelectedChat(prev => ({ ...prev, paused: false }));
      }
    } catch (err) {
      console.error('Error resuming chat:', err);
      alert('Error al reanudar el chat');
    }
  };

  const handleCloseChat = async (chatId) => {
    if (!confirm('¿Cerrar este chat?')) return;
    
    try {
      await chatService.closeChat(chatId);
      await loadChats();
      if (selectedChat?.chatId === chatId) {
        setSelectedChat(null);
        setChatHistory([]);
      }
    } catch (err) {
      console.error('Error closing chat:', err);
      alert('Error al cerrar el chat');
    }
  };

  const filteredChats = chats.filter(chat =>
    chat.display.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.phone.includes(searchQuery)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 dark:border-green-400"></div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 h-full min-h-[600px]">
      {/* Sidebar - Lista de chats */}
      <div className="lg:col-span-4 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden flex flex-col max-h-96 lg:max-h-full transition-colors">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Chats Activos ({filteredChats.length})
          </h2>
          <input
            type="text"
            placeholder="Buscar chat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900 text-red-600 dark:text-red-200 text-sm">
              {error}
            </div>
          )}

          {filteredChats.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <p className="text-4xl mb-2">💬</p>
              <p>No hay chats activos</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredChats.map((chat) => (
                <div
                  key={chat.chatId}
                  onClick={() => handleSelectChat(chat)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    selectedChat?.chatId === chat.chatId ? 'bg-green-50 dark:bg-green-900 border-l-4 border-green-500' : ''
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-medium text-gray-900 dark:text-white truncate flex-1 mr-2">
                      {chat.name || cleanPhone(chat.phone)}
                    </h3>
                    {chat.paused && (
                      <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-xs rounded whitespace-nowrap">
                        Pausado
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">📞 {cleanPhone(chat.phone)}</p>
                  {chat.lastUser && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
                      Usuario: {chat.lastUser.substring(0, 40)}...
                    </p>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {new Date(chat.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main - Chat conversation */}
      <div className="lg:col-span-8 bg-white dark:bg-gray-800 rounded-lg shadow flex flex-col min-h-[500px] lg:min-h-0 transition-colors">
        {selectedChat ? (
          <>
            {/* Header */}
            <div className="p-3 lg:p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                  {selectedChat.name || cleanPhone(selectedChat.phone)}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-300 truncate">📞 {cleanPhone(selectedChat.phone)}</p>
              </div>

              <div className="flex space-x-2 flex-shrink-0">
                {selectedChat.paused ? (
                  <button
                    onClick={() => handleResumeChat(selectedChat.chatId)}
                    className="px-3 py-1.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-800 rounded-md text-sm flex items-center space-x-1 whitespace-nowrap transition-colors"
                  >
                    <span>▶️</span>
                    <span>Reanudar</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handlePauseChat(selectedChat.chatId)}
                    className="px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-800 rounded-md text-sm flex items-center space-x-1 whitespace-nowrap transition-colors"
                  >
                    <span>⏸</span>
                    <span>Pausar</span>
                  </button>
                )}

                <button
                  onClick={() => handleCloseChat(selectedChat.chatId)}
                  className="px-3 py-1.5 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-800 rounded-md text-sm flex items-center space-x-1 whitespace-nowrap transition-colors"
                >
                  <span>✅</span>
                  <span>Cerrar</span>
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 lg:p-4 space-y-3 bg-gray-50 dark:bg-gray-900">
              {chatHistory.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  <p>No hay mensajes aún</p>
                </div>
              ) : (
                chatHistory.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] lg:max-w-[70%] px-3 py-2 rounded-lg break-words ${
                        msg.role === 'user'
                          ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700'
                          : 'bg-green-500 dark:bg-green-600 text-white'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                      {msg.ts && (
                        <p className="text-xs mt-1 opacity-70">
                          {new Date(msg.ts).toLocaleTimeString()}
                        </p>
                      )}
                      {msg.by && (
                        <p className="text-xs mt-1 opacity-70">
                          Por: {msg.by}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input */}
            <form onSubmit={handleSendMessage} className="p-3 lg:p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="flex flex-col sm:flex-row sm:space-x-2 space-y-2 sm:space-y-0">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Escribe un mensaje..."
                  rows="2"
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={sending || !message.trim()}
                  className="px-4 sm:px-6 py-2 bg-green-600 dark:bg-green-700 text-white rounded-md hover:bg-green-700 dark:hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-1 whitespace-nowrap transition-colors"
                >
                  <span>{sending ? '⏳' : '📤'}</span>
                  <span>Enviar</span>
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Presiona Enter para enviar, Shift+Enter para nueva línea
              </p>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <p className="text-6xl mb-4">💬</p>
              <p className="text-lg">Selecciona un chat para comenzar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
