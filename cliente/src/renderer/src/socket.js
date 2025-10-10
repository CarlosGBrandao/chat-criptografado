import { io } from 'socket.io-client';

// O endereço do seu servidor
const URL = 'http://localhost:3000';

// Criamos a instância do socket aqui, com autoConnect: false, e a exportamos.
// Qualquer arquivo que importar 'socket' deste arquivo, receberá a MESMA instância.
export const socket = io(URL, { autoConnect: false });