const express = require('express');
const router = express.Router();
const backtestEngine = require('../services/backtestEngine');

// POST /api/backtest/run
router.post('/run', async (req, res) => {
  try {
    const { symbol, interval, startTime, endTime, strategyType, strategyConfig } = req.body;

    if (!symbol || !interval || !startTime || !endTime || !strategyType) {
      return res.status(400).json({
        error: 'Missing required fields: symbol, interval, startTime, endTime, strategyType',
      });
    }

    const result = await backtestEngine.run({
      symbol: symbol.toUpperCase(),
      interval,
      startTime: parseInt(startTime),
      endTime: parseInt(endTime),
      strategyType,
      strategyConfig: strategyConfig || {},
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backtest/history
router.get('/history', async (req, res) => {
  try {
    const history = await backtestEngine.getHistory();
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backtest/templates
router.get('/templates', (req, res) => {
  res.json([
    {
      id: 'sma_crossover',
      name: 'SMA Crossover',
      description: 'Buy when fast SMA crosses above slow SMA, sell when fast crosses below',
      defaultParams: { fastPeriod: 10, slowPeriod: 30, initialCapital: 10000 },
    },
    {
      id: 'rsi_reversal',
      name: 'RSI Reversal',
      description: 'Buy when RSI crosses above oversold, sell when crosses below overbought',
      defaultParams: { period: 14, oversold: 30, overbought: 70, initialCapital: 10000 },
    },
    {
      id: 'macd_crossover',
      name: 'MACD Crossover',
      description: 'Buy when MACD crosses above signal line, sell when crosses below',
      defaultParams: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, initialCapital: 10000 },
    },
    {
      id: 'custom',
      name: 'Custom Strategy',
      description: 'Upload your own strategy script',
      defaultParams: { initialCapital: 10000 },
    },
  ]);
});

module.exports = router;
