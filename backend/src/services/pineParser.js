/**
 * Pine Script v5 Parser
 * Extracts structure from .pine files: declaration, inputs, plots, hlines, alertconditions
 */
class PineParser {
  /**
   * Parse a Pine Script string and return its structure
   */
  parse(code) {
    const clean = this._removeComments(code);
    const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const result = {
      version: 5,
      type: 'indicator',      // 'indicator' or 'strategy'
      title: 'Untitled',
      overlay: false,
      format: 'price',
      precision: 2,
      inputs: [],              // { name, type, default, title, options }
      plots: [],               // { series, title, color, linewidth, style }
      hlines: [],              // { price, title, color, style, linewidth }
      shapes: [],              // { condition, title, style, location, color, size }
      alerts: [],              // { condition, title, message }
      strategy: {},            // strategy-specific params
      lineCount: lines.length,
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';

      // Declaration
      if (line.startsWith('indicator(') || line.startsWith('strategy(')) {
        const decl = this._parseDeclaration(line);
        Object.assign(result, decl);
        continue;
      }

      // Inputs
      const inputMatch = line.match(/^(\w+)\s*=\s*input\.(\w+)\(/);
      if (inputMatch) {
        const input = this._parseInput(line, inputMatch[1], inputMatch[2]);
        if (input) result.inputs.push(input);
        continue;
      }

      // plot()
      if (line.startsWith('plot(')) {
        const plot = this._parsePlot(line, lines, i);
        if (plot) result.plots.push(plot);
        continue;
      }

      // hline()
      if (line.startsWith('hline(')) {
        const hl = this._parseHline(line);
        if (hl) result.hlines.push(hl);
        continue;
      }

      // plotshape()
      if (line.startsWith('plotshape(')) {
        const shape = this._parsePlotShape(line);
        if (shape) result.shapes.push(shape);
        continue;
      }

      // alertcondition()
      if (line.startsWith('alertcondition(')) {
        const alert = this._parseAlertCondition(line);
        if (alert) result.alerts.push(alert);
        continue;
      }

      // plotarrow()
      if (line.startsWith('plotarrow(')) {
        // Handle similarly to plotshape
        continue;
      }

      // barcolor()
      if (line.startsWith('barcolor(')) {
        continue;
      }

      // //@version
      const versionMatch = line.match(/\/\/@version\s*=\s*(\d+)/);
      if (versionMatch) {
        result.version = parseInt(versionMatch[1]);
      }
    }

    return result;
  }

  _removeComments(code) {
    // Remove multi-line comments
    let clean = code.replace(/\/\*[\s\S]*?\*\//g, '');
    // Remove single-line comments but keep //@version lines
    clean = clean.split('\n').map(line => {
      if (line.trim().startsWith('//@version')) return line;
      return line.replace(/\/\/.*$/, '');
    }).join('\n');
    return clean;
  }

  _parseDeclaration(line) {
    const result = {};
    result.type = line.startsWith('strategy') ? 'strategy' : 'indicator';

    // Extract arguments
    const args = this._extractArgs(line.substring(line.indexOf('(')));

    // Positional arg 0 is the title
    if (args[0] !== undefined) {
      result.title = this._unwrapString(args[0]);
    }

    for (const [key, val] of Object.entries(args)) {
      if (key === '0') continue; // already handled
      switch (key) {
        case 'title':
          result.title = this._unwrapString(val);
          break;
        case 'shorttitle':
          result.shortTitle = this._unwrapString(val);
          break;
        case 'overlay':
          result.overlay = val === 'true';
          break;
        case 'format':
          result.format = val.replace(/^format\./, '');
          break;
        case 'precision':
          result.precision = parseInt(val) || 2;
          break;
        case 'initial_capital':
        case 'default_qty_type':
        case 'default_qty_value':
        case 'commission_type':
        case 'commission_value':
          result.strategy[key] = val;
          break;
      }
    }

    return result;
  }

  _parseInput(line, name, type) {
    const parenStart = line.indexOf('(');
    if (parenStart === -1) return null;
    const args = this._extractArgs(line.substring(parenStart));

    const input = {
      name,
      type,
      title: this._unwrapString(args.title || args[1] || name),
    };

    // The first positional arg is the default value
    if (args[0] !== undefined) {
      input.default = this._parseValue(args[0], type);
    }

    // Map standard option keys
    if (args.minval !== undefined) input.min = parseFloat(args.minval);
    if (args.maxval !== undefined) input.max = parseFloat(args.maxval);
    if (args.step !== undefined) input.step = parseFloat(args.step);
    if (args.options !== undefined) {
      // input.options = ["val1", "val2", ...]
      input.options = this._parseArray(args.options);
    }
    if (args.defval !== undefined) {
      input.default = this._parseValue(args.defval, type);
    }
    if (args.tooltip !== undefined) {
      input.tooltip = this._unwrapString(args.tooltip);
    }
    if (args.group !== undefined) {
      input.group = this._unwrapString(args.group);
    }
    if (args.inline !== undefined) {
      input.inline = this._unwrapString(args.inline);
    }
    if (args.confirm !== undefined) {
      input.confirm = args.confirm === 'true';
    }

    return input;
  }

  _parsePlot(line, lines, lineIdx) {
    const parenStart = line.indexOf('(');
    if (parenStart === -1) return null;

    // Check for multi-line plot calls
    let fullArgs = line.substring(parenStart);
    if (!fullArgs.endsWith(')')) {
      // Multi-line, concatenate
      let idx = lineIdx + 1;
      while (idx < lines.length && !fullArgs.includes(')')) {
        fullArgs += lines[idx].trim();
        idx++;
      }
    }

    const args = this._extractArgs(fullArgs);

    return {
      series: args[0] || args.series || '',
      title: this._unwrapString(args.title || args[1] || ''),
      color: this._unwrapString(args.color || ''),
      linewidth: parseInt(args.linewidth) || 1,
      style: this._unwrapString(args.style || ''),
      trackprice: args.trackprice === 'true',
      display: args.display || undefined,
    };
  }

  _parseHline(line) {
    const parenStart = line.indexOf('(');
    if (parenStart === -1) return null;
    const args = this._extractArgs(line.substring(parenStart));

    const rawPrice = args[0] || args.price || '0';
    return {
      price: rawPrice,
      title: this._unwrapString(args.title || args[1] || ''),
      color: this._unwrapString(args.color || ''),
      linestyle: this._unwrapString(args.linestyle || ''),
      linewidth: parseInt(args.linewidth) || 1,
    };
  }

  _parsePlotShape(line) {
    const parenStart = line.indexOf('(');
    if (parenStart === -1) return null;
    const args = this._extractArgs(line.substring(parenStart));

    return {
      condition: args[0] || args.series || '',
      title: this._unwrapString(args.title || args[1] || ''),
      style: this._unwrapString(args.style || ''),
      location: this._unwrapString(args.location || ''),
      color: this._unwrapString(args.color || ''),
      size: this._unwrapString(args.size || ''),
    };
  }

  _parseAlertCondition(line) {
    const parenStart = line.indexOf('(');
    if (parenStart === -1) return null;
    const args = this._extractArgs(line.substring(parenStart));

    return {
      condition: args[0] || args.condition || '',
      title: this._unwrapString(args.title || args[1] || ''),
      message: this._unwrapString(args.message || args[2] || ''),
    };
  }

  /**
   * Extract key-value pairs from a parenthesized argument list.
   * Handles both positional (indexed) and named arguments.
   */
  _extractArgs(argsStr) {
    const result = {};
    // Remove outer parentheses if present
    let s = argsStr.trim();
    if (s.startsWith('(') && s.endsWith(')')) {
      s = s.substring(1, s.length - 1);
    }

    // Split by top-level commas (not inside nested parens or quotes)
    const parts = this._splitTopLevel(s);

    let positionalIdx = 0;
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Named argument: key=value
      const eqMatch = trimmed.match(/^(\w[\w.]*)\s*=\s*(.+)$/);
      if (eqMatch) {
        result[eqMatch[1]] = eqMatch[2].trim();
      } else {
        // Positional argument
        result[positionalIdx++] = trimmed;
      }
    }

    return result;
  }

  /**
   * Split a string by commas, respecting nested parentheses and quotes
   */
  _splitTopLevel(s) {
    const parts = [];
    let depth = 0;
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inQuote) {
        current += ch;
        if (ch === quoteChar) inQuote = false;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inQuote = true;
        quoteChar = ch;
        current += ch;
        continue;
      }
      if (ch === '(' || ch === '[' || ch === '{') { depth++; current += ch; continue; }
      if (ch === ')' || ch === ']' || ch === '}') { depth--; current += ch; continue; }
      if (ch === ',' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.trim()) parts.push(current);
    return parts;
  }

  _unwrapString(str) {
    if (!str) return '';
    str = str.trim();
    if ((str.startsWith('"') && str.endsWith('"')) ||
        (str.startsWith("'") && str.endsWith("'"))) {
      return str.substring(1, str.length - 1);
    }
    return str;
  }

  _parseValue(val, type) {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (type === 'int' || type === 'float') {
      const num = parseFloat(val);
      return isNaN(num) ? val : num;
    }
    if (type === 'color') return this._unwrapString(val);
    if (type === 'source') return val; // 'close', 'high', etc.
    if (type === 'symbol') return this._unwrapString(val);
    if (type === 'string') return this._unwrapString(val);
    return this._unwrapString(val);
  }

  _parseArray(str) {
    if (!str) return [];
    str = str.trim();
    if (str.startsWith('[') && str.endsWith(']')) {
      str = str.substring(1, str.length - 1);
    }
    return this._splitTopLevel(str).map(s => this._unwrapString(s.trim()));
  }
}

module.exports = new PineParser();
