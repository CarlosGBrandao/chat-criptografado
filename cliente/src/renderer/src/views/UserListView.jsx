import React from 'react';
import { UserIcon } from '../components/UserIcon';

// Recebe o usuário atual como propriedade
export function UserListView({ currentUser }) {
  const users = ["Alice", "Beto", "Carla", "Daniel"];
  const otherUsers = users.filter(u => u !== currentUser);

  const handleOpenChatWindow = (chatWithUser) => {
    window.api.openChatWindow({ currentUser, chatWithUser });
  };


  return (
    <div className="bg-gray-900 min-h-screen text-white  flex flex-col items-center justify-center font-sans gap-10">
      <div>
        <h1 className='text-5xl font-bold'>Bem-vindo, {currentUser}!</h1>
        <p className='text-lg'>Selecione um usuário para conversar:</p>
      </div>
      
      <div className='flex  gap-4 w-full justify-center'>
        {otherUsers.map(user => (
          <UserIcon key={user} currentUser={user} onClick={() => handleOpenChatWindow(user)}/>
        ))}
      </div>
    </div>
  );
}