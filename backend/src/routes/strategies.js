const express = require('express');
const router = express.Router();
const { query } = require('../db');
const strategyParser = require('../services/strategyParser');

// GET /api/strategies
router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM strategies ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/strategies
router.post('/', async (req, res) => {
  try {
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'name and code required' });

    // Validate the strategy
    try {
      strategyParser.parse(code);
    } catch (parseErr) {
      return res.status(400).json({ error: `Invalid strategy: ${parseErr.message}` });
    }

    const result = await query(
      'INSERT INTO strategies (name, code, type) VALUES ($1, $2, $3) RETURNING *',
      [name, code, 'custom']
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

    const fn = strategyParser.parse(code);
    // Try with mock data
    const mockOHLC = Array(100).fill(0).map((_, i) => ({
      time: i, open: 50000, high: 50100, low: 49900, close: 50050, volume: 100,
    }));
    const signal = fn(mockOHLC);

    // Determine the strategy structure
    const lines = code.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));
    const hasEntry = lines.some(l => l.includes('strategy.entry') || l.includes('strategy.close'));

    res.json({
      valid: true,
      hasSignals: hasEntry,
      signal: signal || 'none',
      lineCount: lines.length,
    });
  } catch (err) {
    res.status(400).json({ valid: false, error: err.message });
  }
});

// GET /api/strategies/templates
router.get('/templates', (req, res) => {
  res.json([
    {
      name: 'SMA Crossover',
      code: `// SMA Crossover Strategy
// Buy when fast SMA crosses above slow SMA
// Sell when fast SMA crosses below slow SMA

fastSMA = sma(close, 10)
slowSMA = sma(close, 30)

if crossover(fastSMA, slowSMA)
    strategy.entry(true, "Long")

if crossunder(fastSMA, slowSMA)
    strategy.entry(true, "Exit")`,
    },
    {
      name: 'RSI Mean Reversion',
      code: `// RSI Mean Reversion Strategy
// Buy when RSI crosses above oversold level (30)
// Sell when RSI crosses below overbought level (70)

if crossover(rsi14, 30)
    strategy.entry(true, "Long")

if crossunder(rsi14, 70)
    strategy.entry(true, "Exit")`,
    },
    {
      name: 'EMA Trend',
      code: `// EMA Trend Following Strategy
// Buy when price crosses above EMA
// Sell when price crosses below EMA

emaValue = ema(close, 50)

if crossover(close, emaValue)
    strategy.entry(true, "Long")

if crossunder(close, emaValue)
    strategy.entry(true, "Exit")`,
    },
  ]);
});

module.exports = router;
