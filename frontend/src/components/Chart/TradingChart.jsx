import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';
import { fetchCandles, calculateIndicator } from '../../services/api.js';
import { subscribeTicker } from '../../services/socket.js';

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w', '1M'];
const DRAWING_TOOLS = ['trend', 'horizontal', 'vertical', 'ray', 'fib'];
const COLORS = ['#2962ff', '#089981', '#f23645', '#ff9800', '#9c27b0', '#00bcd4', '#ff5722', '#607d8b'];

export default function TradingChart({
  symbol, interval, theme, activeIndicators, activePineScripts = [],
  drawingMode, onDrawingMode, onReady,
  onRemoveIndicator, onUpdateIndicator,
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const indicatorSeriesRef = useRef({});
  const pineSeriesRef = useRef({});
  const candleDataRef = useRef([]);
  const [chartVersion, setChartVersion] = useState(0);
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

    console.debug('[TradingChart] Chart initialized', {
      theme,
      containerSize: {
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      },
    });

    // Re-apply cached data if available (e.g., after theme-change recreation)
    if (candleDataRef.current.length > 0) {
      console.debug('[TradingChart] Re-applying cached candle data after chart recreation', {
        cachedCandles: candleDataRef.current.length,
        firstCandle: candleDataRef.current[0],
        lastCandle: candleDataRef.current[candleDataRef.current.length - 1],
      });
      candleSeries.setData(candleDataRef.current);
      setTimeout(() => chart.timeScale().fitContent(), 50);
    }

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    });
    observer.observe(containerRef.current);

    setChartVersion(v => v + 1);
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
      layout: { textColor: theme === 'dark' ? '#d1d4dc' : '#131722' },
      grid: {
        vertLines: { color: theme === 'dark' ? '#2a2e39' : '#e8eaed' },
        horzLines: { color: theme === 'dark' ? '#2a2e39' : '#e8eaed' },
      },
    });
  }, [theme]);

  // Fetch candles
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    console.debug('[TradingChart] Fetching candles', { symbol, interval });

    fetchCandles(symbol, interval).then(data => {
      console.debug('[TradingChart] fetchCandles raw response', data);

      if (!data) {
        console.error('[TradingChart] fetchCandles returned null/undefined');
        return;
      }

      if (!data.data) {
        console.error('[TradingChart] Response missing .data array — got keys:', Object.keys(data));
        return;
      }

      if (!Array.isArray(data.data)) {
        console.error('[TradingChart] data.data is not an array — type:', typeof data.data, 'value:', data.data);
        return;
      }

      if (data.data.length === 0) {
        console.warn('[TradingChart] data.data is an empty array — no candles to render');
        return;
      }

      const firstCandle = data.data[0];
      const lastCandle = data.data[data.data.length - 1];
      const expectedFields = ['time', 'open', 'high', 'low', 'close'];
      const missingFields = expectedFields.filter(f => !(f in firstCandle));

      console.debug('[TradingChart] Candle data summary', {
        count: data.data.length,
        firstCandle,
        lastCandle,
        missingFields: missingFields.length > 0 ? missingFields : 'none',
        actualFields: Object.keys(firstCandle),
      });

      if (missingFields.length > 0) {
        console.error('[TradingChart] Candles are missing required fields:', missingFields,
          '— lightweight-charts requires { time, open, high, low, close }');
      }

      try {
        console.debug('[TradingChart] Calling candleSeries.setData() with', data.data.length, 'candles');
        candleSeriesRef.current.setData(data.data);
        candleDataRef.current = data.data;
        console.debug('[TradingChart] candleSeries.setData() succeeded');
      } catch (e) {
        console.error('[TradingChart] candleSeries.setData() threw an error:', e);
        return;
      }

      if (data.data.length > 0) {
        const last = data.data[data.data.length - 1];
        setCurrentPrice(last.close);
      }
    }).catch(err => {
      console.error('[TradingChart] fetchCandles network/API error:', err);
    });

    const timer = setTimeout(() => {
      if (chartRef.current) chartRef.current.timeScale().fitContent();
    }, 100);
    return () => clearTimeout(timer);
  }, [symbol, interval, chartVersion]);

  // Real-time ticker updates
  useEffect(() => {
    const unsub = subscribeTicker(symbol, (ticker) => {
      setCurrentPrice(ticker.price);
      setPriceChange(ticker.change);
      setIsPositive(ticker.change >= 0);

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

  // Render built-in indicators
  useEffect(() => {
    Object.values(indicatorSeriesRef.current).forEach(s => {
      try { chartRef.current?.removeSeries(s); } catch {}
    });
    indicatorSeriesRef.current = {};

    if (!chartRef.current || activeIndicators.length === 0) return;

    const ohlcData = candleDataRef.current;

    activeIndicators.forEach(indicator => {
      calculateIndicator({
        symbol, interval,
        indicator: indicator.id,
        params: indicator.params || indicator.defaultParams,
      }).then(result => {
        try {
          if (!chartRef.current) return;

          result.values.forEach(v => {
            const lineSeries = chartRef.current.addLineSeries({
              color: getIndicatorColor(indicator.id, v.name),
              lineWidth: 1,
              lastValueVisible: true,
              priceLineVisible: false,
            });

            // Map to actual timestamps if we have candle data
            const formattedData = v.data
              .map((val, idx) => {
                if (val === null) return null;
                const time = ohlcData[idx]?.time || idx;
                return { time, value: val };
              })
              .filter(d => d !== null);
            if (formattedData.length > 0) {
              lineSeries.setData(formattedData);
            }
            const key = `${indicator.instanceId}-${v.name}`;
            indicatorSeriesRef.current[key] = lineSeries;
          });
        } catch (e) {
          console.error('Indicator render error:', e);
        }
      }).catch(console.error);
    });
  }, [activeIndicators, symbol, interval]);

  // Render Pine Script indicators
  useEffect(() => {
    // Clear old Pine Script series
    Object.values(pineSeriesRef.current).forEach(s => {
      try { chartRef.current?.removeSeries(s); } catch {}
    });
    pineSeriesRef.current = {};

    if (!chartRef.current || activePineScripts.length === 0 || candleDataRef.current.length === 0) return;

    const ohlcData = candleDataRef.current;

    activePineScripts.forEach(pineScript => {
      if (!pineScript.result?.plots) return;
      const plots = pineScript.result.plots;

      Object.entries(plots).forEach(([plotName, plotData]) => {
        const values = plotData.values;
        if (!values || !Array.isArray(values)) return;

        try {
          const lineSeries = chartRef.current.addLineSeries({
            color: plotData.color || getPineColor(plotName, pineScript.id),
            lineWidth: plotData.linewidth || 1,
            lastValueVisible: true,
            priceLineVisible: false,
          });

          // Map values to candle timestamps
          const formattedData = [];
          const len = Math.min(values.length, ohlcData.length);
          for (let i = 0; i < len; i++) {
            const val = values[i];
            if (val !== null && val !== undefined && isFinite(val)) {
              formattedData.push({
                time: ohlcData[i]?.time || i,
                value: val,
              });
            }
          }

          if (formattedData.length > 0) {
            lineSeries.setData(formattedData);
          }

          const key = `pine-${pineScript.id}-${plotName}`;
          pineSeriesRef.current[key] = lineSeries;
        } catch (e) {
          console.error('Pine Script render error:', plotName, e);
        }
      });
    });

    // Fit content after a small delay to let series settle
    setTimeout(() => {
      if (chartRef.current) chartRef.current.timeScale().fitContent();
    }, 50);
  }, [activePineScripts, candleDataRef.current.length]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      Object.values(indicatorSeriesRef.current).forEach(s => {
        try { chartRef.current?.removeSeries(s); } catch {}
      });
      Object.values(pineSeriesRef.current).forEach(s => {
        try { chartRef.current?.removeSeries(s); } catch {}
      });
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Price display + active Pine Script indicators */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '6px 14px', background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)', flexShrink: 0, flexWrap: 'wrap',
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

        {/* Show active Pine Script indicator names */}
        {activePineScripts.map(ps => (
          <span key={ps.id} style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 10,
            background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
          }}>
            {ps.name}
          </span>
        ))}
        {activeIndicators.map(ind => (
          <span key={ind.instanceId} style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 10,
            background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
          }}>
            {ind.name}
          </span>
        ))}
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
              onClick={() => {
                // Use a different mechanism to change timeframe since onDrawingMode was repurposed
                // The interval is changed via the top bar select, not here
              }}
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

function getIndicatorColor(indicatorId, name) {
  const hash = (indicatorId + name).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}

let pineColorIdx = 0;
function getPineColor(plotName, scriptId) {
  const hash = (scriptId + plotName).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}
