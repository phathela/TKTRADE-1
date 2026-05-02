import React, { useState, useEffect, useCallback } from 'react';
import { fetchStrategyTemplates, saveStrategy } from '../../services/api';

const API = (await_import) => {
  // Lazy import to avoid circular deps
  const base = '/api';
  return {
    validate: (code) => fetch(`${base}/strategies/validate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).then(r => r.json()),
    parsePine: (code) => fetch(`${base}/strategies/parse-pine`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).then(r => r.json()),
    executePine: (code, symbol, interval, params) => fetch(`${base}/strategies/execute-pine`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, symbol, interval, params, limit: 500 }),
    }).then(r => r.json()),
  };
};

export default function StrategyUploader({ symbol, interval, onDisplayOnChart, activePineScripts }) {
  const [templates, setTemplates] = useState([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [isPine, setIsPine] = useState(false);
  const [parsedInfo, setParsedInfo] = useState(null);
  const [userParams, setUserParams] = useState({});
  const [execResult, setExecResult] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTab, setSelectedTab] = useState('upload'); // upload | templates | active

  useEffect(() => {
    fetchStrategyTemplates().then(setTemplates).catch(console.error);
  }, []);

  // Detect if code is Pine Script
  useEffect(() => {
    const pine = code.includes('indicator(') || code.includes('strategy(');
    setIsPine(pine);
    if (!code.trim()) {
      setParsedInfo(null);
      setUserParams({});
      setExecResult(null);
    }
  }, [code]);

  const handleLoadTemplate = (tmpl) => {
    setName(tmpl.name);
    setCode(tmpl.code);
    setParsedInfo(null);
    setUserParams({});
    setExecResult(null);
    setError(null);
  };

  const handleParse = async () => {
    if (!code.trim()) return;
    setError(null);
    try {
      const api = API();
      const result = await api.parsePine(code);
      setParsedInfo(result);

      // Extract default params
      const defaults = {};
      if (result.inputs) {
        result.inputs.forEach(inp => {
          if (inp.name) {
            defaults[inp.name] = inp.default !== undefined ? inp.default :
              inp.type === 'int' ? 14 : inp.type === 'float' ? 1.0 :
              inp.type === 'bool' ? true : inp.type === 'color' ? '#2962ff' :
              inp.type === 'source' ? 'close' : '';
          }
        });
      }
      setUserParams(defaults);

      if (result.type === 'indicator') {
        setSelectedTab('config');
      }
    } catch (err) {
      setError('Parse error: ' + err.message);
    }
  };

  const handleExecute = async () => {
    if (!code.trim() || !symbol) return;
    setIsExecuting(true);
    setError(null);
    try {
      const api = API();
      const result = await api.executePine(code, symbol, interval, userParams);

      if (result.error) {
        setError(result.error);
        setIsExecuting(false);
        return;
      }

      setExecResult(result);

      // Auto-display on chart
      if (onDisplayOnChart && result.plots) {
        onDisplayOnChart({
          id: Date.now(),
          name: name || result.meta?.title || 'Pine Script',
          code,
          params: userParams,
          result: result,
          overlay: result.meta?.overlay !== false,
        });
      }
    } catch (err) {
      setError('Execution error: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsExecuting(false);
    }
  };

  const handleParamChange = (paramName, value) => {
    setUserParams(prev => ({ ...prev, [paramName]: value }));
  };

  const handleSave = async () => {
    if (!name.trim() || !code.trim()) return;
    try {
      await saveStrategy({
        name,
        code,
        type: isPine ? 'pine' : 'custom',
      });
      setSelectedTab('saved');
    } catch (err) {
      setError('Save error: ' + err.message);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target.result;
      setCode(content);
      const fileName = file.name.replace(/\.(pine|txt)$/i, '');
      if (!name) setName(fileName);
      setParsedInfo(null);
      setUserParams({});
      setExecResult(null);
      setError(null);
    };
    reader.readAsText(file);
  };

  const lastValues = execResult ? getLastValues(execResult) : {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 8, flexShrink: 0 }}>
        <button className={`tab-btn ${selectedTab === 'upload' ? 'active' : ''}`} onClick={() => setSelectedTab('upload')}>
          Upload
        </button>
        <button className={`tab-btn ${selectedTab === 'templates' ? 'active' : ''}`} onClick={() => setSelectedTab('templates')}>
          Templates
        </button>
        <button className={`tab-btn ${selectedTab === 'config' ? 'active' : ''}`} onClick={() => setSelectedTab('config')}>
          Configure
        </button>
        {activePineScripts?.length > 0 && (
          <button className={`tab-btn ${selectedTab === 'active' ? 'active' : ''}`} onClick={() => setSelectedTab('active')}>
            Active ({activePineScripts.length})
          </button>
        )}
      </div>

      {selectedTab === 'upload' && (
        <div>
          <div className="form-group">
            <label>Strategy Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="My Indicator" />
          </div>

          <div className="form-group">
            <label>
              Pine Script Code
              <button
                className="btn-secondary"
                style={{ marginLeft: 8, padding: '1px 8px', fontSize: 11 }}
                onClick={() => document.getElementById('pine-file-input').click()}
              >
                Upload .pine
              </button>
            </label>
            <input id="pine-file-input" type="file" accept=".pine,.txt" style={{ display: 'none' }} onChange={handleFileUpload} />
            <textarea
              style={{ minHeight: 250, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.4 }}
              value={code}
              onChange={e => { setCode(e.target.value); setParsedInfo(null); setExecResult(null); }}
              placeholder={`//@version=5\nindicator("My Indicator", overlay=true)\n\nlen = input.int(14, "Length")\nsrc = input.source(close, "Source")\n\nma = ta.sma(src, len)\nplot(ma, "MA", color=color.blue, linewidth=2)`}
            />
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={handleParse}>
              {isPine ? 'Parse & Configure' : 'Validate'}
            </button>
            {isPine && parsedInfo && (
              <button className="btn-primary" onClick={handleExecute} disabled={isExecuting}>
                {isExecuting ? 'Computing...' : 'Display on Chart'}
              </button>
            )}
            <button className="btn-secondary" onClick={handleSave}>
              Save
            </button>
          </div>

          {isPine && parsedInfo && (
            <div style={{ fontSize: 11, background: 'var(--bg-tertiary)', borderRadius: 4, padding: 8, marginBottom: 8 }}>
              <strong>{parsedInfo.title || 'Untitled'}</strong>
              {parsedInfo.overlay ? ' (overlay)' : ' (separate pane)'}
              <br />
              {parsedInfo.plots?.length} plot(s), {parsedInfo.inputs?.length} input(s), {parsedInfo.hlines?.length} horizontal line(s)
              {parsedInfo.alerts?.length > 0 && `, ${parsedInfo.alerts.length} alert condition(s)`}
            </div>
          )}

          {error && (
            <div style={{
              padding: 8, borderRadius: 4, fontSize: 12, marginBottom: 6,
              background: 'rgba(242,54,69,0.15)', color: 'var(--red)',
              whiteSpace: 'pre-wrap',
            }}>
              {error}
            </div>
          )}

          {/* Pine Script Syntax Reference */}
          <details style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Pine Script v5 Reference</summary>
            <div style={{ padding: 8, marginTop: 4, background: 'var(--bg-tertiary)', borderRadius: 4, lineHeight: 1.6 }}>
              <strong>Declaration:</strong><br />
              <code>indicator("Title", overlay=true)</code><br />
              <code>strategy("Title", overlay=true, initial_capital=10000)</code><br /><br />
              <strong>Input Types:</strong><br />
              <code>input.int(14, "Label", minval=1, maxval=100)</code><br />
              <code>input.float(2.0, "Label", step=0.1)</code><br />
              <code>input.bool(true, "Show MA")</code><br />
              <code>input.color(color.blue, "Color")</code><br />
              <code>input.source(close, "Source")</code><br /><br />
              <strong>Functions:</strong><br />
              <code>ta.sma(src, len)</code>, <code>ta.ema(src, len)</code><br />
              <code>ta.rsi(src, len)</code>, <code>ta.macd(src, fast, slow, sig)</code><br />
              <code>ta.bb(src, len, mult)</code>, <code>ta.stoch(h, l, c, k, d)</code><br />
              <code>ta.atr(len)</code>, <code>ta.highest(src, len)</code>, <code>ta.lowest(src, len)</code><br />
              <code>ta.crossover(a, b)</code>, <code>ta.crossunder(a, b)</code><br />
              <code>ta.wma(src, len)</code>, <code>ta.vwma(src, vol, len)</code><br />
              <code>ta.hma(src, len)</code>, <code>ta.alma(src, len, offset, sigma)</code><br />
              <code>ta.change(src)</code>, <code>ta.median(src, len)</code><br />
              <code>ta.correlation(a, b, len)</code><br /><br />
              <strong>Plot:</strong><br />
              <code>plot(series, "Title", color=color.blue, linewidth=2)</code><br />
              <code>hline(price, "Title", color=color.gray)</code><br />
              <code>plotshape(cond, "Title", style=shape.circle, location=location.abovebar)</code><br />
              <code>alertcondition(cond, "Title", "Message")</code><br />
            </div>
          </details>
        </div>
      )}

      {selectedTab === 'templates' && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600 }}>
            PINE SCRIPT TEMPLATES
          </div>
          {templates.filter(t => t.type === 'pine').map(tmpl => (
            <div key={tmpl.name} className="indicator-item" onClick={() => handleLoadTemplate(tmpl)}>
              <div>
                <div className="indicator-name">{tmpl.name}</div>
                <div className="indicator-category">Pine Script template</div>
              </div>
              <button className="btn-primary" style={{ padding: '2px 10px', fontSize: 11 }}
                onClick={(e) => { e.stopPropagation(); handleLoadTemplate(tmpl); }}>
                Load
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedTab === 'config' && parsedInfo && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
            {parsedInfo.title || name || 'Configure Indicator'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
            {parsedInfo.overlay ? 'Overlay on price' : 'Separate pane'} &middot; {parsedInfo.precision || 2} decimal(s)
          </div>

          {/* Input Parameters */}
          {parsedInfo.inputs?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>INPUTS</div>
              {parsedInfo.inputs.map((input, idx) => (
                <div key={input.name || idx} className="form-group" style={{ marginBottom: 8 }}>
                  <label>
                    {input.title || input.name}
                    {input.tooltip && <span style={{ marginLeft: 4, cursor: 'help' }} title={input.tooltip}>ℹ</span>}
                  </label>
                  {input.type === 'int' || input.type === 'float' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="range"
                        min={input.min || 1}
                        max={input.max || (input.type === 'int' ? 200 : 10)}
                        step={input.step || (input.type === 'int' ? 1 : 0.1)}
                        value={userParams[input.name] ?? input.default ?? (input.type === 'int' ? 14 : 1.0)}
                        onChange={e => handleParamChange(input.name, parseFloat(e.target.value))}
                        style={{ flex: 1 }}
                      />
                      <input
                        type="number"
                        min={input.min}
                        max={input.max}
                        step={input.step || (input.type === 'int' ? 1 : 0.1)}
                        value={userParams[input.name] ?? input.default ?? (input.type === 'int' ? 14 : 1.0)}
                        onChange={e => handleParamChange(input.name, parseFloat(e.target.value))}
                        style={{ width: 70, textAlign: 'center' }}
                      />
                    </div>
                  ) : input.type === 'bool' ? (
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={userParams[input.name] ?? input.default ?? true}
                        onChange={e => handleParamChange(input.name, e.target.checked)}
                      />
                      Enable
                    </label>
                  ) : input.type === 'color' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="color"
                        value={userParams[input.name] || input.default || '#2962ff'}
                        onChange={e => handleParamChange(input.name, e.target.value)}
                        style={{ width: 40, height: 30, padding: 2 }}
                      />
                      <span style={{ fontSize: 12, fontFamily: 'monospace' }}>
                        {userParams[input.name] || input.default || '#2962ff'}
                      </span>
                    </div>
                  ) : input.type === 'source' ? (
                    <select
                      value={userParams[input.name] || input.default || 'close'}
                      onChange={e => handleParamChange(input.name, e.target.value)}
                    >
                      <option value="close">Close</option>
                      <option value="open">Open</option>
                      <option value="high">High</option>
                      <option value="low">Low</option>
                      <option value="hl2">HL2</option>
                      <option value="hlc3">HLC3</option>
                      <option value="ohlc4">OHLC4</option>
                      <option value="volume">Volume</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={userParams[input.name] ?? input.default ?? ''}
                      onChange={e => handleParamChange(input.name, e.target.value)}
                    />
                  )}
                  {input.min !== undefined && input.max !== undefined && (
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                      Range: {input.min} – {input.max}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Plots info */}
          {parsedInfo.plots?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>PLOTS</div>
              {parsedInfo.plots.map((plot, idx) => (
                <div key={idx} style={{ fontSize: 12, padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                    background: plot.color || ['#2962ff', '#089981', '#f23645', '#ff9800'][idx % 4],
                  }} />
                  {plot.title || `Plot ${idx + 1}`}
                  <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                    (linewidth: {plot.linewidth || 1})
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Hlines info */}
          {parsedInfo.hlines?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>HORIZONTAL LINES</div>
              {parsedInfo.hlines.map((hl, idx) => (
                <div key={idx} style={{ fontSize: 12, padding: '2px 0' }}>
                  {hl.title || `Line ${idx + 1}`} @ {hl.price}
                </div>
              ))}
            </div>
          )}

          {/* Alert conditions */}
          {parsedInfo.alerts?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>ALERT CONDITIONS</div>
              {parsedInfo.alerts.map((alert, idx) => (
                <div key={idx} style={{ fontSize: 12, padding: '2px 0' }}>
                  🔔 {alert.title || `Alert ${idx + 1}`}
                  {alert.message && <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}> — {alert.message}</span>}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn-primary" onClick={handleExecute} disabled={isExecuting} style={{ flex: 1 }}>
              {isExecuting ? 'Computing...' : 'Display on Chart'}
            </button>
          </div>

          {/* Last values */}
          {execResult && Object.keys(lastValues).length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>CURRENT VALUES</div>
              {Object.entries(lastValues).map(([name, val]) => (
                <div key={name} style={{ fontSize: 12, padding: '2px 0' }}>
                  {name}: <strong>{typeof val === 'number' ? val.toFixed(2) : String(val)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedTab === 'active' && activePineScripts?.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>
            ACTIVE PINE INDICATORS
          </div>
          {activePineScripts.map(ps => (
            <div key={ps.id} className="alert-card">
              <div className="alert-header">
                <strong style={{ fontSize: 13 }}>{ps.name}</strong>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className="btn-secondary"
                    style={{ padding: '1px 6px', fontSize: 10 }}
                    onClick={() => {
                      setCode(ps.code);
                      setName(ps.name);
                      setUserParams(ps.params);
                      setSelectedTab('upload');
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-danger"
                    style={{ padding: '1px 6px', fontSize: 10 }}
                    onClick={() => onDisplayOnChart?.(null, ps.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {ps.overlay ? 'Overlay' : 'Separate pane'} &middot; {Object.keys(ps.result?.plots || {}).length} plot(s)
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Get the latest value of each plot from execution result
function getLastValues(execResult) {
  const result = {};
  if (!execResult) return result;
  for (const [name, plot] of Object.entries(execResult.plots || {})) {
    const values = plot.values;
    if (values && values.length > 0) {
      result[name] = values[values.length - 1];
    }
  }
  for (const hl of execResult.hlines || []) {
    result[hl.title || 'hline'] = hl.price;
  }
  return result;
}
