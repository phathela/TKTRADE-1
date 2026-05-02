import axios from 'axios';

const API = axios.create({ baseURL: '/api', timeout: 15000 });

// Candles
export async function fetchCandles(symbol, interval, limit = 500) {
  const { data } = await API.get(`/candles/${symbol}/${interval}`, { params: { limit } });
  return data;
}

export async function fetchCandleHistory(symbol, interval, params = {}) {
  const { data } = await API.get(`/candles/history/${symbol}/${interval}`, { params });
  return data;
}

// Ticker
export async function fetchTicker(symbol) {
  const { data } = await API.get(`/market/ticker/${symbol}`);
  return data;
}

// Orderbook
export async function fetchOrderBook(symbol) {
  const { data } = await API.get(`/market/orderbook/${symbol}`);
  return data;
}

// Indicators
export async function fetchBuiltinIndicators() {
  const { data } = await API.get('/indicators/builtin');
  return data;
}

export async function calculateIndicator(params) {
  const { data } = await API.post('/indicators/calculate', params);
  return data;
}

export async function calculateMultipleIndicators(params) {
  const { data } = await API.post('/indicators/multiple', params);
  return data;
}

// Alerts
export async function fetchAlerts() {
  const { data } = await API.get('/alerts');
  return data;
}

export async function createAlert(alert) {
  const { data } = await API.post('/alerts', alert);
  return data;
}

export async function updateAlert(id, updates) {
  const { data } = await API.put(`/alerts/${id}`, updates);
  return data;
}

export async function deleteAlert(id) {
  const { data } = await API.delete(`/alerts/${id}`);
  return data;
}

export async function testAlert(id, testPrice) {
  const { data } = await API.post(`/alerts/${id}/test`, { testPrice });
  return data;
}

// Backtest
export async function runBacktest(params) {
  const { data } = await API.post('/backtest/run', params);
  return data;
}

export async function fetchBacktestHistory() {
  const { data } = await API.get('/backtest/history');
  return data;
}

export async function fetchBacktestTemplates() {
  const { data } = await API.get('/backtest/templates');
  return data;
}

// Strategies
export async function fetchStrategies() {
  const { data } = await API.get('/strategies');
  return data;
}

export async function saveStrategy(strategy) {
  const { data } = await API.post('/strategies', strategy);
  return data;
}

export async function deleteStrategy(id) {
  const { data } = await API.delete(`/strategies/${id}`);
  return data;
}

export async function validateStrategy(code) {
  const { data } = await API.post('/strategies/validate', { code });
  return data;
}

export async function fetchStrategyTemplates() {
  const { data } = await API.get('/strategies/templates');
  return data;
}
