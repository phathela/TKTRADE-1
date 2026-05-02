const express = require('express');
const router = express.Router();
const webhookHandler = require('../services/webhookHandler');

// POST /api/webhook/trade
router.post('/trade', async (req, res) => {
  try {
    const result = await webhookHandler.processTradeWebhook(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/webhook/alert
router.post('/alert', async (req, res) => {
  try {
    const result = await webhookHandler.processAlertWebhook(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/webhook/docs
router.get('/docs', (req, res) => {
  res.json({
    tradeEndpoint: 'POST /api/webhook/trade',
    alertEndpoint: 'POST /api/webhook/alert',
    tradePayload: {
      symbol: 'BTCUSDT',
      side: 'Buy',
      orderType: 'Market',
      qty: '0.001',
      price: null,
      timeInForce: 'GTC',
      stopLoss: null,
      takeProfit: null,
    },
    alertPayload: {
      symbol: 'BTCUSDT',
      side: 'Buy',
      orderType: 'Market',
      qty: '0.001',
    },
    notes: [
      'Set BYBIT_API_KEY and BYBIT_API_SECRET env vars for direct execution',
      'Without API keys, trades are logged as simulated',
      'side must be "Buy" or "Sell"',
      'orderType: Market, Limit',
      'For limit orders, price is required',
    ],
  });
});

module.exports = router;
