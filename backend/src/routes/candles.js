const express = require('express');
const router = express.Router();
const { query, isAvailable } = require('../db');
const bybitRest = require('../services/bybitRest');

const INTERVAL_MAP = {
  '1m': 1, '5m': 5, '15m': 15, '30m': 30,
  '1h': 60, '2h': 120, '4h': 240, '6h': 360,
  '12h': 720, '1d': 'D', '1w': 'W', '1M': 'M',
};

// GET /api/candles/:symbol/:interval
router.get('/:symbol/:interval', async (req, res) => {
  try {
    const { symbol, interval } = req.params;
    const limit = parseInt(req.query.limit) || 200;

    // Try database first if available
    let result = null;
    if (isAvailable()) {
      try {
        result = await query(
          `SELECT * FROM candles WHERE symbol=$1 AND interval=$2
           ORDER BY open_time DESC LIMIT $3`,
          [symbol.toUpperCase(), interval, limit]
        );
      } catch (e) {
        console.warn('DB query failed:', e.message);
      }
    }

    // If DB has enough data, serve it directly — no REST fallback needed
    if (result && result.rows.length >= limit) {
      const formatted = result.rows.reverse().map(c => ({
        time: c.open_time,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume),
      }));
      return res.json({ symbol: symbol.toUpperCase(), interval, data: formatted });
    }

    // DB has some data but not enough — try REST to backfill, but don't fail if blocked
    const bybitInterval = INTERVAL_MAP[interval];
    if (bybitInterval) {
      try {
        const bybitResult = await bybitRest.getKline(symbol.toUpperCase(), bybitInterval, limit);
        if (bybitResult?.result?.list) {
          const candles = bybitResult.result.list.reverse();

          if (isAvailable()) {
            // Store in database
            for (const c of candles) {
              try {
                await query(
                  `INSERT INTO candles (symbol, interval, open_time, open, high, low, close, volume, turnover)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                   ON CONFLICT (symbol, interval, open_time) DO NOTHING`,
                  [
                    symbol.toUpperCase(), interval,
                    parseInt(c[0]) / 1000, // ms to seconds
                    parseFloat(c[1]), parseFloat(c[2]), parseFloat(c[3]),
                    parseFloat(c[4]), parseFloat(c[5]), parseFloat(c[6]),
                  ]
                );
              } catch (e) { /* skip duplicates */ }
            }
            // Re-fetch from DB (now includes backfilled rows)
            result = await query(
              `SELECT * FROM candles WHERE symbol=$1 AND interval=$2
               ORDER BY open_time DESC LIMIT $3`,
              [symbol.toUpperCase(), interval, limit]
            );
          } else {
            // DB not available, format Bybit data directly
            result = { rows: candles.map(c => ({
              open_time: parseInt(c[0]) / 1000,
              open: parseFloat(c[1]),
              high: parseFloat(c[2]),
              low: parseFloat(c[3]),
              close: parseFloat(c[4]),
              volume: parseFloat(c[5]),
            }))};
          }
        }
      } catch (restErr) {
        // REST API is blocked (e.g. CloudFront 403) — serve whatever we have from DB
        console.warn(`Bybit REST unavailable for ${symbol}/${interval}: ${restErr.message}`);
      }
    }

    // Format and return whatever data we have (DB rows or empty)
    if (!result || !result.rows || result.rows.length === 0) {
      return res.json({ symbol: symbol.toUpperCase(), interval, data: [] });
    }
    const formatted = result.rows.reverse().map(c => ({
      time: c.open_time,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume),
    }));


    res.json({ symbol: symbol.toUpperCase(), interval, data: formatted });
  } catch (err) {
    console.error('Candles error:', err.message);
    res.status(500).json({ error: err.message });
  }
});





// GET /api/candles/history/:symbol/:interval
router.get('/history/:symbol/:interval', async (req, res) => {
  try {
    const { symbol, interval } = req.params;
    const { from, to, limit } = req.query;

    let sql = 'SELECT * FROM candles WHERE symbol=$1 AND interval=$2';
    const params = [symbol.toUpperCase(), interval];
    let idx = 3;

    if (from) { sql += ` AND open_time >= $${idx++}`; params.push(parseInt(from)); }
    if (to) { sql += ` AND open_time <= $${idx++}`; params.push(parseInt(to)); }
    sql += ` ORDER BY open_time ASC LIMIT $${idx}`;
    params.push(parseInt(limit) || 1000);

    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
