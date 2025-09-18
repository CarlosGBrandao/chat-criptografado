import React from 'react'

export function UserIcon({ currentUser, onClick }) {
  return (
    <div className="flex flex-col gap-2 cursor-pointer" onClick={onClick}>
      <div className="w-25 h-25 hover:border-2 hover:border-blue-700 border-2 border-gray-400  bg-white text-gray-800 text-4xl font-bold rounded-full flex justify-center items-center ">
        {currentUser[0]}
      </div>
      <div className="text-center font-medium">{currentUser}</div>
    </div>
  )
}
