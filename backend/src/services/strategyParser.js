// Custom strategy parser - accepts simplified Pine Script-like syntax
// Supports: indicator variables, crossover/crossunder, comparison operators, basic conditions

class StrategyParser {
  parse(code) {
    // Clean and prepare code
    const lines = code.split('\n')
      .map(l => l.replace(/\/\/.*$/, '').trim()) // remove comments
      .filter(l => l.length > 0);

    const variables = {};
    const conditions = [];

    for (const line of lines) {
      // Variable assignment: name = expression
      const varMatch = line.match(/^(\w+)\s*=\s*(.+)/);
      if (varMatch) {
        variables[varMatch[1]] = varMatch[2];
        continue;
      }

      // Entry condition: strategy.entry(condition, "Long")
      const entryMatch = line.match(/strategy\.entry\(\s*(.+?)\s*,\s*"(Long|Short|Exit)"\s*\)/);
      if (entryMatch) {
        conditions.push({ type: 'entry', direction: entryMatch[2], condition: entryMatch[1] });
        continue;
      }

      // Close condition: strategy.close(condition)
      const closeMatch = line.match(/strategy\.close\(\s*(.+)\s*\)/);
      if (closeMatch) {
        conditions.push({ type: 'close', condition: closeMatch[1] });
      }
    }

    // Return executable strategy function
    return (ohlc) => {
      const ctx = this._createContext(ohlc);
      let buySignal = false;
      let sellSignal = false;

      for (const cond of conditions) {
        try {
          const result = this._evaluateCondition(cond.condition, ctx);
          if (cond.type === 'entry' && result) {
            if (cond.direction === 'Long') buySignal = true;
            else if (cond.direction === 'Short') sellSignal = true;
          }
          if (cond.type === 'close' && result) {
            sellSignal = true;
          }
        } catch (e) {
          // Skip invalid conditions
        }
      }

      if (buySignal) return 'buy';
      if (sellSignal) return 'sell';
      return null;
    };
  }

  _createContext(ohlc) {
    const close = ohlc.map(c => c.close);
    const high = ohlc.map(c => c.high);
    const low = ohlc.map(c => c.low);
    const volume = ohlc.map(c => c.volume || 0);
    const i = ohlc.length - 1;

    // Precompute common indicators
    const sma20 = this._sma(close, 20);
    const sma50 = this._sma(close, 50);
    const ema12 = this._ema(close, 12);
    const ema26 = this._ema(close, 26);
    const rsi14 = this._rsi(close, 14);

    return {
      close, high, low, volume, i,
      sma20, sma50, ema12, ema26, rsi14,
      crossover: (a, b) => {
        if (i < 1) return false;
        const curA = typeof a === 'function' ? a() : a[i];
        const curB = typeof b === 'function' ? b() : b[i];
        const prevA = typeof a === 'function' ? a() : (a[i - 1] ?? a);
        const prevB = typeof b === 'function' ? b() : (b[i - 1] ?? b);
        return prevA <= prevB && curA > curB;
      },
      crossunder: (a, b) => {
        if (i < 1) return false;
        const curA = typeof a === 'function' ? a() : a[i];
        const curB = typeof b === 'function' ? b() : b[i];
        const prevA = typeof a === 'function' ? a() : (a[i - 1] ?? a);
        const prevB = typeof b === 'function' ? b() : (b[i - 1] ?? b);
        return prevA >= prevB && curA < curB;
      },
    };
  }

  _evaluateCondition(expr, ctx) {
    // Replace variable names with their computed values
    let clean = expr
      .replace(/close/g, `(${ctx.close[ctx.i]})`)
      .replace(/high/g, `(${ctx.high[ctx.i]})`)
      .replace(/low/g, `(${ctx.low[ctx.i]})`)
      .replace(/volume/g, `(${ctx.volume[ctx.i]})`);

    // Handle crossover/crossunder
    const crossOverMatch = clean.match(/crossover\((\w+),\s*(\w+)\)/);
    if (crossOverMatch) {
      const a = ctx[crossOverMatch[1]];
      const b = ctx[crossOverMatch[2]];
      return ctx.crossover(
        () => a?.[ctx.i] ?? 0,
        () => b?.[ctx.i] ?? 0
      );
    }

    const crossUnderMatch = clean.match(/crossunder\((\w+),\s*(\w+)\)/);
    if (crossUnderMatch) {
      const a = ctx[crossUnderMatch[1]];
      const b = ctx[crossUnderMatch[2]];
      return ctx.crossunder(
        () => a?.[ctx.i] ?? 0,
        () => b?.[ctx.i] ?? 0
      );
    }

    // Replace sma/ema/rsi references
    clean = clean.replace(/sma\((\w+),\s*(\d+)\)/g, (_, arr, per) => {
      const data = ctx[arr];
      if (!data) return '0';
      const val = this._sma(data, parseInt(per));
      return `(${val[val.length - 1] ?? 0})`;
    });
    clean = clean.replace(/ema\((\w+),\s*(\d+)\)/g, (_, arr, per) => {
      const data = ctx[arr];
      if (!data) return '0';
      const val = this._ema(data, parseInt(per));
      return `(${val[val.length - 1] ?? 0})`;
    });

    // Replace named indicator references
    clean = clean.replace(/\bsma20\b/g, `(${ctx.sma20?.[ctx.i] ?? 0})`);
    clean = clean.replace(/\bsma50\b/g, `(${ctx.sma50?.[ctx.i] ?? 0})`);
    clean = clean.replace(/\bema12\b/g, `(${ctx.ema12?.[ctx.i] ?? 0})`);
    clean = clean.replace(/\bema26\b/g, `(${ctx.ema26?.[ctx.i] ?? 0})`);
    clean = clean.replace(/\brsi14\b/g, `(${ctx.rsi14?.[ctx.i] ?? 50})`);

    // Handle comparison operators (Pine uses <, >, =, !=)
    clean = clean.replace(/!=/g, '!==');
    clean = clean.replace(/=(?!=)/g, '===');

    try {
      return !!eval(clean);
    } catch {
      return false;
    }
  }

  _sma(data, period) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push(null); continue; }
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += data[j];
      result.push(sum / period);
    }
    return result;
  }

  _ema(data, period) {
    const result = [];
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 0; i < data.length; i++) {
      if (i === 0) ema = data[i];
      else ema = data[i] * k + ema * (1 - k);
      result.push(ema);
    }
    return result;
  }

  _rsi(data, period) {
    const result = [null];
    const gains = [], losses = [];
    for (let i = 1; i < data.length; i++) {
      const diff = data[i] - data[i - 1];
      gains.push(Math.max(diff, 0));
      losses.push(Math.max(-diff, 0));
    }
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i < data.length; i++) {
      if (i < period) { result.push(null); if (i < period - 1) continue; }
      if (i === period || avgGain === 0) {
        let gSum = 0, lSum = 0;
        for (let j = 0; j < period; j++) { gSum += gains[j]; lSum += losses[j]; }
        avgGain = gSum / period;
        avgLoss = lSum / period;
      } else {
        avgGain = (avgGain * (period - 1) + gains[i - 1]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period;
      }
      if (avgLoss === 0) { result.push(100); continue; }
      result.push(100 - 100 / (1 + avgGain / avgLoss));
    }
    return result;
  }
}

module.exports = new StrategyParser();
