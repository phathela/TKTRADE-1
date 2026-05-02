// Technical Indicator Calculation Engine
// All functions accept OHLC arrays and return computed values

function getSource(ohlc, source = 'close') {
  return ohlc.map(c => {
    if (source === 'hl2') return (c.high + c.low) / 2;
    if (source === 'hlc3') return (c.high + c.low + c.close) / 3;
    if (source === 'ohlc4') return (c.open + c.high + c.low + c.close) / 4;
    if (source === 'hlcc4') return (c.high + c.low + c.close + c.close) / 4;
    return c.close;
  });
}

// Simple Moving Average
function SMA(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result.push(sum / period);
  }
  return result;
}

// Exponential Moving Average
function EMA(data, period) {
  const result = [];
  const k = 2 / (period + 1);
  let ema = data[0];
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { ema = data[i]; } else { ema = data[i] * k + ema * (1 - k); }
    result.push(ema);
  }
  return result;
}

// RSI
function RSI(data, period = 14) {
  const result = [];
  const gains = [], losses = [];
  for (let i = 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    gains.push(Math.max(diff, 0));
    losses.push(Math.max(-diff, 0));
  }
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push(null);
      if (i < period - 1) continue;
      let gSum = 0, lSum = 0;
      for (let j = 0; j < period; j++) { gSum += gains[j]; lSum += losses[j]; }
      avgGain = gSum / period;
      avgLoss = lSum / period;
    } else {
      avgGain = (avgGain * (period - 1) + gains[i - 1]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period;
    }
    if (avgLoss === 0) { result.push(100); continue; }
    const rs = avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

// MACD
function MACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEMA = EMA(data, fastPeriod);
  const slowEMA = EMA(data, slowPeriod);
  const macdLine = fastEMA.map((v, i) => v !== null && slowEMA[i] !== null ? v - slowEMA[i] : null);
  // Fill nulls at beginning for signal line
  const validMacd = macdLine.map(v => v ?? 0);
  const signalLine = EMA(validMacd, signalPeriod);
  const histogram = macdLine.map((v, i) => v !== null && signalLine[i] !== null ? v - signalLine[i] : null);
  return { macdLine, signalLine, histogram };
}

// Bollinger Bands
function Bollinger(data, period = 20, stdDev = 2) {
  const middle = SMA(data, period);
  const upper = [], lower = [];
  for (let i = 0; i < data.length; i++) {
    if (middle[i] === null) { upper.push(null); lower.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += Math.pow(data[j] - middle[i], 2);
    const std = Math.sqrt(sum / period);
    upper.push(middle[i] + stdDev * std);
    lower.push(middle[i] - stdDev * std);
  }
  return { upper, middle, lower };
}

// Stochastic
function Stochastic(ohlc, kPeriod = 14, dPeriod = 3) {
  const k = [];
  for (let i = 0; i < ohlc.length; i++) {
    if (i < kPeriod - 1) { k.push(null); continue; }
    let high = -Infinity, low = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      high = Math.max(high, ohlc[j].high);
      low = Math.min(low, ohlc[j].low);
    }
    const val = ((ohlc[i].close - low) / (high - low)) * 100;
    k.push(val);
  }
  const validK = k.map(v => v ?? 0);
  const d = SMA(validK, dPeriod);
  return { k, d };
}

// ATR
function ATR(ohlc, period = 14) {
  const tr = [0];
  for (let i = 1; i < ohlc.length; i++) {
    const hl = ohlc[i].high - ohlc[i].low;
    const hc = Math.abs(ohlc[i].high - ohlc[i - 1].close);
    const lc = Math.abs(ohlc[i].low - ohlc[i - 1].close);
    tr.push(Math.max(hl, hc, lc));
  }
  const atr = [];
  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    if (i < period) { sum += tr[i]; atr.push(null); continue; }
    if (i === period) { sum += tr[i]; atr.push(sum / period); continue; }
    const prev = atr[i - 1];
    atr.push((prev * (period - 1) + tr[i]) / period);
  }
  return atr;
}

// Ichimoku Cloud
function Ichimoku(ohlc) {
  const len = ohlc.length;
  const tenkanSen = [], kijunSen = [], senkouA = [], senkouB = [], chikouSpan = [];

  for (let i = 0; i < len; i++) {
    // Tenkan-sen (9)
    if (i < 8) { tenkanSen.push(null); } else {
      let h = -Infinity, l = Infinity;
      for (let j = i - 8; j <= i; j++) { h = Math.max(h, ohlc[j].high); l = Math.min(l, ohlc[j].low); }
      tenkanSen.push((h + l) / 2);
    }
    // Kijun-sen (26)
    if (i < 25) { kijunSen.push(null); } else {
      let h = -Infinity, l = Infinity;
      for (let j = i - 25; j <= i; j++) { h = Math.max(h, ohlc[j].high); l = Math.min(l, ohlc[j].low); }
      kijunSen.push((h + l) / 2);
    }
    // Chikou Span (lagged -26)
    chikouSpan.push(i < len - 26 ? ohlc[i + 26].close : ohlc[len - 1].close);
    // Senkou A (shifted forward 26)
    if (tenkanSen[i] !== null && kijunSen[i] !== null) {
      senkouA.push((tenkanSen[i] + kijunSen[i]) / 2);
    } else { senkouA.push(null); }
    // Senkou B (52, shifted forward 26)
    if (i < 51) { senkouB.push(null); } else {
      let h = -Infinity, l = Infinity;
      for (let j = i - 51; j <= i; j++) { h = Math.max(h, ohlc[j].high); l = Math.min(l, ohlc[j].low); }
      senkouB.push((h + l) / 2);
    }
  }
  return { tenkanSen, kijunSen, senkouA, senkouB, chikouSpan };
}

