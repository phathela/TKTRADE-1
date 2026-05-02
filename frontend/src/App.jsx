import React, { useState, useCallback } from 'react';
import TradingChart from './components/Chart/TradingChart';
import IndicatorPanel from './components/IndicatorPanel/IndicatorPanel';
import AlertDialog from './components/AlertDialog/AlertDialog';
import BacktestPanel from './components/BacktestPanel/BacktestPanel';
import StrategyUploader from './components/StrategyUploader/StrategyUploader';

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w', '1M'];
const DEFAULT_SYMBOL = 'BTCUSDT';

export default function App() {
  const [theme, setTheme] = useState('dark');
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [interval, setInterval] = useState('1h');
  const [sidePanel, setSidePanel] = useState(null); // null | 'indicators' | 'alerts' | 'backtest'
  const [activeIndicators, setActiveIndicators] = useState([]);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [drawingMode, setDrawingMode] = useState(null);
  const [chartReady, setChartReady] = useState(false);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const togglePanel = (panel) => {
    setSidePanel(prev => prev === panel ? null : panel);
  };

  const toggleDrawingMode = (mode) => {
    setDrawingMode(prev => prev === mode ? null : mode);
  };

  const handleAddIndicator = (indicator) => {
    const exists = activeIndicators.find(i => i.id === indicator.id);
    if (!exists) {
      setActiveIndicators(prev => [...prev, { ...indicator, instanceId: Date.now() }]);
    }
  };

  const handleRemoveIndicator = (instanceId) => {
    setActiveIndicators(prev => prev.filter(i => i.instanceId !== instanceId));
  };

  const handleUpdateIndicator = (instanceId, params) => {
    setActiveIndicators(prev => prev.map(i =>
      i.instanceId === instanceId ? { ...i, params: { ...i.defaultParams, ...params } } : i
    ));
  };

  const handleChartReady = useCallback(() => {
    setChartReady(true);
  }, []);

  return (
    <div className="app-layout" data-theme={theme}>
      {/* Top Bar */}
      <header className="top-bar">
        <div className="logo">TKTRADE 1</div>

        <div className="controls">
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            style={{ width: 110, textTransform: 'uppercase' }}
            placeholder="BTCUSDT"
          />

          <select value={interval} onChange={(e) => setInterval(e.target.value)}>
            {TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}
          </select>

          <div className="tabs">
            <button
              className={`tab-btn ${sidePanel === 'indicators' ? 'active' : ''}`}
              onClick={() => togglePanel('indicators')}
            >
              Indicators
            </button>
            <button
              className={`tab-btn ${sidePanel === 'alerts' ? 'active' : ''}`}
              onClick={() => togglePanel('alerts')}
            >
              Alerts
            </button>
            <button
              className={`tab-btn ${sidePanel === 'backtest' ? 'active' : ''}`}
              onClick={() => togglePanel('backtest')}
            >
              Backtest
            </button>
          </div>

          <button className="btn-primary" onClick={() => setAlertDialogOpen(true)} style={{ fontSize: 12 }}>
            + Alert
          </button>

          <button className="btn-secondary" onClick={toggleTheme} style={{ fontSize: 12 }}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="main-content">
        <div className="chart-area">
          <TradingChart
            symbol={symbol}
            interval={interval}
            theme={theme}
            activeIndicators={activeIndicators}
            drawingMode={drawingMode}
            onDrawingMode={toggleDrawingMode}
            onReady={handleChartReady}
            onRemoveIndicator={handleRemoveIndicator}
            onUpdateIndicator={handleUpdateIndicator}
          />
        </div>

        {/* Side Panel */}
        <div className={`side-panel ${sidePanel ? 'open' : ''}`}>
          {sidePanel === 'indicators' && (
            <>
              <div className="side-panel-header">
                <span>Indicators</span>
                <button className="btn-secondary" onClick={() => setSidePanel(null)} style={{ padding: '2px 8px', fontSize: 14 }}>&times;</button>
              </div>
              <div className="side-panel-content">
                <IndicatorPanel
                  activeIndicators={activeIndicators}
                  onAdd={handleAddIndicator}
                  onRemove={handleRemoveIndicator}
                  onUpdate={handleUpdateIndicator}
                />
              </div>
            </>
          )}

          {sidePanel === 'alerts' && (
            <>
              <div className="side-panel-header">
                <span>Alerts</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-primary" onClick={() => setAlertDialogOpen(true)} style={{ padding: '2px 10px', fontSize: 12 }}>New</button>
                  <button className="btn-secondary" onClick={() => setSidePanel(null)} style={{ padding: '2px 8px', fontSize: 14 }}>&times;</button>
                </div>
              </div>
              <div className="side-panel-content">
                <AlertList />
              </div>
            </>
          )}

          {sidePanel === 'backtest' && (
            <>
              <div className="side-panel-header">
                <span>Backtest</span>
                <button className="btn-secondary" onClick={() => setSidePanel(null)} style={{ padding: '2px 8px', fontSize: 14 }}>&times;</button>
              </div>
              <div className="side-panel-content">
                <BacktestPanel symbol={symbol} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Alert Dialog */}
      {alertDialogOpen && (
        <AlertDialog
          symbol={symbol}
          currentPrice="..."
          onClose={() => setAlertDialogOpen(false)}
          onCreated={() => {
            setAlertDialogOpen(false);
            if (sidePanel === 'alerts') setSidePanel('alerts');
          }}
        />
      )}
    </div>
  );
}

// Simple alert list component
function AlertList() {
  const [alerts, setAlerts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    import('./services/api').then(({ fetchAlerts }) => {
      fetchAlerts().then(setAlerts).catch(console.error).finally(() => setLoading(false));
    });
  }, []);

  const handleDelete = async (id) => {
    const { deleteAlert } = await import('./services/api');
    await deleteAlert(id);
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>Loading...</div>;

  if (alerts.length === 0) return <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>No alerts yet</div>;

  return (
    <div>
      {alerts.map(alert => (
        <div key={alert.id} className="alert-card">
          <div className="alert-header">
            <strong style={{ fontSize: 13 }}>{alert.name}</strong>
            <span className={`alert-status ${alert.status}`}>{alert.status}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
            {alert.symbol} | {alert.condition_type}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {alert.webhook_url && <span>Webhook: {alert.webhook_url.substring(0, 30)}...</span>}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn-danger" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => handleDelete(alert.id)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
