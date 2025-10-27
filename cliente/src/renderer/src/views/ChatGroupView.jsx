import React, { useContext, useState , useEffect} from 'react'; // 1. Importar useState
import { useNavigate } from 'react-router-dom';
import { ChatGroupContext } from '../contexts/ChatGroupContext'; 
import ManageGroupModal from '../components/ManageGroupModal';

const StatusIndicator = ({ isSecure }) => (
  <div className="flex items-center text-xs text-gray-400 mt-1">
    <div className={`w-2 h-2 rounded-full mr-2 ${isSecure ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
    {isSecure ? 'Canal Seguro Estabelecido' : 'Canal inseguro. Aguardando nova chave...'}
  </div>
);

export function ChatGroupView() {
  const {
    currentUser,
    onlineUsers,
    groupName,
    members,
    isChannelSecure,
    messages,
    newMessage,
    setNewMessage,
    handleSendMessage,
    isGroupTerminated, 
    owner,
    addMember,
    removeMember,
    handleLeaveGroup
  } = useContext(ChatGroupContext);

  const [isManageModalOpen, setIsManageModalOpen] = useState(false);

  const navigate = useNavigate();

  const handleBack = () => {
    const message = currentUser === owner
      ? "Você é o DONO deste grupo. Se você sair, o grupo será encerrado para todos. Deseja continuar?"
      : "Tem certeza que deseja sair deste grupo? Você precisará ser convidado novamente.";
    
      if (window.confirm(message)) {
        handleLeaveGroup({currentUser})
        navigate(-1); 
      }
  };

  useEffect(() => {
      if (isGroupTerminated) {
        alert(`O dono saiu do grupo ou você foi removido.`);
        handleLeaveGroup({currentUser})
        navigate(-1); 
      }
  }, [isGroupTerminated]);
  
  const isInputDisabled = !isChannelSecure || isGroupTerminated;

  return (
    <div className="bg-gray-900 min-h-screen flex justify-center items-center p-4 font-sans">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full h-full flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex-shrink-0">
          {/* 4. Ajuste o layout para justificar o espaço */}
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center mr-3 text-white font-bold">
                {groupName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-lg font-semibold text-white">{groupName}</p>
                <p className='flex items-center text-sm text-gray-400 mt-1'> Membros: {members.join()}</p>
                <StatusIndicator isSecure={isChannelSecure} />
              </div>
            </div>
            <div className='flex items-center space-x-3'>
              {currentUser === owner && (
                <button
                  onClick={() => setIsManageModalOpen(true)} // <- MUDANÇA
                  className="bg-blue-400 hover:bg-blue-500 text-white font-semibold py-2 px-3 rounded-lg text-sm"
                >
                  Gerenciar
                </button>
              )}
              <button
                onClick={ () => {handleBack()}}
                className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg"
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
        
        {/* Messages (sem mudança) */}
        <div className="flex-grow p-4 overflow-y-auto text-white">
          {messages.map((msg, index) => (
            <div key={index} className={`mb-4 flex flex-col ${msg.from === currentUser ? 'items-end' : 'items-start'}`}>
               {msg.from !== currentUser && <span className="text-xs text-gray-400 mb-1">{msg.from}</span>}
              <div className={`rounded-lg px-4 py-2 max-w-xs lg:max-w-md ${msg.from === currentUser ? 'bg-blue-600' : 'bg-gray-700'}`}>
                {msg.message}
              </div>
            </div>
          ))}
        </div>

        {/* Input (sem mudança) */}
        <div className="p-4 border-t border-gray-700 flex-shrink-0">
          <div className="flex">
            <input
              type="text"
              className="w-full px-4 py-2 bg-gray-700 rounded-l-lg text-white border-2 border-gray-600 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              placeholder={`Digite uma mensagem no grupo`}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={isInputDisabled}
            />
            <button
              onClick={handleSendMessage}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-r-lg disabled:opacity-50"
              disabled={isInputDisabled}
            >
              Enviar
            </button>
          </div>
        </div>
      </div>
          
      <ManageGroupModal
          isOpen={isManageModalOpen}
          onClose={() => setIsManageModalOpen(false)}
          currentMembers={members}
          onlineUsers={onlineUsers} // Presume que você tem essa lista
          currentUser={currentUser}
          owner={owner}
          onRemoveMember={removeMember}
          onAddMembers={addMember}
      />
    </div>
  );
}