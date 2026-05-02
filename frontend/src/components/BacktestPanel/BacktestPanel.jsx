import React, { useState, useEffect, useRef } from 'react';
import { runBacktest, fetchBacktestTemplates, fetchBacktestHistory } from '../../services/api';

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'];

export default function BacktestPanel({ symbol }) {
  const [templates, setTemplates] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedStrategy, setSelectedStrategy] = useState('sma_crossover');
  const [config, setConfig] = useState({ fastPeriod: 10, slowPeriod: 30, initialCapital: 10000 });
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [interval, setInterval] = useState('1h');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('run');

  useEffect(() => {
    fetchBacktestTemplates().then(setTemplates).catch(console.error);
    fetchBacktestHistory().then(setHistory).catch(console.error);
  }, []);

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const res = await runBacktest({
        symbol,
        interval,
        startTime: Math.floor(new Date(startDate).getTime() / 1000),
        endTime: Math.floor(new Date(endDate).getTime() / 1000),
        strategyType: selectedStrategy,
        strategyConfig: config,
      });
      setResult(res);
      // Refresh history
      const hist = await fetchBacktestHistory();
      setHistory(hist);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setRunning(false);
    }
  };

  const handleStrategyChange = (id) => {
    setSelectedStrategy(id);
    const tmpl = templates.find(t => t.id === id);
    if (tmpl) setConfig(tmpl.defaultParams || {});
  };

  const exportCSV = () => {
    if (!result?.trades) return;
    const headers = ['Entry Time', 'Exit Time', 'Entry Price', 'Exit Price', 'Size', 'PnL', 'PnL %', 'Type'];
    const rows = result.trades.map(t => [
      new Date(t.entryTime * 1000).toISOString(),
      new Date(t.exitTime * 1000).toISOString(),
      t.entryPrice, t.exitPrice, t.size, t.pnl?.toFixed(2), t.pnlPercent?.toFixed(2), t.type,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `backtest-${symbol}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 12 }}>
        <button className={`tab-btn ${tab === 'run' ? 'active' : ''}`} onClick={() => setTab('run')}>Run</button>
        <button className={`tab-btn ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
      </div>

      {tab === 'run' && (
        <div>
          {/* Date Range */}
          <div className="form-row">
            <div className="form-group">
              <label>Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Interval</label>
              <select value={interval} onChange={e => setInterval(e.target.value)}>
                {TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Strategy</label>
              <select value={selectedStrategy} onChange={e => handleStrategyChange(e.target.value)}>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                <option value="custom">Custom Strategy</option>
              </select>
            </div>
          </div>

          {/* Strategy params */}
          <div style={{ background: 'var(--bg-tertiary)', borderRadius: 6, padding: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>STRATEGY PARAMETERS</div>
            {Object.entries(config).map(([key, val]) => (
              <div key={key} className="form-group" style={{ marginBottom: 6 }}>
                <label>{key}</label>
                <input
                  type="number"
                  value={val}
                  onChange={e => setConfig(prev => ({ ...prev, [key]: parseFloat(e.target.value) || e.target.value }))}
                />
              </div>
            ))}
          </div>

          <button className="btn-primary" onClick={handleRun} disabled={running} style={{ width: '100%' }}>
            {running ? 'Running Backtest...' : 'Run Backtest'}
          </button>

          {error && (
            <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8, padding: 8, background: 'rgba(242,54,69,0.1)', borderRadius: 4 }}>
              {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontSize: 13 }}>Results</strong>
                <button className="btn-secondary" onClick={exportCSV} style={{ padding: '2px 10px', fontSize: 11 }}>
                  Export CSV
                </button>
              </div>

              <div className="metric-row">
                <div className="metric">
                  <div className={`metric-value ${result.totalPnl >= 0 ? 'text-green' : 'text-red'}`}>
                    ${result.totalPnl?.toFixed(2)}
                  </div>
                  <div className="metric-label">Total PnL</div>
                </div>
                <div className="metric">
                  <div className={`metric-value ${result.totalPnlPercent >= 0 ? 'text-green' : 'text-red'}`}>
                    {result.totalPnlPercent?.toFixed(2)}%
                  </div>
                  <div className="metric-label">Return</div>
                </div>
                <div className="metric">
                  <div className="metric-value">{result.totalTrades}</div>
                  <div className="metric-label">Trades</div>
                </div>
                <div className="metric">
                  <div className="metric-value">{result.winRate?.toFixed(1)}%</div>
                  <div className="metric-label">Win Rate</div>
                </div>
              </div>

              <div className="metric-row">
                <div className="metric">
                  <div className="metric-value text-red">{result.maxDrawdown?.toFixed(2)}%</div>
                  <div className="metric-label">Max DD</div>
                </div>
                <div className="metric">
                  <div className="metric-value">{result.sharpeRatio?.toFixed(2)}</div>
                  <div className="metric-label">Sharpe</div>
                </div>
              </div>

              {/* Trades Table */}
              {result.trades && result.trades.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>TRADES</div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Entry</th>
                          <th>Exit</th>
                          <th>Entry $</th>
                          <th>Exit $</th>
                          <th>PnL</th>
                          <th>PnL%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.trades.slice(0, 50).map((t, i) => (
                          <tr key={i}>
                            <td>{new Date(t.entryTime * 1000).toLocaleDateString()}</td>
                            <td>{new Date(t.exitTime * 1000).toLocaleDateString()}</td>
                            <td>${t.entryPrice?.toFixed(2)}</td>
                            <td>${t.exitPrice?.toFixed(2)}</td>
                            <td className={t.pnl >= 0 ? 'text-green' : 'text-red'}>
                              ${t.pnl?.toFixed(2)}
                            </td>
                            <td className={t.pnlPercent >= 0 ? 'text-green' : 'text-red'}>
                              {t.pnlPercent?.toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {result.trades.length > 50 && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', padding: 4 }}>
                      Showing 50 of {result.trades.length} trades
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)', fontSize: 12 }}>
              No backtest history yet
            </div>
          ) : (
            history.map(h => (
              <div key={h.id} className="backtest-card">
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  {h.symbol} ({h.interval}) - {h.strategy_type}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  {new Date(Number(h.start_time) * 1000).toLocaleDateString()} → {new Date(Number(h.end_time) * 1000).toLocaleDateString()}
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                  <span>Trades: {h.total_trades}</span>
                  <span className={Number(h.total_pnl) >= 0 ? 'text-green' : 'text-red'}>
                    PnL: ${Number(h.total_pnl).toFixed(2)}
                  </span>
                  <span>Win: {Number(h.win_rate).toFixed(1)}%</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
