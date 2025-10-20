import React, { useContext, useState } from 'react'; //  Importar o hook 'useContext'
import { UserIcon } from '../components/UserIcon';
import { UserListContext } from '../contexts/UserListContext'; //  Importar o objeto de contexto

export function UserListView() {

  const {
    currentUser,
    otherUsers,
    incomingRequests,
    pendingRequests,
    incomingGroupInvites,
    sendChatRequest,
    acceptChatRequest,
    declineChatRequest,
    sendGroupInvitation,
    acceptGroupInvite,
    declineGroupInvite,
  } = useContext(UserListContext);


  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [groupName, setGroupName] = useState('');

  const handleSendGroupInvitation = () => {
    if (groupName.trim() === '' || selectedUsers.size === 0) {
      alert('Por favor, dê um nome ao grupo e selecione pelo menos um membro.');
      return;
    }

    // 1. Chama a nova função para ENVIAR convites, em vez de criar o grupo diretamente
    sendGroupInvitation(groupName, Array.from(selectedUsers));

    // Reseta o estado e fecha o modal
    setIsModalOpen(false);
    setGroupName('');
    setSelectedUsers(new Set());
  };

  const handleUserSelection = (user) => {
    setSelectedUsers(prevSelected => {
      const newSelection = new Set(prevSelected);
      if (newSelection.has(user)) {
        newSelection.delete(user);
      } else {
        newSelection.add(user);
      }
      return newSelection;
    });
  };
  
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
              return (
                <>
                  <UserIcon key={user} currentUser={user} onClick={() => sendChatRequest(user)} />
                </>
            )
            }
          })
          
          
        ) : (
          <p className="text-gray-400">Nenhum outro usuário online.</p>
        )
        }
        {incomingGroupInvites && incomingGroupInvites.length > 0 && (
          <div className='w-full max-w-md'>
              <h2 className='text-xl font-semibold mb-2'>Convites de Grupo</h2>
              {incomingGroupInvites.map(invite => (
                  <div key={invite.groupId} className="flex items-center justify-between gap-4 bg-gray-700 p-3 rounded-lg mb-2">
                      <p className="text-white">
                          <span className='font-bold'>{invite.from}</span> convidou você para o grupo <span className='font-bold'>{invite.groupName}</span>.
                      </p>
                      <div className='flex gap-2'>
                          <button onClick={() => acceptGroupInvite(invite.groupId)} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">Aceitar</button>
                          <button onClick={() => declineGroupInvite(invite.groupId)} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">Recusar</button>
                      </div>
                  </div>
              ))}
          </div>
        )}
        { otherUsers.length > 0 && <button
            onClick={() => setIsModalOpen(true)}
            className='bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg'>
            Criar Novo Grupo
        </button>}
      </div>
      {/* Modal para criar o grupo */}
      {isModalOpen && (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center">
        <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md">
          <h2 className="text-2xl font-bold mb-4">Criar Novo Grupo</h2>
          <input
            type="text"
            placeholder="Nome do Grupo"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="w-full p-2 rounded bg-gray-700 border border-gray-600 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <h3 className="text-lg mb-2">Selecione os membros:</h3>
          <div className="max-h-60 overflow-y-auto flex flex-col gap-2">
            {otherUsers.map(user => (
              <label key={user} className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="form-checkbox h-5 w-5 bg-gray-900 border-gray-600 text-blue-500 focus:ring-blue-500"
                  checked={selectedUsers.has(user)}
                  onChange={() => handleUserSelection(user)}
                />
                <span>{user}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-4 mt-6">
            <button
              onClick={() => setIsModalOpen(false)}
              className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg">
              Cancelar
            </button>
            <button
              onClick={handleSendGroupInvitation}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">
              Enviar Convites
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}