import React, { useState, useEffect } from 'react';
// 1. Importe o socket do nosso arquivo central
import { socket } from '../socket';

export function ChatView({ currentUser, chatWithUser }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  const handleSendMessage = () => {
    if (newMessage.trim() === '') return;

    const messageData = {
      from: currentUser,
      to: chatWithUser,
      message: newMessage,
    };

    socket.emit('privateMessage', messageData);
    setMessages(prevMessages => [...prevMessages, messageData]);
    setNewMessage('');
  };

  useEffect(() => {
    // 2. Este componente NÃO precisa chamar socket.connect().
    //    Ele apenas começa a OUVIR por eventos na conexão já existente.
    
    const receiveMessageHandler = (data) => {
      // Adiciona a mensagem apenas se for desta conversa
      if (data.from === chatWithUser) {
        setMessages(prevMessages => [...prevMessages, data]);
      }
    };

    socket.on('receiveMessage', receiveMessageHandler);

    return () => {
      socket.off('receiveMessage', receiveMessageHandler);
    };
  }, [chatWithUser]); // A dependência agora é chatWithUser

  return (
    // O seu JSX que eu enviei antes está correto e pode ser mantido aqui
    <div className="bg-gray-900 min-h-screen flex justify-center items-center p-4 font-sans">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full h-full flex flex-col">
        
        {/* Cabeçalho do Chat */}
        <div className="flex items-center p-4 border-b border-gray-700 flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center mr-3 text-white font-bold">
            {chatWithUser.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-semibold text-white">Conversando com {chatWithUser}</p>
          </div>
        </div>

        {/* Área de Mensagens */}
        <div className="flex-grow p-4 overflow-y-auto text-white">
          {messages.map((msg, index) => (
            <div 
              key={index} 
              className={`mb-4 flex ${msg.from === currentUser ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`rounded-lg px-4 py-2 max-w-xs lg:max-w-md ${msg.from === currentUser ? 'bg-blue-600' : 'bg-gray-700'}`}
              >
                {msg.message}
              </div>
            </div>
          ))}
        </div>

        {/* Área de Input */}
        <div className="p-4 border-t border-gray-700 flex-shrink-0">
          <div className="flex">
            <input
              type="text"
              className="w-full px-4 py-2 bg-gray-700 rounded-l-lg text-white border-2 border-gray-600 focus:outline-none focus:border-blue-500"
              placeholder="Digite sua mensagem..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            />
            <button
              onClick={handleSendMessage}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-r-lg"
            >
              Enviar
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}