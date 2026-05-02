const axios = require('axios');
const { query } = require('../db');

class AlertEngine {
  constructor() {
    this.activeAlerts = new Map();
    this.interval = null;
    this.lastValues = new Map();
  }

  start() {
    console.log('Alert engine started');
    this.interval = setInterval(() => this.checkAlerts(), 1000);
  }

  stop() {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  async loadAlerts() {
    try {
      const result = await query("SELECT * FROM alerts WHERE status = 'active'");
      result.rows.forEach(a => this.activeAlerts.set(a.id, a));
      console.log(`Loaded ${result.rows.length} active alerts`);
    } catch (err) {
      console.error('Load alerts error:', err.message);
    }
  }

  async addAlert(alert) {
    try {
      const result = await query(
        `INSERT INTO alerts (name, symbol, condition_type, condition_config, options, webhook_url, webhook_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [alert.name, alert.symbol || 'BTCUSDT', alert.conditionType, JSON.stringify(alert.conditionConfig || {}),
         JSON.stringify(alert.options || {}), alert.webhookUrl || null, alert.webhookMessage || null]
      );
      const newAlert = result.rows[0];
      if (newAlert.status === 'active') this.activeAlerts.set(newAlert.id, newAlert);
      return newAlert;
    } catch (err) {
      console.error('Add alert error:', err.message);
      throw err;
    }
  }

  async updateAlert(id, updates) {
    try {
      const fields = [];
      const values = [];
      let idx = 1;
      for (const [key, val] of Object.entries(updates)) {
        const col = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (col === 'condition_config' || col === 'options') {
          fields.push(`${col}=$${idx}`);
          values.push(JSON.stringify(val));
        } else {
          fields.push(`${col}=$${idx}`);
          values.push(val);
        }
        idx++;
      }
      fields.push('updated_at=NOW()');
      values.push(id);
      const result = await query(
        `UPDATE alerts SET ${fields.join(',')} WHERE id=$${idx} RETURNING *`, values
      );
      const updated = result.rows[0];
      if (updated) {
        if (updated.status === 'active') this.activeAlerts.set(updated.id, updated);
        else this.activeAlerts.delete(updated.id);
      }
      return updated;
    } catch (err) {
      console.error('Update alert error:', err.message);
      throw err;
    }
  }

  async deleteAlert(id) {
    this.activeAlerts.delete(id);
    await query('DELETE FROM alerts WHERE id=$1', [id]);
  }

  async checkAlerts() {
    if (this.activeAlerts.size === 0) return;
    const alerts = Array.from(this.activeAlerts.values());

    for (const alert of alerts) {
      try {
        await this._evaluateAlert(alert);
      } catch (err) {
        console.error(`Alert ${alert.id} evaluation error:`, err.message);
      }
    }
  }

  async _evaluateAlert(alert) {
    const config = alert.condition_config;
    const symbol = alert.symbol || 'BTCUSDT';

    // Get current price from last stored value
    let currentPrice = this.lastValues.get(`price:${symbol}`);
    if (!currentPrice) return;

    const triggered = this._checkCondition(config, currentPrice);
    if (triggered) {
      await this._fireAlert(alert, currentPrice);
      if (alert.options?.expireOnTrigger !== false) {
        await this.updateAlert(alert.id, { status: 'triggered' });
      }
    }
  }

  _checkCondition(config, price) {
    if (!config) return false;
    switch (config.type) {
      case 'price_above':
        return price >= (config.value || 0);
      case 'price_below':
        return price <= (config.value || 0);
      case 'price_cross':
        return this._checkCross(config, price);
      case 'indicator_cross': {
        // Simplified — would need full indicator values
        return false;
      }
      case 'strategy_signal':
        return false;
      default:
        return false;
    }
  }

  _checkCross(config, price) {
    const prevPrice = this.lastValues.get(`prev_price:${config.symbol || 'BTCUSDT'}`);
    if (!prevPrice) return false;
    const threshold = config.value || 0;
    if (config.direction === 'above' && prevPrice < threshold && price >= threshold) return true;
    if (config.direction === 'below' && prevPrice > threshold && price <= threshold) return true;
    return false;
  }

  async _fireAlert(alert, value) {
    console.log(`Alert fired: ${alert.name} (${alert.symbol}) at ${value}`);
    const timestamp = new Date().toISOString();

    // Replace template variables in webhook message
    let message = alert.webhook_message || '';
    message = message.replace(/\{\{price\}\}/g, value)
                     .replace(/\{\{symbol\}\}/g, alert.symbol)
                     .replace(/\{\{timestamp\}\}/g, timestamp)
                     .replace(/\{\{alert_name\}\}/g, alert.name);

    // Send webhook
    if (alert.webhook_url && message) {
      try {
        await axios.post(alert.webhook_url, JSON.parse(message), {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        });
      } catch (err) {
        console.error(`Webhook send failed for alert ${alert.id}:`, err.message);
      }
    }

    // Log the alert
    await query(
      `INSERT INTO alert_log (alert_id, symbol, condition_type, trigger_value, message_sent)
       VALUES ($1, $2, $3, $4, $5)`,
      [alert.id, alert.symbol, alert.condition_type, value, message]
    );
  }

  updatePrice(symbol, price) {
    const prev = this.lastValues.get(`price:${symbol}`);
    this.lastValues.set(`prev_price:${symbol}`, prev);
    this.lastValues.set(`price:${symbol}`, price);
  }
}

module.exports = new AlertEngine();
