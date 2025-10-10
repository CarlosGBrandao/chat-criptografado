import React, { useState, useEffect } from 'react';
// 1. Importe o socket do nosso arquivo central, como já estava fazendo
import { socket } from '../socket';

export function ChatView({ currentUser, chatWithUser }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  // A função para enviar mensagens continua perfeita
  const handleSendMessage = () => {
    if (newMessage.trim() === '') return;

    const messageData = {
      // O 'from' é adicionado pelo servidor, então não precisamos enviá-lo
      to: chatWithUser,
      message: newMessage,
    };
    
    // Adicionamos a mensagem que NÓS enviamos na nossa tela imediatamente
    const selfMessage = { from: currentUser, message: newMessage };

    console.log('🚀 Enviando privateMessage:', messageData);
    socket.emit('privateMessage', messageData);
    setMessages(prevMessages => [...prevMessages, selfMessage]);
    setNewMessage('');
  };

  // 2. O useEffect foi reescrito para lidar com a conexão e o registro
  useEffect(() => {
    // Garante que esta janela tenha uma conexão ativa
    if (!socket.connected) {
      socket.connect();
    }

    // Handler para o evento de conexão
    const handleConnect = () => {
      // Assim que conectar, esta janela se identifica para o servidor
      console.log(`ChatView conectado com ID: ${socket.id}. Registrando como: ${currentUser}`);
      socket.emit('register', currentUser);
    };

    // Handler para o recebimento de mensagens
    const receiveMessageHandler = (data) => {
      console.log('📬 Mensagem recebida no ChatView:', data);
      // Adiciona a mensagem apenas se for da pessoa com quem estamos nesta janela de chat
      if (data.from === chatWithUser) {
        setMessages(prevMessages => [...prevMessages, data]);
      }
    };

    // Anexa os listeners
    socket.on('connect', handleConnect);
    socket.on('receiveMessage', receiveMessageHandler);
    
    // IMPORTANTE: Se o socket JÁ ESTIVER conectado quando este componente montar,
    // o evento 'connect' não será disparado novamente. Portanto, precisamos
    // nos registrar manualmente uma vez para garantir que o servidor nos conheça.
    if (socket.connected) {
      handleConnect();
    }

    // Função de limpeza para remover os listeners quando a janela fechar
    return () => {
      socket.off('connect', handleConnect);
      socket.off('receiveMessage', receiveMessageHandler);
      // Opcional: Desconectar este socket específico quando a janela fecha.
      // Isso é útil se você não quiser que a janela principal receba mensagens de chat.
      // socket.disconnect();
    };
  }, [currentUser, chatWithUser]); // Dependências para re-registrar se algo mudar

  // O JSX para renderizar a tela continua o mesmo
  return (
    <div className="bg-gray-900 min-h-screen flex justify-center items-center p-4 font-sans">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full h-full flex flex-col">
        
        <div className="flex items-center p-4 border-b border-gray-700 flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center mr-3 text-white font-bold">
            {chatWithUser.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-semibold text-white">Conversando com {chatWithUser}</p>
          </div>
        </div>

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