// Volume Profile (simple fixed range)
function VolumeProfile(ohlc, numBins = 12) {
  if (ohlc.length === 0) return { valueArea: 70, poc: null, bins: [] };
  const high = Math.max(...ohlc.map(c => c.high));
  const low = Math.min(...ohlc.map(c => c.low));
  const binSize = (high - low) / numBins;
  const bins = Array(numBins).fill(0);
  ohlc.forEach(c => {
    const binIdx = Math.min(Math.floor((c.close - low) / binSize), numBins - 1);
    bins[binIdx] += c.volume || 0;
  });
  const maxVol = Math.max(...bins);
  const pocIdx = bins.indexOf(maxVol);
  const totalVol = bins.reduce((a, b) => a + b, 0);
  return { valueArea: Math.round((maxVol / totalVol) * 100), poc: low + (pocIdx + 0.5) * binSize, bins, low, high };
}

// Helper to convert OHLC arrays to object arrays
function toOHLC(rows) {
  return rows.map(r => ({
    time: r.open_time,
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
  }));
}

// Compute indicator by name
function computeIndicator(ohlc, name, params = {}) {
  const close = getSource(ohlc, params.source || 'close');
  switch (name.toUpperCase()) {
    case 'SMA':
      return { values: [{ name: `SMA ${params.period || 20}`, data: SMA(close, params.period || 20) }], overlay: true };
    case 'EMA':
      return { values: [{ name: `EMA ${params.period || 9}`, data: EMA(close, params.period || 9) }], overlay: true };
    case 'RSI': {
      const rsi = RSI(close, params.period || 14);
      return { values: [{ name: 'RSI', data: rsi }], overlay: false, min: 0, max: 100 };
    }
    case 'MACD': {
      const m = MACD(close, params.fastPeriod || 12, params.slowPeriod || 26, params.signalPeriod || 9);
      return {
        values: [
          { name: 'MACD', data: m.macdLine },
          { name: 'Signal', data: m.signalLine },
          { name: 'Histogram', data: m.histogram, type: 'histogram' },
        ],
        overlay: false,
      };
    }
    case 'BOLLINGER': {
      const b = Bollinger(close, params.period || 20, params.stdDev || 2);
      return {
        values: [
          { name: 'Upper Band', data: b.upper },
          { name: 'Middle Band', data: b.middle },
          { name: 'Lower Band', data: b.lower },
        ],
        overlay: true,
      };
    }
    case 'STOCHASTIC': {
      const s = Stochastic(ohlc, params.kPeriod || 14, params.dPeriod || 3);
      return { values: [{ name: '%K', data: s.k }, { name: '%D', data: s.d }], overlay: false, min: 0, max: 100 };
    }
    case 'ATR': {
      const atr = ATR(ohlc, params.period || 14);
      return { values: [{ name: 'ATR', data: atr }], overlay: false };
    }
    case 'ICHIMOKU': {
      const ic = Ichimoku(ohlc);
      return {
        values: [
          { name: 'Tenkan Sen', data: ic.tenkanSen },
          { name: 'Kijun Sen', data: ic.kijunSen },
          { name: 'Senkou A', data: ic.senkouA },
          { name: 'Senkou B', data: ic.senkouB },
          { name: 'Chikou Span', data: ic.chikouSpan },
        ],
        overlay: true,
      };
    }
    case 'VOLUME_PROFILE': {
      const vp = VolumeProfile(ohlc, params.numBins || 12);
      return { values: [{ name: 'Volume Profile', data: vp, type: 'profile' }], overlay: true };
    }
    default:
      throw new Error(`Unknown indicator: ${name}`);
  }
}

// Built-in indicators metadata
const BUILTIN_INDICATORS = [
  { id: 'SMA', name: 'Simple Moving Average', category: 'Trend', defaultParams: { period: 20, source: 'close' }, overlay: true },
  { id: 'EMA', name: 'Exponential Moving Average', category: 'Trend', defaultParams: { period: 9, source: 'close' }, overlay: true },
  { id: 'RSI', name: 'Relative Strength Index', category: 'Momentum', defaultParams: { period: 14, source: 'close' }, overlay: false },
  { id: 'MACD', name: 'MACD', category: 'Momentum', defaultParams: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, source: 'close' }, overlay: false },
  { id: 'BOLLINGER', name: 'Bollinger Bands', category: 'Volatility', defaultParams: { period: 20, stdDev: 2, source: 'close' }, overlay: true },
  { id: 'STOCHASTIC', name: 'Stochastic', category: 'Momentum', defaultParams: { kPeriod: 14, dPeriod: 3 }, overlay: false },
  { id: 'ATR', name: 'Average True Range', category: 'Volatility', defaultParams: { period: 14 }, overlay: false },
  { id: 'ICHIMOKU', name: 'Ichimoku Cloud', category: 'Trend', defaultParams: {}, overlay: true },
  { id: 'VOLUME_PROFILE', name: 'Volume Profile', category: 'Volume', defaultParams: { numBins: 12 }, overlay: true },
];

module.exports = {
  SMA, EMA, RSI, MACD, Bollinger, Stochastic, ATR, Ichimoku, VolumeProfile,
  toOHLC, computeIndicator, BUILTIN_INDICATORS, getSource,
};
