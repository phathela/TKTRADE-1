const express = require('express');
const router = express.Router();
const indicatorEngine = require('../services/indicatorEngine');
const { query } = require('../db');

// GET /api/indicators/builtin
router.get('/builtin', (req, res) => {
  res.json(indicatorEngine.BUILTIN_INDICATORS);
});

// POST /api/indicators/calculate
router.post('/calculate', async (req, res) => {
  try {
    const { symbol, interval, indicator, params } = req.body;
    if (!indicator) return res.status(400).json({ error: 'Indicator name required' });

    // Fetch candle data if symbol provided
    let ohlc;
    if (symbol && interval) {
      const result = await query(
        `SELECT * FROM candles WHERE symbol=$1 AND interval=$2 ORDER BY open_time ASC LIMIT 500`,
        [symbol.toUpperCase(), interval]
      );
      if (result.rows.length < 20) {
        return res.status(400).json({ error: `Not enough data (${result.rows.length} candles)` });
      }
      const close = result.rows.map(r => Number(r.close));
      ohlc = indicatorEngine.toOHLC(result.rows);
    } else if (req.body.data) {
      ohlc = req.body.data;
    } else {
      return res.status(400).json({ error: 'symbol/interval or data required' });
    }

    const result = indicatorEngine.computeIndicator(ohlc, indicator, params || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/indicators/multiple
router.post('/multiple', async (req, res) => {
  try {
    const { symbol, interval, indicators } = req.body;
    if (!indicators || !Array.isArray(indicators)) {
      return res.status(400).json({ error: 'indicators array required' });
    }

    const result = await query(
      `SELECT * FROM candles WHERE symbol=$1 AND interval=$2 ORDER BY open_time ASC LIMIT 500`,
      [symbol.toUpperCase(), interval]
    );
    const ohlc = indicatorEngine.toOHLC(result.rows);

    const results = {};
    for (const ind of indicators) {
      try {
        results[ind.id || ind.name] = indicatorEngine.computeIndicator(ohlc, ind.name, ind.params || {});
      } catch (e) {
        results[ind.id || ind.name] = { error: e.message };
      }
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
