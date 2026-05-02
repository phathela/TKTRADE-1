const WebSocket = require('ws');
const config = require('../config');
const { query } = require('../db');

class BybitWebSocketService {
  constructor() {
    this.ws = null;
    this.subscriptions = { ticker: {}, orderbook: {}, trade: {}, kline: {} };
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
    const raw = data.toString();
    console.log('[BybitWS] Raw message received:', raw);

    try {
      const msg = JSON.parse(raw);

      // Log pong responses so we can confirm the connection is alive
      if (msg.op === 'pong' || msg.ret_msg === 'pong') {
        console.log('[BybitWS] Pong received');
        return;
      }

      // Log subscription confirmations and any error/rejection responses from Bybit
      if (msg.op === 'subscribe' || msg.success !== undefined) {
        if (msg.success === true) {
          console.log('[BybitWS] Subscription confirmed:', JSON.stringify(msg));
        } else if (msg.success === false) {
          console.error('[BybitWS] Subscription REJECTED by Bybit:', JSON.stringify(msg));
        } else {
          console.log('[BybitWS] Op response:', JSON.stringify(msg));
        }
        return;
      }

      // Log any explicit error messages from Bybit (e.g. auth required, invalid topic)
      if (msg.type === 'error' || msg.ret_code !== undefined && msg.ret_code !== 0) {
        console.error('[BybitWS] Error message from Bybit:', JSON.stringify(msg));
        return;
      }

      // Log every data-bearing message so we can confirm topics are flowing
      if (msg.topic) {
        console.log(`[BybitWS] Data message on topic "${msg.topic}" (type=${msg.type}), data length=${Array.isArray(msg.data) ? msg.data.length : (msg.data ? 1 : 0)}`);
      } else {
        // Unexpected message shape — log it in full so nothing is silently dropped
        console.log('[BybitWS] Unrecognised message shape:', JSON.stringify(msg));
      }

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
          } else if (type === 'kline' && parts.length === 3 && msg.data) {
            // topic: kline.{interval}.{symbol}
            const interval = parts[1];
            const klineSymbol = parts[2];
            const klines = Array.isArray(msg.data) ? msg.data : [msg.data];
            console.log(`[BybitWS] Processing ${klines.length} kline(s) for ${klineSymbol} @ ${interval}`);
            for (const kline of klines) {
              this._storeKline(kline, klineSymbol, interval);
              this._emit('kline', klineSymbol, { interval, kline });
            }
          }
        }
        // Store candle from ticker if available
        if (topic.startsWith('tickers.') && msg.data) {
          this._storeTickerData(msg.data, parts[1]);
        }
      }
    } catch (err) {
      console.error('[BybitWS] Message parse error:', err.message, '| Raw:', raw);
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

  async _storeKline(kline, symbol, interval) {
    try {
      // Bybit kline fields: start, end, interval, open, close, high, low, volume, turnover, confirm, timestamp
      const openTimeSec = Math.floor(parseInt(kline.start) / 1000);
      const open = parseFloat(kline.open);
      const high = parseFloat(kline.high);
      const low = parseFloat(kline.low);
      const close = parseFloat(kline.close);
      const volume = parseFloat(kline.volume || 0);
      const turnover = parseFloat(kline.turnover || 0);

      if (!openTimeSec || !open) return;

      await query(
        `INSERT INTO candles (symbol, interval, open_time, open, high, low, close, volume, turnover)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (symbol, interval, open_time)
         DO UPDATE SET
           high = GREATEST(candles.high, EXCLUDED.high),
           low = LEAST(candles.low, EXCLUDED.low),
           close = EXCLUDED.close,
           volume = EXCLUDED.volume,
           turnover = EXCLUDED.turnover`,
        [symbol, interval, openTimeSec, open, high, low, close, volume, turnover]
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

  subscribeKline(symbol, interval) {
    const key = `${symbol}:${interval}`;
    this.subscriptions.kline[key] = { symbol, interval };
    this._send({ op: 'subscribe', args: [`kline.${interval}.${symbol}`] });
    console.log(`Subscribed to kline.${interval}.${symbol}`);
  }

  unsubscribeKline(symbol, interval) {
    const key = `${symbol}:${interval}`;
    delete this.subscriptions.kline[key];
    this._send({ op: 'unsubscribe', args: [`kline.${interval}.${symbol}`] });
  }

  _send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify(msg);
      console.log('[BybitWS] Sending:', payload);
      this.ws.send(payload);
    } else {
      console.warn('[BybitWS] Cannot send — socket not open (readyState:', this.ws?.readyState, '). Message:', JSON.stringify(msg));
    }
  }

  _resubscribe() {
    const all = [
      ...Object.keys(this.subscriptions.ticker).map(s => `tickers.${s}`),
      ...Object.keys(this.subscriptions.orderbook).map(s => `orderbook.200.100ms.${s}`),
      ...Object.keys(this.subscriptions.trade).map(s => `publicTrade.${s}`),
      ...Object.values(this.subscriptions.kline).map(({ symbol, interval }) => `kline.${interval}.${symbol}`),
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
