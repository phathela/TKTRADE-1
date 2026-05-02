import React, { useState, useEffect } from 'react';
import { fetchStrategyTemplates, validateStrategy, saveStrategy } from '../../services/api';

export default function StrategyUploader({ onUploaded }) {
  const [templates, setTemplates] = useState([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [validationResult, setValidationResult] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchStrategyTemplates().then(setTemplates).catch(console.error);
  }, []);

  const handleLoadTemplate = (tmpl) => {
    setName(tmpl.name);
    setCode(tmpl.code);
    setValidationResult(null);
  };

  const handleValidate = async () => {
    if (!code.trim()) return;
    try {
      const result = await validateStrategy(code);
      setValidationResult(result);
    } catch (err) {
      setValidationResult({ valid: false, error: err.response?.data?.error || err.message });
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !code.trim()) return;
    setSaving(true);
    try {
      await saveStrategy({ name, code });
      onUploaded?.();
      setCode('');
      setName('');
      setValidationResult(null);
    } catch (err) {
      alert('Error saving strategy: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCode(ev.target.result);
      const fileName = file.name.replace(/\.(pine|txt|js)$/i, '');
      if (!name) setName(fileName);
    };
    reader.readAsText(file);
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600 }}>
        STRATEGY TEMPLATES
      </div>

      {templates.map(tmpl => (
        <div
          key={tmpl.name}
          className="indicator-item"
          onClick={() => handleLoadTemplate(tmpl)}
        >
          <div>
            <div className="indicator-name">{tmpl.name}</div>
            <div className="indicator-category">{tmpl.code.substring(0, 60)}...</div>
          </div>
          <button
            className="btn-primary"
            style={{ padding: '2px 10px', fontSize: 11 }}
            onClick={(e) => { e.stopPropagation(); handleLoadTemplate(tmpl); }}
          >
            Load
          </button>
        </div>
      ))}

      <hr style={{ borderColor: 'var(--border-color)', margin: '10px 0' }} />

      <div className="form-group">
        <label>Strategy Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="My Strategy" />
      </div>

      <div className="form-group">
        <label>
          Code
          <button
            className="btn-secondary"
            style={{ marginLeft: 8, padding: '1px 8px', fontSize: 11 }}
            onClick={() => document.getElementById('strategy-file-input').click()}
          >
            Upload .pine
          </button>
        </label>
        <input
          id="strategy-file-input"
          type="file"
          accept=".pine,.txt,.js"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
        <textarea
          style={{ minHeight: 200, fontFamily: 'monospace', fontSize: 11 }}
          value={code}
          onChange={e => { setCode(e.target.value); setValidationResult(null); }}
          placeholder={`// Write your strategy here
// Example:
// fastSMA = sma(close, 10)
// slowSMA = sma(close, 30)
// if crossover(fastSMA, slowSMA)
//     strategy.entry(true, "Long")`}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button className="btn-secondary" onClick={handleValidate}>
          Validate
        </button>
        <button className="btn-primary" onClick={handleSave} disabled={saving || !code || !name}>
          {saving ? 'Saving...' : 'Save Strategy'}
        </button>
      </div>

      {validationResult && (
        <div style={{
          padding: 8, borderRadius: 4, fontSize: 12, marginBottom: 6,
          background: validationResult.valid ? 'rgba(8,153,129,0.1)' : 'rgba(242,54,69,0.1)',
          color: validationResult.valid ? 'var(--green)' : 'var(--red)',
        }}>
          {validationResult.valid
            ? `✓ Valid strategy - ${validationResult.lineCount} lines, signal: ${validationResult.signal}`
            : `✗ ${validationResult.error}`}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
        <strong>Supported syntax:</strong>
        <ul style={{ paddingLeft: 16, marginTop: 4 }}>
          <li>Variables: <code>name = expression</code></li>
          <li>Indicators: <code>sma(close, 20)</code>, <code>ema(close, 50)</code></li>
          <li>Cross: <code>crossover(a, b)</code>, <code>crossunder(a, b)</code></li>
          <li>Entry: <code>strategy.entry(condition, "Long")</code></li>
          <li>Exit: <code>strategy.close(condition)</code></li>
          <li>Built-in: close, high, low, volume, sma20, sma50, ema12, ema26, rsi14</li>
        </ul>
      </div>
    </div>
  );
}
