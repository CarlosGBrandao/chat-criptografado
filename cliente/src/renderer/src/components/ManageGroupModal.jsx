import React, { useState, useMemo } from 'react';

// O estado inicial pode ser 'remove' ou 'add'
function ManageGroupModal({
  isOpen,
  onClose,
  currentMembers,
  onlineUsers,
  currentUser,
  owner,
  onRemoveMember,
  onAddMembers
}) {
  
  // Estado para controlar a aba (Remover ou Adicionar)
  const [activeTab, setActiveTab] = useState('remove'); 
  
  // Estado para rastrear quais usuários serão adicionados
  const [usersToAdd, setUsersToAdd] = useState([]);

  // ---- Lógica para a aba "Adicionar" ----
  
  // Calcula quais usuários estão online MAS AINDA NÃO estão no grupo
  const availableUsers = useMemo(() => {
    const memberSet = new Set(currentMembers);
    return onlineUsers.filter(user => !memberSet.has(user));
  }, [onlineUsers, currentMembers]);

  // Handler para marcar/desmarcar um usuário na lista "Adicionar"
  const handleToggleUserToAdd = (username) => {
    setUsersToAdd(prev => 
      prev.includes(username)
        ? prev.filter(u => u !== username) // Remove
        : [...prev, username] // Adiciona
    );
  };

  // Handler para o botão "Adicionar Selecionados"
  const handleSubmitAdd = () => {
    usersToAdd.forEach(user => {
      onAddMembers(user);
    });
    setUsersToAdd([]); // Limpa a seleção após submeter
  };

  // Handler para fechar o modal
  const handleClose = () => {
    setUsersToAdd([]); // Limpa seleção ao fechar
    setActiveTab('remove'); // Reseta a aba para o padrão
    onClose();
  };

  if (!isOpen) return null;

  return (
    // Overlay
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
      {/* Conteúdo do Modal */}
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full">
        <h3 className="text-lg font-semibold text-white mb-4">Gerenciar Grupo</h3>

        {/* --- Botões de Abas (TABS) --- */}
        <div className="flex border-b border-gray-700 mb-4">
          <button
            onClick={() => setActiveTab('remove')}
            className={`py-2 px-4 font-medium ${
              activeTab === 'remove'
                ? 'border-b-2 border-blue-500 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Remover Membros
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`py-2 px-4 font-medium ${
              activeTab === 'add'
                ? 'border-b-2 border-blue-500 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Adicionar Membros
          </button>
        </div>

        {/* --- Conteúdo da Aba "Remover" --- */}
        {activeTab === 'remove' && (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {currentMembers.map((member) => (
              <div
                key={member}
                className="flex justify-between items-center p-3 bg-gray-700 rounded-lg"
              >
                <span className="text-white">
                  {member}
                  {member === owner && <span className="text-xs text-yellow-400 ml-2">(Dono)</span>}
                  {member === currentUser && <span className="text-xs text-blue-400 ml-2">(Você)</span>}
                </span>
                
                {currentUser === owner && member !== owner && (
                  <button
                    onClick={() => onRemoveMember(member)}
                    className="text-red-500 hover:text-red-400 text-sm font-medium focus:outline-none"
                  >
                    Remover
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* --- Conteúdo da Aba "Adicionar" --- */}
        {activeTab === 'add' && (
          <div>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {availableUsers.length > 0 ? (
                availableUsers.map((user) => (
                  <label 
                    key={user}
                    className="flex items-center p-3 bg-gray-700 rounded-lg hover:bg-gray-600 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="form-checkbox h-5 w-5 bg-gray-900 border-gray-600 text-blue-500 focus:ring-blue-500"
                      checked={usersToAdd.includes(user)}
                      onChange={() => handleToggleUserToAdd(user)}
                    />
                    <span className="ml-3 text-white">{user}</span>
                  </label>
                ))
              ) : (
                <p className="text-gray-400 text-center p-4">
                  Nenhum usuário disponível para adicionar.
                </p>
              )}
            </div>
            
            {/* Botão de Adicionar só aparece se tiver alguém para adicionar */}
            {availableUsers.length > 0 && (
              <button
                onClick={handleSubmitAdd}
                disabled={usersToAdd.length === 0}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
              >
                Adicionar {usersToAdd.length > 0 ? `(${usersToAdd.length})` : ''}
              </button>
            )}
          </div>
        )}

        {/* --- Botão de Fechar (Comum a ambas as abas) --- */}
        <button
          onClick={handleClose}
          className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

export default ManageGroupModal;