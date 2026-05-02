const bybitWS = require('../services/bybitWebSocket');
const alertEngine = require('../services/alertEngine');

function setupSocket(io) {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('subscribe:ticker', (symbol) => {
      socket.join(`ticker:${symbol}`);
      bybitWS.subscribeTicker(symbol);
    });

    socket.on('unsubscribe:ticker', (symbol) => {
      socket.leave(`ticker:${symbol}`);
    });

    socket.on('subscribe:orderbook', (symbol) => {
      socket.join(`orderbook:${symbol}`);
      bybitWS.subscribeOrderbook(symbol);
    });

    socket.on('unsubscribe:orderbook', (symbol) => {
      socket.leave(`orderbook:${symbol}`);
    });

    socket.on('subscribe:trades', (symbol) => {
      socket.join(`trades:${symbol}`);
      bybitWS.subscribeTrades(symbol);
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  // Bybit WS -> Socket.io broadcast
  bybitWS.on('ticker', null, ({ symbol, data }) => {
    const ticker = {
      symbol,
      price: parseFloat(data.lastPrice || 0),
      change: parseFloat(data.change24h || 0),
      volume: parseFloat(data.volume24h || 0),
      high: parseFloat(data.highPrice24h || 0),
      low: parseFloat(data.lowPrice24h || 0),
      timestamp: Date.now(),
    };
    io.to(`ticker:${symbol}`).emit('ticker', ticker);
    alertEngine.updatePrice(symbol, ticker.price);
  });

  bybitWS.on('orderbook', null, ({ symbol, data }) => {
    io.to(`orderbook:${symbol}`).emit('orderbook', {
      symbol,
      bids: (data.b || []).slice(0, 50),
      asks: (data.a || []).slice(0, 50),
      timestamp: Date.now(),
    });
  });

  bybitWS.on('trade', null, ({ symbol, data }) => {
    const trades = (Array.isArray(data) ? data : [data]).map(t => ({
      price: parseFloat(t.price || 0),
      size: parseFloat(t.size || 0),
      side: t.side || 'Buy',
      time: t.timestamp || Date.now(),
    }));
    io.to(`trades:${symbol}`).emit('trades', { symbol, trades });
  });
}

module.exports = { setupSocket };
