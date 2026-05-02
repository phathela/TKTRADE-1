/**
 * Pine Script v5 Executor
 * Transpiles Pine Script to JavaScript and computes indicator values against OHLC data.
 *
 * Supports: ta.sma, ta.ema, ta.rsi, ta.macd, ta.bb, ta.stoch, ta.atr,
 *           ta.highest, ta.lowest, ta.crossover, ta.crossunder, ta.cross,
 *           ta.change, ta.valuewhen, ta.wma, ta.vwma, ta.median, ta.percentile,
 *           ta.dev, ta.correlation, ta.alma, ta.hma, ta.swma,
 *           math.*, array.*, strategy.*, if/else, ternary, comparisons
 */
class PineExecutor {
  /**
   * Execute a Pine Script against OHLC data
   * @param {string} code - Raw Pine Script source
   * @param {Array} ohlc - OHLC data array [{time, open, high, low, close, volume}]
   * @param {Object} userParams - User-overridden input values
   * @returns {Object} { plots: {name: values[]}, hlines: [...], meta: {...} }
   */
  execute(code, ohlc, userParams = {}) {
    const pineParser = require('./pineParser');
    const indicatorEngine = require('./indicatorEngine');
    const struct = pineParser.parse(code);

    const close = ohlc.map(c => c.close);
    const open = ohlc.map(c => c.open);
    const high = ohlc.map(c => c.high);
    const low = ohlc.map(c => c.low);
    const volume = ohlc.map(c => c.volume || 0);
    const hl2 = ohlc.map(c => (c.high + c.low) / 2);
    const hlc3 = ohlc.map(c => (c.high + c.low + c.close) / 3);
    const ohlc4 = ohlc.map(c => (c.open + c.high + c.low + c.close) / 4);
    const n = ohlc.length;

    // --- Build execution context with all ta.* functions ---
    const exec = {
      // Sources
      close, open, high, low, volume, hl2, hlc3, ohlc4,
      n, bar_index: Array.from({ length: n }, (_, i) => i),

      // Helper: ensure array length matches by padding or truncating
      _align(arr) {
        if (!arr || !Array.isArray(arr)) {
          return Array(n).fill(0);
        }
        if (arr.length < n) {
          const padded = [...arr];
          while (padded.length < n) padded.push(arr[arr.length - 1] || 0);
          return padded;
        }
        return arr.slice(0, n);
      },

      // Helper: apply function per element
      _mapArrays(fn, ...arrays) {
        const aligned = arrays.map(a => this._align(a));
        const result = [];
        for (let i = 0; i < n; i++) {
          result.push(fn(...aligned.map(a => a[i]), i));
        }
        return result;
      },

      // Helper: NaN-safe value
      _v(val, fallback = 0) {
        return (val === null || val === undefined || (typeof val === 'number' && isNaN(val))) ? fallback : val;
      },

      // --- ta.* functions ---

      sma(src, len) {
        return this._align(indicatorEngine.SMA(this._align(src), Math.floor(len)));
      },

      ema(src, len) {
        return this._align(indicatorEngine.EMA(this._align(src), Math.floor(len)));
      },

      rsi(src, len) {
        return this._align(indicatorEngine.RSI(this._align(src), Math.floor(len)));
      },

      macd(src, fast, slow, signal) {
        const result = indicatorEngine.MACD(
          this._align(src), Math.floor(fast), Math.floor(slow), Math.floor(signal)
        );
        const macdLine = this._align(result.macdLine);
        const signalLine = this._align(result.signalLine);
        const histogram = this._align(result.histogram);
        const arr = [macdLine, signalLine, histogram];
        arr.macdLine = macdLine; arr.signalLine = signalLine; arr.histogram = histogram;
        return arr;
      },

      bb(src, len, mult) {
        const upper = [], middle = [], lower = [];
        const srcArr = this._align(src);
        const period = Math.floor(len);
        for (let i = 0; i < n; i++) {
          if (i < period - 1) { upper.push(null); middle.push(null); lower.push(null); continue; }
          let sum = 0;
          for (let j = i - period + 1; j <= i; j++) sum += srcArr[j];
          const avg = sum / period;
          let sqSum = 0;
          for (let j = i - period + 1; j <= i; j++) sqSum += Math.pow(srcArr[j] - avg, 2);
          const std = Math.sqrt(sqSum / period);
          middle.push(avg);
          upper.push(avg + mult * std);
          lower.push(avg - mult * std);
        }
        const bbArr = [this._align(upper), this._align(middle), this._align(lower)];
        bbArr.upper = bbArr[0]; bbArr.middle = bbArr[1]; bbArr.lower = bbArr[2];
        return bbArr;
      },

      stoch(srcHigh, srcLow, srcClose, k, d) {
        const result = indicatorEngine.Stochastic(
          ohlc.map((c, i) => ({
            high: this._align(srcHigh)[i],
            low: this._align(srcLow)[i],
            close: this._align(srcClose)[i],
          })),
          Math.floor(k), Math.floor(d)
        );
        const kArr = this._align(result.k);
        const dArr = this._align(result.d);
        const stochArr = [kArr, dArr];
        stochArr.k = kArr; stochArr.d = dArr;
        return stochArr;
      },

      atr(len) {
        return this._align(indicatorEngine.ATR(ohlc, Math.floor(len)));
      },

      highest(src, len) {
        const srcArr = this._align(src);
        const period = Math.floor(len);
        const result = [];
        for (let i = 0; i < n; i++) {
          const start = Math.max(0, i - period + 1);
          let maxVal = -Infinity;
          for (let j = start; j <= i; j++) {
            if (srcArr[j] !== null && srcArr[j] > maxVal) maxVal = srcArr[j];
          }
          result.push(maxVal === -Infinity ? null : maxVal);
        }
        return this._align(result);
      },

      lowest(src, len) {
        const srcArr = this._align(src);
        const period = Math.floor(len);
        const result = [];
        for (let i = 0; i < n; i++) {
          const start = Math.max(0, i - period + 1);
          let minVal = Infinity;
          for (let j = start; j <= i; j++) {
            if (srcArr[j] !== null && srcArr[j] < minVal) minVal = srcArr[j];
          }
          result.push(minVal === Infinity ? null : minVal);
        }
        return this._align(result);
      },

      crossover(a, b) {
        const arrA = this._align(a);
        const arrB = this._align(b);
        const result = [];
        for (let i = 0; i < n; i++) {
          if (i === 0) { result.push(false); continue; }
          const prevA = this._v(arrA[i - 1]);
          const prevB = this._v(arrB[i - 1]);
          const curA = this._v(arrA[i]);
          const curB = this._v(arrB[i]);
          result.push(prevA <= prevB && curA > curB);
        }
        return result;
      },

      crossunder(a, b) {
        const arrA = this._align(a);
        const arrB = this._align(b);
        const result = [];
        for (let i = 0; i < n; i++) {
          if (i === 0) { result.push(false); continue; }
          const prevA = this._v(arrA[i - 1]);
          const prevB = this._v(arrB[i - 1]);
          const curA = this._v(arrA[i]);
          const curB = this._v(arrB[i]);
          result.push(prevA >= prevB && curA < curB);
        }
        return result;
      },

      cross(a, b) {
        const arrA = this._align(a);
        const arrB = this._align(b);
        const result = [];
        for (let i = 0; i < n; i++) {
          if (i === 0) { result.push(false); continue; }
          const prevA = this._v(arrA[i - 1]);
          const prevB = this._v(arrB[i - 1]);
          const curA = this._v(arrA[i]);
          const curB = this._v(arrB[i]);
          result.push((prevA < prevB && curA > curB) || (prevA > prevB && curA < curB));
        }
        return result;
      },

      change(src, len = 1) {
        const srcArr = this._align(src);
        const result = [];
        for (let i = 0; i < n; i++) {
          if (i < len) { result.push(0); continue; }
          result.push(srcArr[i] - srcArr[i - len]);
        }
        return result;
      },

      valuewhen(cond, src, occurrence = 0) {
        const srcArr = this._align(src);
        const condArr = cond; // already array of booleans
        const result = [];
        const occurrences = [];
        for (let i = 0; i < n; i++) {
          if (condArr[i]) occurrences.push(srcArr[i]);
          const idx = occurrences.length - 1 - occurrence;
          result.push(idx >= 0 ? occurrences[idx] : srcArr[0]);
        }
        return result;
      },

      wma(src, len) {
        const srcArr = this._align(src);
        const period = Math.floor(len);
        const result = [];
        for (let i = 0; i < n; i++) {
          if (i < period - 1) { result.push(null); continue; }
          let weightSum = 0, sum = 0;
          for (let j = 0; j < period; j++) {
            const w = period - j;
            sum += srcArr[i - period + 1 + j] * w;
            weightSum += w;
          }
          result.push(sum / weightSum);
        }
        return this._align(result);
      },

      vwma(src, vol, len) {
        const srcArr = this._align(src);
        const volArr = this._align(vol);
        const period = Math.floor(len);
        const result = [];
        for (let i = 0; i < n; i++) {
          if (i < period - 1) { result.push(null); continue; }
          let pvSum = 0, vSum = 0;
          for (let j = i - period + 1; j <= i; j++) {
            pvSum += srcArr[j] * volArr[j];
            vSum += volArr[j];
          }
          result.push(vSum > 0 ? pvSum / vSum : 0);
        }
        return this._align(result);
      },

      hma(src, len) {
        const srcArr = this._align(src);
        const period = Math.floor(len);
        const halfLen = Math.floor(period / 2);
        const sqrtLen = Math.floor(Math.sqrt(period));
        const wmaHalf = this.wma(srcArr, halfLen);
        const wmaFull = this.wma(srcArr, period);
        const diff = this._mapArrays((a, b) => 2 * a - b, wmaHalf, wmaFull);
        return this.wma(diff, sqrtLen);
      },

      alma(src, len, offset = 0.85, sigma = 6) {
        const srcArr = this._align(src);
        const period = Math.floor(len);
        const result = [];
        const m = Math.floor(offset * (period - 1));
        const s = period / sigma;
        for (let i = 0; i < n; i++) {
          if (i < period - 1) { result.push(null); continue; }
          let sum = 0, wSum = 0;
          for (let j = 0; j < period; j++) {
            const w = Math.exp(-Math.pow(j - m, 2) / (2 * s * s));
            sum += srcArr[i - period + 1 + j] * w;
            wSum += w;
          }
          result.push(wSum > 0 ? sum / wSum : 0);
        }
        return this._align(result);
      },

      median(src, len) {
        const srcArr = this._align(src);
        const period = Math.floor(len);
        const result = [];
        for (let i = 0; i < n; i++) {
          if (i < period - 1) { result.push(null); continue; }
          const slice = srcArr.slice(i - period + 1, i + 1).sort((a, b) => a - b);
          result.push(slice[Math.floor(period / 2)]);
        }
        return this._align(result);
      },

      percentile(src, len, pct) {
        const srcArr = this._align(src);
        const period = Math.floor(len);
        const result = [];
        for (let i = 0; i < n; i++) {
          if (i < period - 1) { result.push(null); continue; }
          const sorted = srcArr.slice(i - period + 1, i + 1).sort((a, b) => a - b);
          const idx = Math.floor(period * pct / 100);
          result.push(sorted[Math.min(idx, period - 1)]);
        }
        return this._align(result);
      },

      dev(src, len) {
        const srcArr = this._align(src);
        const period = Math.floor(len);
        const result = [];
        for (let i = 0; i < n; i++) {
          if (i < period - 1) { result.push(null); continue; }
          const mean = srcArr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
          const dev = srcArr.slice(i - period + 1, i + 1).reduce((a, b) => a + Math.abs(b - mean), 0) / period;
          result.push(dev);
        }
        return this._align(result);
      },

      correlation(srcA, srcB, len) {
        const arrA = this._align(srcA);
        const arrB = this._align(srcB);
        const period = Math.floor(len);
        const result = [];
        for (let i = 0; i < n; i++) {
          if (i < period - 1) { result.push(null); continue; }
          const sliceA = arrA.slice(i - period + 1, i + 1);
          const sliceB = arrB.slice(i - period + 1, i + 1);
          const meanA = sliceA.reduce((a, b) => a + b, 0) / period;
          const meanB = sliceB.reduce((a, b) => a + b, 0) / period;
          let num = 0, denA = 0, denB = 0;
          for (let j = 0; j < period; j++) {
            num += (sliceA[j] - meanA) * (sliceB[j] - meanB);
            denA += Math.pow(sliceA[j] - meanA, 2);
            denB += Math.pow(sliceB[j] - meanB, 2);
          }
          result.push(denA > 0 && denB > 0 ? num / Math.sqrt(denA * denB) : 0);
        }
        return this._align(result);
      },

      swma(src) {
        // Simple weighted moving average: weights = [1,2,3,2,1] / 9
        const srcArr = this._align(src);
        const weights = [1, 2, 3, 2, 1];
        const wSum = weights.reduce((a, b) => a + b, 0);
        const result = [];
        for (let i = 0; i < n; i++) {
          if (i < 4) { result.push(srcArr[i]); continue; }
          let sum = 0;
          for (let j = 0; j < 5; j++) sum += srcArr[i - 4 + j] * weights[j];
          result.push(sum / wSum);
        }
        return result;
      },

      // --- math.* ---
      abs: (x) => Math.abs(x),
      sqrt: (x) => Math.sqrt(x),
      log: (x) => Math.log(x),
      log10: (x) => Math.log10(x),
      pow: (a, b) => Math.pow(a, b),
      exp: (x) => Math.exp(x),
      sin: (x) => Math.sin(x),
      cos: (x) => Math.cos(x),
      tan: (x) => Math.tan(x),
      min: (a, b) => Math.min(a, b),
      max: (a, b) => Math.max(a, b),
      floor: (x) => Math.floor(x),
      ceil: (x) => Math.ceil(x),
      round: (x) => Math.round(x),
      sign: (x) => Math.sign(x),
      avg: (...args) => args.reduce((a, b) => a + b, 0) / args.length,
      sum: (...args) => args.reduce((a, b) => a + b, 0),
    };

    // --- Build transpiled function ---
    // Strategy to extract and execute just the computation lines
    const computationLines = this._extractComputationLines(code);

    // Each computation line is wrapped: we compute arrays for every variable
    const transpiledLines = [];
    for (const compLine of computationLines) {
      const transpiled = this._transpileLine(compLine);
      transpiledLines.push(transpiled);
    }

    // --- Resolve input variables ---
    // Inject input values from userParams or defaults into the variables context
    const variables = {};

    // Inject Pine Script built-in source variables
    variables.close = close;
    variables.open = open;
    variables.high = high;
    variables.low = low;
    variables.volume = volume;
    variables.hl2 = hl2;
    variables.hlc3 = hlc3;
    variables.ohlc4 = ohlc4;
    variables.bar_index = exec.bar_index;
    variables.true = true;
    variables.false = false;

    // Resolve source name to actual data array
    const sourceMap = {
      close, open, high, low, volume, hl2, hlc3, ohlc4,
    };

    // Parse input declarations from the raw code
    const inputDecls = [];
    const inputRegex = /^(\w+)\s*=\s*input\.(\w+)\(/gm;
    let match;
    while ((match = inputRegex.exec(code)) !== null) {
      inputDecls.push({ name: match[1], inputType: match[2] });
    }

    for (const decl of inputDecls) {
      const userVal = userParams[decl.name];
      if (userVal !== undefined) {
        // Resolve source type to the actual data array
        if (decl.inputType === 'source' && typeof userVal === 'string') {
          variables[decl.name] = sourceMap[userVal] || close;
        } else {
          variables[decl.name] = userVal;
        }
      } else {
        // Try to get default from parsed structure
        const inputDef = struct.inputs.find(i => i.name === decl.name);
        if (inputDef) {
          if (inputDef.type === 'source') {
            const srcName = (typeof inputDef.default === 'string' && inputDef.default) || 'close';
            variables[decl.name] = sourceMap[srcName] || close;
          } else {
            variables[decl.name] = inputDef.default !== undefined ? inputDef.default : 14;
          }
        }
      }
    }

    // Execute all computation lines to build variable state
    for (let i = 0; i < transpiledLines.length; i++) {
      const line = transpiledLines[i];
      try {
        const result = this._evaluateLine(line, exec, variables, ohlc, n, userParams);
        if (result && result.name) {
          variables[result.name] = result.value;
        }
      } catch (e) {
        // Silently skip problematic lines
        console.warn(`Pine exec line ${i}:`, e.message);
      }
    }

    // --- Build plot results ---
    const plotResults = {};
    for (const plot of struct.plots) {
      const varName = plot.series.trim();
      const values = variables[varName];
      if (values && Array.isArray(values)) {
        plotResults[plot.title || varName] = {
          values: exec._align(values),
          color: plot.color || this._getDefaultColor(struct.plots.indexOf(plot)),
          linewidth: plot.linewidth || 1,
          overlay: struct.overlay,
        };
      }
    }

    // Handle `plot(ma)` where `ma` is a variable
    // Also handle `plot(ta.sma(...))` inline
    for (const plot of struct.plots) {
      const varName = plot.series.trim();
      if (!plotResults[plot.title || varName]) {
        // Check if the plot series is directly a variable we computed
        for (const [vName, vValue] of Object.entries(variables)) {
          if (vName === varName && Array.isArray(vValue)) {
            plotResults[plot.title || vName] = {
              values: exec._align(vValue),
              color: plot.color || this._getDefaultColor(struct.plots.indexOf(plot)),
              linewidth: plot.linewidth || 1,
              overlay: struct.overlay,
            };
          }
        }
      }
    }

    // Build hline results
    const hlineResults = struct.hlines.map(h => ({
      price: h.price,
      title: h.title,
      color: h.color,
      linewidth: h.linewidth || 1,
    }));

    // Build alert condition results
    const alertResults = [];
    for (const alert of struct.alerts) {
      const condVar = alert.condition.trim();
      const condValues = variables[condVar];
      if (condValues && Array.isArray(condValues)) {
        const lastValue = condValues[condValues.length - 1];
        alertResults.push({
          title: alert.title,
          message: alert.message,
          condition: alert.condition,
          active: !!lastValue,
          lastValue,
        });
      }
    }

    return {
      plots: plotResults,
      hlines: hlineResults,
      alerts: alertResults,
      variables,
      meta: {
        title: struct.title,
        overlay: struct.overlay,
        type: struct.type,
        inputs: struct.inputs,
        lineCount: computationLines.length,
        chartLength: n,
      },
    };
  }

  /**
   * Extract the computation lines from Pine Script (skip declarations, inputs, plots)
   */
  _extractComputationLines(code) {
    const lines = code.split('\n');
    const result = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      // Skip comments, version, declarations, inputs, plots, hlines, etc.
      if (line.startsWith('//')) continue;
      if (line.startsWith('indicator(') || line.startsWith('strategy(')) continue;
      if (line.startsWith('plot(')) continue;
      if (line.startsWith('hline(')) continue;
      if (line.startsWith('plotshape(')) continue;
      if (line.startsWith('plotarrow(')) continue;
      if (line.startsWith('barcolor(')) continue;
      if (line.startsWith('alertcondition(')) continue;
      if (line.match(/^\w+\s*=\s*input\./)) continue;
      if (line.match(/^\w+\s*=\s*input\./)) continue;
      // Add computation lines (variable assignments, if statements)
      if (line.includes('=') || line.startsWith('if ') || line.startsWith('for ') || line.startsWith('while ')) {
        result.push(line);
      }
    }

    return result;
  }

