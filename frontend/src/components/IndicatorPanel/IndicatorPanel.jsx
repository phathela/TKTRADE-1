import React, { useState, useEffect } from 'react';
import { fetchBuiltinIndicators } from '../../services/api';

export default function IndicatorPanel({ activeIndicators, onAdd, onRemove, onUpdate }) {
  const [indicators, setIndicators] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedIndicator, setSelectedIndicator] = useState(null);
  const [showSettings, setShowSettings] = useState(null);

  useEffect(() => {
    fetchBuiltinIndicators().then(setIndicators).catch(console.error);
  }, []);

  const filtered = indicators.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <input
        className="indicator-search"
        placeholder="Search indicators..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>
          ACTIVE INDICATORS ({activeIndicators.length})
        </div>
        {activeIndicators.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '4px 0' }}>No indicators added</div>
        ) : (
          activeIndicators.map(ind => (
            <div key={ind.instanceId} className="indicator-item">
              <div>
                <div className="indicator-name">{ind.name}</div>
                <div className="indicator-category">
                  {Object.entries(ind.params || ind.defaultParams || {}).map(([k, v]) => `${k}: ${v}`).join(', ')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className="btn-secondary"
                  style={{ padding: '2px 6px', fontSize: 11 }}
                  onClick={() => setShowSettings(showSettings === ind.instanceId ? null : ind.instanceId)}
                >
                  ⚙
                </button>
                <button
                  className="btn-danger"
                  style={{ padding: '2px 6px', fontSize: 11 }}
                  onClick={() => onRemove(ind.instanceId)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Settings panel for selected indicator */}
      {showSettings !== null && (() => {
        const ind = activeIndicators.find(i => i.instanceId === showSettings);
        if (!ind) return null;
        const params = ind.params || ind.defaultParams || {};
        return (
          <div style={{
            background: 'var(--bg-tertiary)', borderRadius: 6, padding: 12, marginBottom: 10,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{ind.name} Settings</div>
            {Object.entries(params).map(([key, val]) => (
              <div key={key} className="form-group" style={{ marginBottom: 8 }}>
                <label>{key}</label>
                <input
                  type={typeof val === 'number' ? 'number' : 'text'}
                  value={val}
                  onChange={(e) => {
                    const newVal = typeof val === 'number' ? parseFloat(e.target.value) : e.target.value;
                    onUpdate(ind.instanceId, { ...params, [key]: newVal });
                  }}
                />
              </div>
            ))}
          </div>
        );
      })()}

      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>
        INDICATOR LIBRARY
      </div>

      {filtered.map(ind => (
        <div
          key={ind.id}
          className="indicator-item"
          onClick={() => onAdd(ind)}
        >
          <div>
            <div className="indicator-name">{ind.name}</div>
            <div className="indicator-category">
              {ind.category} {ind.overlay ? '• Overlay' : '• Separate pane'}
            </div>
          </div>
          <button
            className="btn-primary"
            style={{ padding: '2px 10px', fontSize: 11 }}
            onClick={(e) => { e.stopPropagation(); onAdd(ind); }}
          >
            +
          </button>
        </div>
      ))}
    </div>
  );
}
