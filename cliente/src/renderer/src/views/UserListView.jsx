import React, { useState, useEffect } from 'react'; 
import { UserIcon } from '../components/UserIcon';
// 1. Importamos a instância ÚNICA e centralizada do nosso novo arquivo
import { socket } from '../socket';

// 2. A linha "const socket = io(...)" foi COMPLETAMENTE REMOVIDA daqui.

export function UserListView({ currentUser }) {
  const [onlineUsers, setOnlineUsers] = useState([]);

  const handleOpenChatWindow = (chatWithUser) => {
    window.api.openChatWindow({ currentUser, chatWithUser });
  };

  const handleCreateGroup = () => {

  }

  // 3. Este useEffect agora gerencia a conexão e os listeners de forma mais estável
  useEffect(() => {
    // Apenas inicia a conexão se ela já não estiver ativa
    if (!socket.connected) {
      socket.connect();
    }

    // Funções de handler para podermos adicioná-las e removê-las corretamente
    function onConnect() {
      console.log('UserListView: Evento "connect" disparado. Registrando:', currentUser);
      socket.emit('register', currentUser);
    }

    function onUpdateUserList(users) {
      console.log('UserListView: Lista de usuários atualizada recebida:', users);
      setOnlineUsers(users);
    }

    function onDisconnect() {
      console.log('UserListView: Desconectado do servidor.');
    }

    // Anexamos os listeners para os eventos
    socket.on('connect', onConnect);
    socket.on('updateUserList', onUpdateUserList);
    socket.on('disconnect', onDisconnect);

    // A função de limpeza agora SÓ REMOVE os listeners quando o componente desmonta.
    // Isso evita listeners duplicados e vazamentos de memória, sem derrubar a conexão.
    return () => {
      socket.off('connect', onConnect);
      socket.off('updateUserList', onUpdateUserList);
      socket.off('disconnect', onDisconnect);
    };
  }, [currentUser]); // A dependência garante que o usuário correto seja registrado

  const otherUsers = onlineUsers.filter(u => u !== currentUser);

  // O JSX para renderizar a tela continua o mesmo
  return (
    <div className="bg-gray-900 min-h-screen text-white flex flex-col items-center justify-center font-sans gap-10">
      <div>
        <h1 className='text-5xl font-bold'>Bem-vindo, {currentUser}!</h1>
        <p className='text-lg'>Usuários online:</p>
      </div>
      
      <div className='flex gap-4 w-full justify-center min-h-[100px] items-center'>
        {otherUsers.length > 0 ? (
          <div className='flex flex-col gap-10'>
          <div className='flex gap-4 justify-center flex-row'>
          {otherUsers.map(user => (
            <UserIcon key={user} currentUser={user} onClick={() => handleOpenChatWindow(user)}/>
          ))}
          </div>
          <button
            onClick={handleCreateGroup}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Criar Grupo
          </button>
          </div>
        ) : (
          <p className="text-gray-400">Nenhum outro usuário online no momento.</p>
        )}
      </div>
    </div>
  );
}