const express = require('express');
const router = express.Router();
const bybitRest = require('../services/bybitRest');

// GET /api/ticker/:symbol
router.get('/ticker/:symbol', async (req, res) => {
  try {
    const data = await bybitRest.getTicker(req.params.symbol.toUpperCase());
    if (data?.result?.list?.[0]) {
      const t = data.result.list[0];
      res.json({
        symbol: t.symbol,
        price: parseFloat(t.lastPrice),
        change24h: parseFloat(t.change24h),
        volume24h: parseFloat(t.volume24h),
        high24h: parseFloat(t.highPrice24h),
        low24h: parseFloat(t.lowPrice24h),
        turnover24h: parseFloat(t.turnover24h),
      });
    } else {
      res.status(404).json({ error: 'Ticker not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orderbook/:symbol
router.get('/orderbook/:symbol', async (req, res) => {
  try {
    const data = await bybitRest.getOrderBook(req.params.symbol.toUpperCase(), 50);
    res.json(data?.result || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trades/:symbol
router.get('/trades/:symbol', async (req, res) => {
  try {
    const data = await bybitRest.getRecentTrades(req.params.symbol.toUpperCase(), 50);
    const trades = (data?.result?.list || []).map(t => ({
      price: parseFloat(t.price),
      size: parseFloat(t.size),
      side: t.side,
      time: t.timestamp,
    }));
    res.json(trades);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/market/info
router.get('/info', async (req, res) => {
  try {
    const data = await bybitRest.restRequest('/v5/market/instruments-info', {
      category: 'linear', limit: 50,
    });
    res.json(data?.result?.list || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
