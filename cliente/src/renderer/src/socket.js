import { io } from 'socket.io-client';

const URL = 'http://localhost:3001';

export const socket = io(URL, {
  autoConnect: false,       // Você conecta manualmente
  reconnection: true,       // Ativa reconexão automática
  reconnectionAttempts: 10, // Quantas tentativas antes de desistir
  reconnectionDelay: 1000,  // Tempo inicial entre tentativas
  reconnectionDelayMax: 5000, // Tempo máximo entre tentativas
  randomizationFactor: 0.5,   // Variação para evitar avalanche de tentativas
  timeout: 10000, // Tempo para considerar tentativa como falha
});
