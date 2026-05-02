import React, { useState } from 'react';
import { createAlert, testAlert } from '../../services/api';

const CONDITION_TYPES = [
  { id: 'price_above', name: 'Price crosses above' },
  { id: 'price_below', name: 'Price crosses below' },
  { id: 'price_cross', name: 'Price crosses' },
  { id: 'indicator_cross', name: 'Indicator crosses' },
  { id: 'strategy_signal', name: 'Strategy signal' },
];

const FREQUENCIES = [
  { id: 'once_per_bar', name: 'Once Per Bar' },
  { id: 'once_per_minute', name: 'Once Per Minute' },
  { id: 'once_per_hour', name: 'Once Per Hour' },
  { id: 'always', name: 'Every Tick' },
];

export default function AlertDialog({ symbol, currentPrice, onClose, onCreated }) {
  const [step, setStep] = useState(1); // 1: condition, 2: actions
  const [name, setName] = useState(`${symbol} Alert`);
  const [conditionType, setConditionType] = useState('price_above');
  const [conditionValue, setConditionValue] = useState(currentPrice || '50000');
  const [frequency, setFrequency] = useState('once_per_bar');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookMessage, setWebhookMessage] = useState('');
  const [showTemplate, setShowTemplate] = useState('buy');
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);

  const buyTemplate = JSON.stringify({
    category: 'linear',
    symbol: '{{symbol}}',
    side: 'Buy',
    orderType: 'Market',
    qty: '0.001',
    timeInForce: 'GTC',
  }, null, 2);

  const sellTemplate = JSON.stringify({
    category: 'linear',
    symbol: '{{symbol}}',
    side: 'Sell',
    orderType: 'Market',
    qty: '0.001',
    timeInForce: 'GTC',
  }, null, 2);

  const customTemplate = JSON.stringify({
    symbol: '{{symbol}}',
    side: 'Buy',
    orderType: 'Market',
    qty: '0.001',
    price: '{{price}}',
  }, null, 2);

  const handleTemplate = (type) => {
    setShowTemplate(type);
    if (type === 'buy') setWebhookMessage(buyTemplate);
    else if (type === 'sell') setWebhookMessage(sellTemplate);
    else setWebhookMessage(customTemplate);
  };

  const handleTest = async () => {
    setTestResult({ status: 'sending...' });
    try {
      // Create a temp alert to test or send directly
      const result = await testAlert('test', { webhookUrl, webhookMessage, testPrice: conditionValue });
      setTestResult(result);
    } catch (err) {
      setTestResult({ error: err.message });
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createAlert({
        name,
        symbol,
        conditionType,
        conditionConfig: {
          type: conditionType,
          value: parseFloat(conditionValue),
          symbol,
        },
        options: { frequency },
        webhookUrl: webhookUrl || null,
        webhookMessage: webhookMessage || null,
      });
      onCreated?.();
    } catch (err) {
      alert('Error creating alert: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 18 }}>🔔</span>
            <span>Create Alert</span>
          </div>
          <button className="btn-secondary" onClick={onClose} style={{ padding: '2px 10px', fontSize: 16 }}>✕</button>
        </div>

        <div className="modal-body">
          {/* Alert Name */}
          <div className="form-group">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {step === 1 && (
            <>
              {/* Condition */}
              <div className="form-group">
                <label>Condition</label>
                <select value={conditionType} onChange={(e) => setConditionType(e.target.value)}>
                  {CONDITION_TYPES.map(ct => (
                    <option key={ct.id} value={ct.id}>{ct.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Symbol</label>
                  <input value={symbol} disabled />
                </div>
                <div className="form-group">
                  <label>Value</label>
                  <input
                    type="number"
                    value={conditionValue}
                    onChange={(e) => setConditionValue(e.target.value)}
                    step="0.1"
                  />
                </div>
              </div>

              {/* Frequency */}
              <div className="form-group">
                <label>Frequency</label>
                <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                  {FREQUENCIES.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div className="modal-footer" style={{ borderTop: 'none', padding: '8px 0 0' }}>
                <button className="btn-secondary" onClick={onClose}>Cancel</button>
                <button className="btn-primary" onClick={() => setStep(2)}>Next: Actions</button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {/* Webhook URL */}
              <div className="form-group">
                <label>Webhook URL</label>
                <input
                  placeholder="https://your-app.railway.app/api/webhook/trade"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Enter the URL to send the webhook to (e.g., your Bybit trade execution endpoint)
                </div>
              </div>

              {/* Message Templates */}
              <div className="form-group">
                <label>Message Template</label>
                <div className="checkbox-group" style={{ marginBottom: 8 }}>
                  <label className="checkbox-label" onClick={() => handleTemplate('buy')}>
                    <input type="checkbox" checked={showTemplate === 'buy'} readOnly />
                    Buy
                  </label>
                  <label className="checkbox-label" onClick={() => handleTemplate('sell')}>
                    <input type="checkbox" checked={showTemplate === 'sell'} readOnly />
                    Sell
                  </label>
                  <label className="checkbox-label" onClick={() => handleTemplate('custom')}>
                    <input type="checkbox" checked={showTemplate === 'custom'} readOnly />
                    Custom
                  </label>
                </div>
              </div>

              {/* Message Body */}
              <div className="form-group">
                <label>Message (JSON)</label>
                <textarea
                  style={{ minHeight: 120, fontFamily: 'monospace', fontSize: 11 }}
                  value={webhookMessage}
                  onChange={(e) => setWebhookMessage(e.target.value)}
                  placeholder='{"side": "Buy", "symbol": "BTCUSDT", "qty": "0.001"}'
                />
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Available variables: {'{'}symbol{'}'}, {'{'}price{'}'}, {'{'}timestamp{'}'}, {'{'}alert_name{'}'}
                </div>
              </div>

              {/* Test & Preview */}
              {testResult && (
                <div style={{
                  background: testResult.error ? 'rgba(242,54,69,0.1)' : 'rgba(8,153,129,0.1)',
                  borderRadius: 4, padding: 8, marginBottom: 10, fontSize: 12,
                  color: testResult.error ? 'var(--red)' : 'var(--green)',
                }}>
                  {testResult.error ? `Error: ${testResult.error}` : `Test sent successfully (${testResult.status})`}
                </div>
              )}

              <div className="form-group">
                <label>Available Variables</label>
                <div style={{ fontSize: 12, background: 'var(--bg-tertiary)', borderRadius: 4, padding: 8 }}>
                  <code>{'{symbol}'}</code> - Trading pair symbol<br />
                  <code>{'{price}'}</code> - Current price when triggered<br />
                  <code>{'{timestamp}'}</code> - ISO timestamp<br />
                  <code>{'{alert_name}'}</code> - Alert name
                </div>
              </div>

              <div className="form-group">
                <label>Bybit Order Documentation</label>
                <div style={{ fontSize: 12, background: 'var(--bg-tertiary)', borderRadius: 4, padding: 8 }}>
                  For market orders: {'{'} "category": "linear", "symbol": "BTCUSDT", "side": "Buy", "orderType": "Market", "qty": "0.001" {'}'}
                  <br /><br />
                  For limit orders: {'{'} "symbol": "BTCUSDT", "side": "Buy", "orderType": "Limit", "qty": "0.001", "price": "50000" {'}'}
                  <br /><br />
                  Full API docs: <a href="https://bybit-exchange.github.io/docs/v5/order/create-order" target="_blank" style={{ color: 'var(--accent)' }}>Bybit Order API</a>
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: 'none', padding: '8px 0 0' }}>
                <button className="btn-secondary" onClick={() => setStep(1)}>Back</button>
                <button className="btn-secondary" onClick={handleTest}>Send Test</button>
                <button className="btn-primary" onClick={handleCreate} disabled={saving}>
                  {saving ? 'Creating...' : 'Create Alert'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
