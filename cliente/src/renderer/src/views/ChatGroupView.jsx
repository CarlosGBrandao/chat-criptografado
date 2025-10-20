// src/views/ChatGroupView.jsx

import React, { useContext } from 'react';
import { ChatGroupContext } from '../contexts/ChatGroupContext'; // Importe o contexto correto

const StatusIndicator = ({ isSecure }) => (
  <div className="flex items-center text-xs text-gray-400">
    <div className={`w-2 h-2 rounded-full mr-2 ${isSecure ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
    {isSecure ? 'Canal Seguro Estabelecido' : 'Canal inseguro. Aguardando nova chave de sessão...'}
  </div>
);

export function ChatGroupView() {
  const {
    currentUser,
    groupName,
    members,
    isChannelSecure,
    messages,
    newMessage,
    setNewMessage,
    handleSendMessage,
  } = useContext(ChatGroupContext);

  return (
    <div className="bg-gray-900 min-h-screen flex justify-center items-center p-4 font-sans">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full h-full flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center mr-3 text-white font-bold">
              {groupName?.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-lg font-semibold text-white">{groupName}</p>
              <p className="text-xs text-gray-400 truncate">Membros: {members.join(', ')}</p>
              <StatusIndicator isSecure={isChannelSecure} />
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-grow p-4 overflow-y-auto text-white">
          {messages.map((msg, index) => (
            <div key={index} className={`mb-4 flex flex-col ${msg.from === currentUser ? 'items-end' : 'items-start'}`}>
               {/* Opcional: mostrar nome do remetente se não for o usuário atual */}
              {msg.from !== currentUser && <span className="text-xs text-gray-400 mb-1">{msg.from}</span>}
              <div className={`rounded-lg px-4 py-2 max-w-xs lg:max-w-md ${msg.from === currentUser ? 'bg-blue-600' : 'bg-gray-700'}`}>
                {msg.message}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-700 flex-shrink-0">
          <div className="flex">
            <input
              type="text"
              className="w-full px-4 py-2 bg-gray-700 rounded-l-lg text-white border-2 border-gray-600 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              placeholder={isChannelSecure ? "Digite sua mensagem no grupo..." : "Aguardando canal seguro..."}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={!isChannelSecure}
            />
            <button
              onClick={handleSendMessage}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-r-lg disabled:opacity-50"
              disabled={!isChannelSecure}
            >
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}