const crypto = require('crypto');
const config = require('../config');
const axios = require('axios');

function verifySignature(payload, signature) {
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', config.jwtSecret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

async function processTradeWebhook(body) {
  const {
    symbol = 'BTCUSDT',
    side,
    orderType = 'Market',
    qty,
    price,
    timeInForce = 'GTC',
    stopLoss,
    takeProfit,
  } = body;

  if (!side || !['Buy', 'Sell'].includes(side)) {
    throw new Error('Invalid side. Must be "Buy" or "Sell".');
  }
  if (!qty || parseFloat(qty) <= 0) {
    throw new Error('Invalid quantity.');
  }

  // If Bybit API keys are configured, execute the trade
  if (config.bybit.apiKey && config.bybit.apiSecret) {
    const bybitRest = require('./bybitRest');
    const result = await bybitRest.placeOrder({
      symbol,
      side,
      orderType,
      qty,
      price,
      timeInForce,
      stopLoss,
      takeProfit,
    });
    return { success: true, exchange: 'bybit', result };
  }

  // If no API keys, return the trade data for logging
  return {
    success: true,
    simulated: true,
    message: 'Bybit API keys not configured. Trade would be:',
    order: { symbol, side, orderType, qty, price, timeInForce },
  };
}

async function processAlertWebhook(body) {
  // Generic webhook endpoint for external alerts
  const {
    symbol = 'BTCUSDT',
    side,
    orderType = 'Market',
    qty = '0.001',
  } = body;

  return processTradeWebhook({ symbol, side, orderType, qty });
}

module.exports = { verifySignature, processTradeWebhook, processAlertWebhook };
