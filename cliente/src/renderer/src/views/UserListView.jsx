import React, { useContext } from 'react'; //  Importar o hook 'useContext'
import { UserIcon } from '../components/UserIcon';
import { UserListContext } from '../contexts/UserListContext'; //  Importar o objeto de contexto

export function UserListView({ currentUser }) {

  const {
    otherUsers,
    incomingRequests,
    pendingRequests,
    sendChatRequest,
    acceptChatRequest,
    declineChatRequest,
  } = useContext(UserListContext);

  return (
    <div className="bg-gray-900 min-h-screen text-white flex flex-col items-center justify-center font-sans gap-10">
      <div>
        <h1 className='text-5xl font-bold'>Bem-vindo, {currentUser}!</h1>
        <p className='text-lg'>Usuários online:</p>
      </div>
      
      <div className='flex flex-col gap-4 w-full justify-center min-h-[100px] items-center'>
        {otherUsers.length > 0 ? (
          otherUsers.map(user => {
            if (incomingRequests.has(user)) {
              return (
                <div key={user} className="flex items-center gap-4 bg-gray-700 p-3 rounded-lg">
                  <p className="text-white">{user} quer conversar com você.</p>
                  <button onClick={() => acceptChatRequest(user)} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">Aceitar</button>
                  <button onClick={() => declineChatRequest(user)} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">Recusar</button>
                </div>
              );
            } else if (pendingRequests.has(user)) {
              return (
                <div key={user} className="flex items-center gap-4">
                  <UserIcon currentUser={user} />
                  <p className="text-gray-400">Pedido enviado...</p>
                </div>
              );
            } else {
              return <UserIcon key={user} currentUser={user} onClick={() => sendChatRequest(user)} />;
            }
          })
        ) : (
          <p className="text-gray-400">Nenhum outro usuário online.</p>
        )}
      </div>
    </div>
  );
}