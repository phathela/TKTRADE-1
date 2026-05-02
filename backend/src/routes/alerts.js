const express = require('express');
const router = express.Router();
const alertEngine = require('../services/alertEngine');
const { query } = require('../db');

// GET /api/alerts
router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM alerts ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/alerts
router.post('/', async (req, res) => {
  try {
    const alert = await alertEngine.addAlert(req.body);
    res.status(201).json(alert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/alerts/:id
router.put('/:id', async (req, res) => {
  try {
    const alert = await alertEngine.updateAlert(req.params.id, req.body);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    res.json(alert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/alerts/:id
router.delete('/:id', async (req, res) => {
  try {
    await alertEngine.deleteAlert(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/alerts/:id/test
router.post('/:id/test', async (req, res) => {
  try {
    const alertResult = await query('SELECT * FROM alerts WHERE id=$1', [req.params.id]);
    if (alertResult.rows.length === 0) return res.status(404).json({ error: 'Alert not found' });

    const alert = alertResult.rows[0];
    if (!alert.webhook_url) return res.status(400).json({ error: 'No webhook URL configured' });

    const axios = require('axios');
    let message = alert.webhook_message || '';
    message = message.replace(/\{\{price\}\}/g, req.body?.testPrice || '50000')
                     .replace(/\{\{symbol\}\}/g, alert.symbol)
                     .replace(/\{\{timestamp\}\}/g, new Date().toISOString())
                     .replace(/\{\{alert_name\}\}/g, alert.name);

    const response = await axios.post(alert.webhook_url, JSON.parse(message), {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });

    res.json({ success: true, status: response.status, data: response.data });
  } catch (err) {
    res.status(500).json({ error: err.message, detail: err.response?.data });
  }
});

// GET /api/alert-logs
router.get('/logs', async (req, res) => {
  try {
    const result = await query(
      `SELECT al.*, a.name as alert_name FROM alert_log al
       LEFT JOIN alerts a ON a.id = al.alert_id
       ORDER BY al.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
