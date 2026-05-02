const WebSocket = require('ws');
const config = require('../config');
const { query } = require('../db');

class BybitWebSocketService {
  constructor() {
    this.ws = null;
    this.subscriptions = { ticker: {}, orderbook: {}, trade: {} };
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 2000;
    this.pingInterval = null;
  }

  connect() {
    if (this.ws) return;
    console.log('Connecting to Bybit WebSocket...');
    this.ws = new WebSocket(config.bybit.wsUrl);

    this.ws.on('open', () => {
      console.log('Bybit WebSocket connected');
      this.reconnectAttempts = 0;
      this._startPing();
      this._resubscribe();
    });

    this.ws.on('message', (data) => this._handleMessage(data));
    this.ws.on('close', () => this._handleClose());
    this.ws.on('error', (err) => console.error('Bybit WS error:', err.message));
  }

  _startPing() {
    this._stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ req_id: 'ping', op: 'ping' }));
      }
    }, 20000);
  }

  _stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  _handleMessage(data) {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.op === 'pong') return;
      if (msg.type === 'snapshot' || msg.type === 'delta' || msg.data) {
        const topic = msg.topic || '';
        const parts = topic.split('.');
        if (parts.length >= 2) {
          const type = parts[0];
          const symbol = parts[1];
          if (type === 'tickers' && msg.data) {
            this._emit('ticker', symbol, msg.data);
          } else if (type === 'orderbook' && msg.data) {
            this._emit('orderbook', symbol, msg.data);
          } else if (type === 'publicTrade' && msg.data) {
            this._emit('trade', symbol, msg.data);
          }
        }
        // Store candle from ticker if available
        if (topic.startsWith('tickers.') && msg.data) {
          this._storeTickerData(msg.data, parts[1]);
        }
      }
    } catch (err) {
      console.error('WS message parse error:', err.message);
    }
  }

  async _storeTickerData(ticker, symbol) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const ts = Math.floor(now / 60) * 60; // 1m bucket
      const price = parseFloat(ticker.lastPrice || 0);
      if (!price) return;

      await query(
        `INSERT INTO candles (symbol, interval, open_time, open, high, low, close, volume, turnover)
         VALUES ($1, '1m', $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (symbol, interval, open_time)
         DO UPDATE SET
           high = GREATEST(candles.high, EXCLUDED.high),
           low = LEAST(candles.low, EXCLUDED.low),
           close = EXCLUDED.close,
           volume = candles.volume + EXCLUDED.volume,
           turnover = candles.turnover + EXCLUDED.turnover`,
        [symbol, ts, price, price, price, price, parseFloat(ticker.volume24h || 0) / 1440, 0]
      );
    } catch (err) {
      // Silent — don't spam logs for storage
    }
  }

  _handleClose() {
    this._stopPing();
    this.ws = null;
    this.reconnectAttempts++;
    if (this.reconnectAttempts <= this.maxReconnectAttempts) {
      const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
      console.log(`Bybit WS disconnected. Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connect(), delay);
    }
  }

  subscribeTicker(symbol) {
    this.subscriptions.ticker[symbol] = true;
    this._send({ op: 'subscribe', args: [`tickers.${symbol}`] });
  }

  unsubscribeTicker(symbol) {
    delete this.subscriptions.ticker[symbol];
    this._send({ op: 'unsubscribe', args: [`tickers.${symbol}`] });
  }

  subscribeOrderbook(symbol) {
    this.subscriptions.orderbook[symbol] = true;
    this._send({ op: 'subscribe', args: [`orderbook.200.100ms.${symbol}`] });
  }

  subscribeTrades(symbol) {
    this.subscriptions.trade[symbol] = true;
    this._send({ op: 'subscribe', args: [`publicTrade.${symbol}`] });
  }

  _send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  _resubscribe() {
    const all = [
      ...Object.keys(this.subscriptions.ticker).map(s => `tickers.${s}`),
      ...Object.keys(this.subscriptions.orderbook).map(s => `orderbook.200.100ms.${s}`),
      ...Object.keys(this.subscriptions.trade).map(s => `publicTrade.${s}`),
    ];
    if (all.length > 0) {
      this._send({ op: 'subscribe', args: all });
    }
  }

  _emit(event, symbol, data) {
    const key = `${event}:${symbol}`;
    if (this.listeners.has(key)) {
      this.listeners.get(key).forEach(cb => cb(data));
    }
    // Broadcast all listeners
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => cb({ symbol, data }));
    }
  }

  on(event, symbol, callback) {
    const key = symbol ? `${event}:${symbol}` : event;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(callback);
    return () => this.listeners.get(key)?.delete(callback);
  }

  disconnect() {
    this._stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

module.exports = new BybitWebSocketService();