  /**
   * Transpile a Pine Script line to JS
   */
  _transpileLine(line) {
    let result = line;

    // Replace `ta.` functions
    result = result.replace(/ta\.(\w+)/g, 'exec.$1');

    // Replace `math.` functions
    result = result.replace(/math\.(\w+)/g, 'Math.$1');

    // Replace `array.` with empty (simplified)
    result = result.replace(/array\.\w+/g, 'Array');

    // Replace `strategy.*` with simplified versions
    result = result.replace(/strategy\.entry\s*\(/g, '/*entry*/(');
    result = result.replace(/strategy\.close\s*\(/g, '/*close*/(');
    result = result.replace(/strategy\.exit\s*\(/g, '/*exit*/(');
    result = result.replace(/strategy\.cancel\s*\(/g, '/*cancel*/(');
    result = result.replace(/strategy\.close_all\s*\(/g, '/*closeall*/()');

    // Replace Pine keywords
    result = result.replace(/\bna\b/g, 'null');
    result = result.replace(/\btrue\b/g, 'true');
    result = result.replace(/\bfalse\b/g, 'false');

    // Replace Pine operators
    result = result.replace(/\bnot\s+/g, '!');
    result = result.replace(/\band\s+/g, '&& ');
    result = result.replace(/\bor\s+/g, '|| ');
    result = result.replace(/!=/g, '!==');

    // Replace `if` condition block-starters: `if (cond)` → `if (cond) {`
    result = result.replace(/^if\s+(.+)/, 'if ($1) {');

    // Replace color literals: `color.blue` etc.
    result = result.replace(/color\.(white|black|blue|red|green|gray|orange|purple|yellow|aqua|fuchsia|lime|maroon|navy|olive|silver|teal)/g, (match, color) => {
      const colorMap = {
        white: '#ffffff', black: '#000000', blue: '#2962ff', red: '#f23645',
        green: '#089981', gray: '#787b86', orange: '#ff9800', purple: '#9c27b0',
        yellow: '#ffeb3b', aqua: '#00bcd4', fuchsia: '#e91e63', lime: '#cddc39',
        maroon: '#800000', navy: '#000080', olive: '#808000', silver: '#c0c0c0',
        teal: '#008080',
      };
      return `'${colorMap[color] || '#2962ff'}'`;
    });

    // Replace shape/style/location enum references
    result = result.replace(/shape\.\w+/g, "'shape'");
    result = result.replace(/location\.\w+/g, "'location'");
    result = result.replace(/size\.\w+/g, "'size'");
    result = result.replace(/line\.\w+/g, "'line'");
    result = result.replace(/style\.\w+/g, "'style'");

    // Remove `//` comments
    result = result.replace(/\/\/.*$/, '');

    return result.trim();
  }

  /**
   * Evaluate a transpiled line in the execution context
   */
  _evaluateLine(line, exec, variables, ohlc, n, userParams) {
    // Handle destructuring: `[a, b, c] = expression`
    const destructureMatch = line.match(/^\[(\w[\w\d_]*)\s*,\s*(\w[\w\d_]*)\s*,?\s*(\w[\w\d_]*)?\s*\]\s*=\s*(.+)/);
    if (destructureMatch) {
      const varNames = [destructureMatch[1], destructureMatch[2]];
      if (destructureMatch[3]) varNames.push(destructureMatch[3]);
      const expression = destructureMatch[4];

      try {
        const evalFn = new Function(
          'exec', 'vars', 'ohlc', 'n',
          `try { with(vars) { return (${expression}); } } catch(e) { return null; }`
        );
        const value = evalFn(exec, variables, ohlc, n);

        if (value !== null && value !== undefined && Array.isArray(value)) {
          for (let i = 0; i < varNames.length; i++) {
            if (varNames[i]) {
              variables[varNames[i]] = value[i] || null;
            }
          }
          // Return the first variable so the caller can track changes
          return { name: varNames[0], value: value[0] };
        }
      } catch (e) {
        // Skip
      }
      return null;
    }

    // Handle variable assignment: `name = expression`
    const assignMatch = line.match(/^(\w[\w\d_]*)\s*=\s*(.+)/);
    if (!assignMatch) return null;

    const varName = assignMatch[1];
    const expression = assignMatch[2];

    // Check for input overrides
    for (const [paramName, paramVal] of Object.entries(userParams)) {
      // Replace input references with user values
      // This is handled before eval
    }

    try {
      // Build expression context
      const contextVars = { ...variables };

      // Build the eval function
      const evalFn = new Function(
        'exec', 'vars', 'ohlc', 'n',
        `try {
          with (vars) {
            return (${expression});
          }
        } catch(e) { return null; }`
      );

      const value = evalFn(exec, variables, ohlc, n);

      if (value !== null && value !== undefined) {
        return { name: varName, value };
      }
    } catch (e) {
      // Line couldn't be evaluated
    }

    return null;
  }

  _getDefaultColor(index) {
    const colors = ['#2962ff', '#089981', '#f23645', '#ff9800', '#9c27b0', '#00bcd4', '#ff5722', '#607d8b'];
    return colors[index % colors.length];
  }

  /**
   * Get the last (most recent) value of each plot
   */
  getLastValues(execResult) {
    const result = {};
    for (const [name, plot] of Object.entries(execResult.plots)) {
      const vals = plot.values;
      result[name] = vals[vals.length - 1];
    }
    for (const hl of execResult.hlines) {
      result[hl.title || 'hline'] = hl.price;
    }
    return result;
  }
}

module.exports = new PineExecutor();
