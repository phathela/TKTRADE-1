import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 20,
    });
  }
  return socket;
}

export function subscribeTicker(symbol, callback) {
  const s = getSocket();
  s.emit('subscribe:ticker', symbol);
  s.on('ticker', (data) => {
    if (data.symbol === symbol) callback(data);
  });
  return () => {
    s.emit('unsubscribe:ticker', symbol);
    s.off('ticker');
  };
}

export function subscribeOrderbook(symbol, callback) {
  const s = getSocket();
  s.emit('subscribe:orderbook', symbol);
  s.on('orderbook', (data) => {
    if (data.symbol === symbol) callback(data);
  });
  return () => {
    s.emit('unsubscribe:orderbook', symbol);
    s.off('orderbook');
  };
}

export function subscribeTrades(symbol, callback) {
  const s = getSocket();
  s.emit('subscribe:trades', symbol);
  s.on('trades', (data) => {
    if (data.symbol === symbol) callback(data);
  });
  return () => {
    s.off('trades');
  };
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
