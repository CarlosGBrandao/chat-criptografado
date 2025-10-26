import { createContext, useEffect, useRef } from "react";
import { io } from "socket.io-client";

// O valor inicial do contexto ainda pode ser null
export const SocketContext = createContext({ socket: null });

export function SocketProvider({ children }) {
  const socketRef = useRef(null);

  if (!socketRef.current) {
    socketRef.current = io("http://localhost:3000", {
      autoConnect: false
    });
  }

  // 3. Usar o useEffect para gerenciar o ciclo de vida da conexão.
  useEffect(() => {
    socketRef.current.connect();

    return () => {
      socketRef.current.disconnect();
    };
  }, []); 

  return (
    <SocketContext.Provider value={{ socket: socketRef.current }}>
      {children}
    </SocketContext.Provider>
  );
}