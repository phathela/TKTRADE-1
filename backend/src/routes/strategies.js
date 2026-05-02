const express = require('express');
const router = express.Router();
const { query } = require('../db');
const strategyParser = require('../services/strategyParser');
const pineParser = require('../services/pineParser');
const pineExecutor = require('../services/pineExecutor');

// GET /api/strategies
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, type, parsed_config, created_at FROM strategies ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/strategies/:id/code
router.get('/:id/code', async (req, res) => {
  try {
    const result = await query('SELECT * FROM strategies WHERE id=$1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Strategy not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/strategies
router.post('/', async (req, res) => {
  try {
    const { name, code, type } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'name and code required' });

    const scriptType = type || (code.includes('indicator(') || code.includes('strategy(') ? 'pine' : 'custom');

    let parsedConfig = null;
    if (scriptType === 'pine') {
      try {
        parsedConfig = pineParser.parse(code);
      } catch (parseErr) {
        return res.status(400).json({ error: `Invalid Pine Script: ${parseErr.message}` });
      }
    } else {
      try {
        strategyParser.parse(code);
      } catch (parseErr) {
        return res.status(400).json({ error: `Invalid strategy: ${parseErr.message}` });
      }
    }

    const result = await query(
      'INSERT INTO strategies (name, code, type, parsed_config) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, code, scriptType, parsedConfig ? JSON.stringify(parsedConfig) : null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/strategies/:id
router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM strategies WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/strategies/validate
router.post('/validate', (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code required' });

    const isPine = code.includes('indicator(') || code.includes('strategy(');

    if (isPine) {
      try {
        const parsed = pineParser.parse(code);
        res.json({
          valid: true,
          type: 'pine',
          title: parsed.title,
          overlay: parsed.overlay,
          inputs: parsed.inputs,
          plots: parsed.plots.map(p => ({ title: p.title, series: p.series })),
          alerts: parsed.alerts.map(a => ({ title: a.title, condition: a.condition })),
          lineCount: parsed.lineCount,
        });
      } catch (parseErr) {
        res.status(400).json({ valid: false, error: parseErr.message, type: 'pine' });
      }
    } else {
      try {
        const fn = strategyParser.parse(code);
        const mockOHLC = Array(100).fill(0).map((_, i) => ({
          time: i, open: 50000, high: 50100, low: 49900, close: 50050, volume: 100,
        }));
        const signal = fn(mockOHLC);
        const lines = code.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));
        const hasEntry = lines.some(l => l.includes('strategy.entry') || l.includes('strategy.close'));
        res.json({
          valid: true,
          type: 'custom',
          hasSignals: hasEntry,
          signal: signal || 'none',
          lineCount: lines.length,
        });
      } catch (err) {
        res.status(400).json({ valid: false, error: err.message, type: 'custom' });
      }
    }
  } catch (err) {
    res.status(400).json({ valid: false, error: err.message });
  }
});

// POST /api/strategies/parse-pine
router.post('/parse-pine', (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code required' });
    const parsed = pineParser.parse(code);
    res.json(parsed);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/strategies/execute-pine
router.post('/execute-pine', async (req, res) => {
  try {
    const { code, symbol, interval, params, limit } = req.body;
    if (!code) return res.status(400).json({ error: 'code required' });
    if (!symbol || !interval) return res.status(400).json({ error: 'symbol and interval required' });

    // Fetch OHLC data
    const candleResult = await query(
      `SELECT * FROM candles WHERE symbol=$1 AND interval=$2 ORDER BY open_time ASC LIMIT $3`,
      [symbol.toUpperCase(), interval, limit || 500]
    );

    if (candleResult.rows.length < 30) {
      return res.status(400).json({
        error: `Not enough data (${candleResult.rows.length} candles). Need at least 30.`,
      });
    }

    const ohlc = candleResult.rows.map(r => ({
      time: Number(r.open_time),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: Number(r.volume),
    }));

    // Parse to get input structure
    const parsed = pineParser.parse(code);

    // Execute with user params
    const result = pineExecutor.execute(code, ohlc, params || {});

    res.json({
      ...result,
      meta: {
        ...result.meta,
        symbol: symbol.toUpperCase(),
        interval,
        candleCount: ohlc.length,
      },
      parsedStructure: parsed,
    });
  } catch (err) {
    console.error('Pine execute error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/strategies/execute-pine-direct
router.post('/execute-pine-direct', (req, res) => {
  try {
    const { code, data, params } = req.body;
    if (!code) return res.status(400).json({ error: 'code required' });
    if (!data || !Array.isArray(data) || data.length < 30) {
      return res.status(400).json({ error: 'data array required with at least 30 candles' });
    }

    const ohlc = data.map(c => ({
      time: Number(c.time || c.open_time),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume || 0),
    }));

    const result = pineExecutor.execute(code, ohlc, params || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/strategies/templates
router.get('/templates', (req, res) => {
  res.json([
    {
      type: 'pine',
      name: 'Simple Moving Average',
      code: `//@version=5
indicator("SMA", overlay=true)

len = input.int(20, "Length", minval=1, maxval=200)
src = input.source(close, "Source")

ma = ta.sma(src, len)
plot(ma, "SMA", color=color.blue, linewidth=2)`,
    },
    {
      type: 'pine',
      name: 'EMA Cross',
      code: `//@version=5
indicator("EMA Cross", overlay=true)

fastLen = input.int(9, "Fast Length", minval=1, maxval=100)
slowLen = input.int(21, "Slow Length", minval=1, maxval=200)

fastMA = ta.ema(close, fastLen)
slowMA = ta.ema(close, slowLen)

plot(fastMA, "Fast EMA", color=color.blue, linewidth=2)
plot(slowMA, "Slow EMA", color=color.red, linewidth=2)`,
    },
    {
      type: 'pine',
      name: 'RSI Indicator',
      code: `//@version=5
indicator("RSI", overlay=false)

len = input.int(14, "RSI Length", minval=1, maxval=100)
src = input.source(close, "Source")
ob = input.int(70, "Overbought", minval=50, maxval=100)
os = input.int(30, "Oversold", minval=0, maxval=50)

rsiValue = ta.rsi(src, len)

plot(rsiValue, "RSI", color=color.purple, linewidth=2)
hline(ob, "Overbought", color=color.red, linewidth=1)
hline(os, "Oversold", color=color.green, linewidth=1)
hline(50, "Mid", color=color.gray, linewidth=1)`,
    },
    {
      type: 'pine',
      name: 'MACD',
      code: `//@version=5
indicator("MACD", overlay=false)

fast = input.int(12, "Fast Length", minval=1)
slow = input.int(26, "Slow Length", minval=1)
signal = input.int(9, "Signal Smoothing", minval=1)
src = input.source(close, "Source")

[macdLine, signalLine, histLine] = ta.macd(src, fast, slow, signal)

plot(histLine, "Histogram", color=color.blue, style=plot.style_histogram, linewidth=2)
plot(macdLine, "MACD", color=color.blue, linewidth=2)
plot(signalLine, "Signal", color=color.orange, linewidth=2)
hline(0, "Zero", color=color.gray)`,
    },
    {
      type: 'pine',
      name: 'Bollinger Bands',
      code: `//@version=5
indicator("Bollinger Bands", overlay=true)

len = input.int(20, "Length", minval=1)
mult = input.float(2.0, "StdDev", minval=0.1, maxval=5, step=0.1)
src = input.source(close, "Source")

[upper, middle, lower] = ta.bb(src, len, mult)

plot(upper, "Upper", color=color.red, linewidth=1)
plot(middle, "Middle", color=color.blue, linewidth=1)
plot(lower, "Lower", color=color.green, linewidth=1)`,
    },
    {
      type: 'pine',
      name: 'Stochastic RSI',
      code: `//@version=5
indicator("Stochastic RSI", overlay=false)

len = input.int(14, "RSI Length", minval=1)
kLen = input.int(3, "%K Length", minval=1)
dLen = input.int(3, "%D Smoothing", minval=1)

rsi = ta.rsi(close, len)
rsiLow = ta.lowest(rsi, len)
rsiHigh = ta.highest(rsi, len)
stochK = (rsi - rsiLow) / (rsiHigh - rsiLow) * 100
k = ta.sma(stochK, kLen)
d = ta.sma(k, dLen)

plot(k, "%K", color=color.blue, linewidth=2)
plot(d, "%D", color=color.orange, linewidth=2)
hline(80, "Overbought", color=color.red)
hline(20, "Oversold", color=color.green)`,
    },
    {
      type: 'pine',
      name: 'VWAP',
      code: `//@version=5
indicator("VWAP", overlay=true)

src = input.source(hlc3, "Source")

cumulPV = 0.0
cumulVol = 0.0
for i = 0 to bar_index
    cumulPV := src[i] * volume[i]
    cumulVol := volume[i]

vwapValue = cumulPV / cumulVol
plot(vwapValue, "VWAP", color=color.blue, linewidth=2)`,
    },
  ]);
});

// Update DB schema for parsed_config
router.post('/migrate', async (req, res) => {
  try {
    await query(`ALTER TABLE strategies ADD COLUMN IF NOT EXISTS parsed_config JSONB DEFAULT NULL`);
    await query(`ALTER TABLE strategies ALTER COLUMN type TYPE VARCHAR(20)`);
    res.json({ success: true, message: 'Migration applied' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
