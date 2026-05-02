import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';
import { fetchCandles, calculateIndicator } from '../../services/api.js';
import { subscribeTicker } from '../../services/socket.js';

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w', '1M'];
const DRAWING_TOOLS = ['trend', 'horizontal', 'vertical', 'ray', 'fib'];

export default function TradingChart({
  symbol, interval, theme, activeIndicators, drawingMode,
  onDrawingMode, onReady, onRemoveIndicator, onUpdateIndicator,
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const indicatorSeriesRef = useRef({});
  const paneRefs = useRef({});
  const [chartReady, setChartReady] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [priceChange, setPriceChange] = useState(null);
  const [isPositive, setIsPositive] = useState(true);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: theme === 'dark' ? '#d1d4dc' : '#131722',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: theme === 'dark' ? '#2a2e39' : '#e8eaed' },
        horzLines: { color: theme === 'dark' ? '#2a2e39' : '#e8eaed' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { width: 1, color: '#758696', style: LineStyle.Dashed },
        horzLine: { width: 1, color: '#758696', style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: theme === 'dark' ? '#2a2e39' : '#e8eaed',
        scaleMargins: { top: 0.05, bottom: 0.1 },
      },
      timeScale: {
        borderColor: theme === 'dark' ? '#2a2e39' : '#e8eaed',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: true },
      handleScale: { axisPressedMouse: { time: true, price: true } },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#089981',
      downColor: '#f23645',
      borderUpColor: '#089981',
      borderDownColor: '#f23645',
      wickUpColor: '#089981',
      wickDownColor: '#f23645',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // Handle resize
    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    });
    observer.observe(containerRef.current);

    setChartReady(true);
    onReady?.();

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [theme]);

  // Theme changes
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({
      layout: {
        textColor: theme === 'dark' ? '#d1d4dc' : '#131722',
      },
      grid: {
        vertLines: { color: theme === 'dark' ? '#2a2e39' : '#e8eaed' },
        horzLines: { color: theme === 'dark' ? '#2a2e39' : '#e8eaed' },
      },
    });
  }, [theme]);

  // Fetch candles
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    fetchCandles(symbol, interval).then(data => {
      if (data?.data) {
        candleSeriesRef.current.setData(data.data);
        if (data.data.length > 0) {
          const last = data.data[data.data.length - 1];
          setCurrentPrice(last.close);
        }
      }
    }).catch(console.error);

    // Fit content
    const timer = setTimeout(() => {
      if (chartRef.current) chartRef.current.timeScale().fitContent();
    }, 100);
    return () => clearTimeout(timer);
  }, [symbol, interval]);

  // Real-time ticker updates
  useEffect(() => {
    const unsub = subscribeTicker(symbol, (ticker) => {
      setCurrentPrice(ticker.price);
      setPriceChange(ticker.change);
      setIsPositive(ticker.change >= 0);

      // Update last candle in real-time
      if (candleSeriesRef.current && ticker.price) {
        const now = Math.floor(Date.now() / 1000);
        candleSeriesRef.current.update({
          time: Math.floor(now / 60) * 60,
          close: ticker.price,
        });
      }
    });
    return unsub;
  }, [symbol]);

  // Update indicators when they change
  useEffect(() => {
    // Clear old indicator lines
    Object.values(indicatorSeriesRef.current).forEach(s => {
      try { chartRef.current?.removeSeries(s); } catch {}
    });
    indicatorSeriesRef.current = {};

    if (!chartRef.current || activeIndicators.length === 0) return;

    activeIndicators.forEach(indicator => {
      calculateIndicator({
        symbol,
        interval,
        indicator: indicator.id,
        params: indicator.params || indicator.defaultParams,
      }).then(result => {
        try {
          if (!chartRef.current) return;

          if (result.overlay) {
            // Add to main chart
            result.values.forEach(v => {
              const lineSeries = chartRef.current.addLineSeries({
                color: getIndicatorColor(indicator.id, v.name),
                lineWidth: 1,
                lastValueVisible: true,
                priceLineVisible: false,
              });
              const data = v.data
                .map((val, i) => ({ time: val?.time || i, value: val }))
                .filter(d => d.value !== null && d.time !== undefined);
              // Use index-based time for indicators
              const formattedData = v.data
                .map((val, idx) => val !== null ? { time: idx, value: val } : null)
                .filter(d => d !== null && d.value !== null);
              if (formattedData.length > 0) {
                lineSeries.setData(formattedData);
              }
              const key = `${indicator.instanceId}-${v.name}`;
              indicatorSeriesRef.current[key] = lineSeries;
            });
          } else {
            // Add to separate pane
            result.values.forEach(v => {
              const paneId = `pane-${indicator.instanceId}`;
              // For simplicity, add as line series in main chart
              const lineSeries = chartRef.current.addLineSeries({
                color: getIndicatorColor(indicator.id, v.name),
                lineWidth: 1,
                lastValueVisible: true,
                priceLineVisible: false,
                priceFormat: { type: 'custom', formatter: p => p?.toFixed(2) ?? '-' },
              });
              const formattedData = v.data
                .map((val, idx) => val !== null ? { time: idx, value: val } : null)
                .filter(d => d !== null);
              if (formattedData.length > 0) {
                lineSeries.setData(formattedData);
              }
              const key = `${indicator.instanceId}-${v.name}`;
              indicatorSeriesRef.current[key] = lineSeries;
            });
          }
        } catch (e) {
          console.error('Indicator render error:', e);
        }
      }).catch(console.error);
    });
  }, [activeIndicators, symbol, interval]);

  // Clean up indicators on unmount
  useEffect(() => {
    return () => {
      Object.values(indicatorSeriesRef.current).forEach(s => {
        try { chartRef.current?.removeSeries(s); } catch {}
      });
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Price display */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '6px 14px', background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)', flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: 22, color: isPositive ? 'var(--green)' : 'var(--red)' }}>
          {currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '---'}
        </span>
        {priceChange !== null && (
          <span style={{ fontSize: 14, color: isPositive ? 'var(--green)' : 'var(--red)' }}>
            {isPositive ? '+' : ''}{priceChange?.toFixed(2)}%
          </span>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{symbol}</span>
      </div>

      {/* Timeframe + Drawing toolbar */}
      <div className="chart-toolbar">
        <div style={{ display: 'flex', gap: 2 }}>
          {DRAWING_TOOLS.map(tool => (
            <button
              key={tool}
              className={drawingMode === tool ? 'active' : ''}
              onClick={() => onDrawingMode?.(tool)}
              title={tool}
            >
              {tool === 'trend' ? '↗' : tool === 'horizontal' ? '—' : tool === 'vertical' ? '|' : tool === 'ray' ? '→' : 'Fib'}
            </button>
          ))}
        </div>

        <div className="timeframe-bar">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              className={`timeframe-btn ${interval === tf ? 'active' : ''}`}
              onClick={() => onDrawingMode?.('timeframe', tf)}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart canvas */}
      <div ref={containerRef} className="chart-container" />
    </div>
  );
}

const COLORS = ['#2962ff', '#089981', '#f23645', '#ff9800', '#9c27b0', '#00bcd4', '#ff5722', '#607d8b'];
let colorIdx = 0;
function getIndicatorColor(indicatorId, name) {
  const hash = (indicatorId + name).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}
