import React, { useContext, useState } from 'react';
import { UserIcon } from '../components/UserIcon';
import { UserListContext } from '../contexts/UserListContext';

export function UserListView() {

  const {
    currentUser,
    otherUsers,
    incomingRequests,
    pendingRequests,
    incomingGroupInvites,
    pendingSentGroupInvites, // <-- NOVO ESTADO (necessário do context)
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
    sendGroupInvitation(groupName, Array.from(selectedUsers));
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

  // --- LÓGICA DE ESTADO "OCUPADO" ---

  // REQUISITO: Se tiver convite de GRUPO, mostrar SÓ isso e nada mais.
  // Este é o "return antecipado". Nada abaixo disso será renderizado.
  if (incomingGroupInvites && incomingGroupInvites.length > 0) {
    return (
      <div className="bg-gray-900 min-h-screen text-white flex flex-col items-center justify-center font-sans gap-10 p-4">
        <h1 className='text-3xl font-bold text-center'>Você tem convites de grupo pendentes</h1>
        <div className='w-full max-w-md'>
          {incomingGroupInvites.map(invite => (
            <div key={invite.groupId} className="flex flex-col items-center justify-between gap-4 bg-gray-700 p-4 rounded-lg mb-3">
              <p className="text-white text-center">
                <span className='font-bold'>{invite.from}</span> convidou você para o grupo <span className='font-bold'>{invite.groupName}</span>.
              </p>
              <div className='flex gap-2 mt-2'>
                <button onClick={() => acceptGroupInvite(invite.groupId)} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">Aceitar</button>
                <button onClick={() => declineGroupInvite(invite.groupId)} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">Recusar</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // REQUISITOS: Definir o estado "isBusy"
  // O usuário está ocupado se:
  // 1. Tem um convite de chat chegando
  // 2. Está esperando uma resposta de chat (pendingRequests)
  // 3. Está esperando uma resposta de grupo que ele criou (pendingSentGroupInvites)
  const hasIncomingChat = incomingRequests.size > 0;
  const hasSentChat = pendingRequests.size > 0;
  const hasSentGroup = pendingSentGroupInvites && pendingSentGroupInvites.length > 0;

  const isBusy = hasIncomingChat || hasSentChat || hasSentGroup;

  // --- RENDERIZAÇÃO PRINCIPAL (só acontece se não houver convites de grupo) ---
  
  return (
    <div className="bg-gray-900 min-h-screen text-white flex flex-col items-center justify-center font-sans gap-10 p-4">
      <div>
        <h1 className='text-5xl font-bold'>Bem-vindo, {currentUser}!</h1>
        <p className='text-lg'>Usuários online:</p>
      </div>
      
      <div className='flex flex-col gap-4 w-full justify-center min-h-[100px] items-center max-w-md'>
        
        {/* REQUISITO: Mostrar estado de espera do grupo que EU criei */}
        {hasSentGroup && (
          <div className='w-full p-4 bg-gray-700 rounded-lg text-center'>
            <h2 className='text-xl font-semibold mb-2'>Aguardando Aceitação do Grupo</h2>
            {pendingSentGroupInvites.map(group => (
              <div key={group.groupId}>
                <p>Aguardando membros para: <span className='font-bold'>{group.groupName}</span></p>
                {/* Você precisará que o context forneça os 'pendingMembers' */}
                <p className='text-sm text-gray-400'>Pendentes: {group.pendingMembers ? group.pendingMembers.join(', ') : 'Carregando...'}</p>
              </div>
            ))}
          </div>
        )}

        {otherUsers.length > 0 ? (
          otherUsers.map(user => {
            // Se eu tenho um convite DELE
            if (incomingRequests.has(user)) {
              return (
                <div key={user} className="flex items-center gap-4 bg-gray-700 p-3 rounded-lg">
                  <p className="text-white">{user} quer conversar com você.</p>
                  <button onClick={() => acceptChatRequest(user)} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">Aceitar</button>
                  <button onClick={() => declineChatRequest(user)} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">Recusar</button>
                </div>
              );
            // Se eu enviei um convite PARA ELE (Req: Esperando resposta)
            } else if (pendingRequests.has(user)) {
              return (
                <div key={user} className="flex items-center gap-4 opacity-70">
                  <UserIcon currentUser={user} />
                  <p className="text-gray-400">Pedido enviado...</p>
                </div>
              );
            // Usuário disponível
            } else {
              return (
                // REQUISITO: Bloquear clique se estiver ocupado
                <div key={user} className={isBusy ? 'opacity-50 cursor-not-allowed' : ''}>
                  <UserIcon 
                    currentUser={user} 
                    onClick={!isBusy ? () => sendChatRequest(user) : () => {}} // Não faz nada se estiver ocupado
                  />
                  {/* Opcional: mostrar um texto se estiver ocupado */}
                  {isBusy && <p className="text-xs text-gray-500 text-center">Ocupado</p>}
                </div>
              );
            }
          })
          
          
        ) : (
          <p className="text-gray-400">Nenhum outro usuário online.</p>
        )
        }
        
        {/* REQUISITO: Bloquear botão de "Criar Grupo" se estiver ocupado */}
        { otherUsers.length > 0 && (
          <button
              onClick={() => setIsModalOpen(true)}
              disabled={isBusy} // Desabilita o botão
              className={`font-bold py-2 px-4 rounded-lg ${
                isBusy 
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}>
              Criar Novo Grupo
          </button>
        )}
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