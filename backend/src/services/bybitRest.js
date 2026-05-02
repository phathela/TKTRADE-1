const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');

const API_BASE = config.bybit.restUrl;

function generateSignature(params, secret) {
  const sortedKeys = Object.keys(params).sort();
  const paramStr = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
  return crypto.createHmac('sha256', secret).update(paramStr).digest('hex');
}

async function restRequest(endpoint, params = {}, signed = false) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (signed) {
      const timestamp = Date.now();
      const allParams = { ...params, api_key: config.bybit.apiKey, timestamp };
      allParams.sign = generateSignature(allParams, config.bybit.apiSecret);
      const response = await axios.get(`${API_BASE}${endpoint}`, { headers, params: allParams, timeout: 10000 });
      return response.data;
    }
    const response = await axios.get(`${API_BASE}${endpoint}`, { headers, params, timeout: 10000 });
    return response.data;
  } catch (err) {
    console.error(`Bybit REST error (${endpoint}):`, err.response?.data || err.message);
    throw err;
  }
}

async function getKline(symbol, interval, limit = 200) {
  return restRequest('/v5/market/kline', {
    category: 'linear',
    symbol,
    interval,
    limit: Math.min(limit, 1000),
  });
}

async function getTicker(symbol) {
  return restRequest('/v5/market/tickers', { category: 'linear', symbol });
}

async function getOrderBook(symbol, limit = 50) {
  return restRequest('/v5/market/orderbook', { category: 'linear', symbol, limit });
}

async function getRecentTrades(symbol, limit = 50) {
  return restRequest('/v5/market/recent-trade', { category: 'linear', symbol, limit });
}

async function placeOrder(params) {
  const timestamp = Date.now();
  const allParams = {
    category: 'linear',
    symbol: params.symbol,
    side: params.side,
    orderType: params.orderType || 'Market',
    qty: params.qty.toString(),
    timeInForce: params.timeInForce || 'GTC',
    ...(params.price && { price: params.price.toString() }),
    ...(params.stopLoss && { stopLoss: params.stopLoss.toString() }),
    ...(params.takeProfit && { takeProfit: params.takeProfit.toString() }),
    api_key: config.bybit.apiKey,
    timestamp,
  };
  allParams.sign = generateSignature(allParams, config.bybit.apiSecret);

  try {
    const response = await axios.post(`${API_BASE}/v5/order/create`, allParams, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    return response.data;
  } catch (err) {
    console.error('Place order error:', err.response?.data || err.message);
    throw err;
  }
}

async function getPositions(symbol) {
  return restRequest('/v5/position/list', {
    category: 'linear',
    symbol,
  }, true);
}

async function getAccountBalance() {
  return restRequest('/v5/account/wallet-balance', {
    accountType: 'UNIFIED',
    coin: 'USDT',
  }, true);
}

module.exports = {
  getKline,
  getTicker,
  getOrderBook,
  getRecentTrades,
  placeOrder,
  getPositions,
  getAccountBalance,
};
