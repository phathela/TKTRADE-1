# TKTRADE 1

TradingView-like cryptocurrency trading platform with real-time Bybit data, advanced charting, indicators, alert system with webhook integration, and backtesting engine.

## Features

- **Real-Time Charts**: Interactive candlestick/line charts with TradingView-like experience using Lightweight Charts
- **Multi-Timeframe**: 1m, 5m, 15m, 1h, 4h, 1D, 1W, 1M
- **Bybit Data Feed**: WebSocket streams for live price ticks, order book depth, and recent trades
- **Indicator Library**: MA, EMA, RSI, MACD, Bollinger Bands, Stochastic, ATR, Ichimoku Cloud, Volume Profile
- **Drawing Tools**: Trend lines, horizontal lines, rectangles, Fibonacci retracements, text annotations
- **Alert System**: TradingView-like alert creation with webhook integration for Bybit trade execution
- **Backtesting Engine**: Historical strategy testing with PnL, win rate, Sharpe ratio, max drawdown
- **Custom Strategy Upload**: Upload and execute custom strategy scripts
- **Dark/Light Theme**: Toggle between dark and light themes

## Technology Stack

- **Frontend**: React 18, TradingView Lightweight Charts, Socket.io Client
- **Backend**: Node.js, Express, Socket.io, PostgreSQL
- **Real-time Data**: Bybit WebSocket API (wss://stream.bybit.com/v5/public/linear)
- **Deployment**: Docker, Railway

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Bybit API credentials (optional, for live trading)

## Local Development

```bash
# Clone the repo
git clone https://github.com/phathela/TKTRADE-1.git
cd TKTRADE-1

# Install dependencies
npm install

# Set up environment variables
cp backend/.env.example backend/.env
# Edit .env with your database and Bybit credentials

# Start development servers
npm run dev
```

The app will be available at http://localhost:5173 (frontend) with the API at http://localhost:3001.

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `PORT` | Server port (default: 8080) | No |
| `NODE_ENV` | Environment (development/production) | No |
| `BYBIT_API_KEY` | Bybit API key | For live trading |
| `BYBIT_API_SECRET` | Bybit API secret | For live trading |
| `JWT_SECRET` | JWT signing secret | Yes |

## Railway Deployment

This project is configured for Railway deployment. Connect your GitHub repo to Railway and set the required environment variables.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/TKTRADE-1)

## Bybit Webhook Integration

When setting up alerts, you can configure webhooks to execute trades on Bybit:

### Webhook URL Format

```
https://your-app.railway.app/api/webhook/trade
```

### Webhook Message Format

```json
{
  "category": "linear",
  "symbol": "BTCUSDT",
  "side": "Buy",
  "orderType": "Market",
  "qty": "0.001",
  "timeInForce": "GTC"
}
```

For detailed Bybit API integration, see: https://bybit-exchange.github.io/docs/v5/order/create-order

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/candles/:symbol/:interval` | Get candle history |
| GET | `/api/ticker/:symbol` | Get latest ticker |
| GET | `/api/orderbook/:symbol` | Get order book snapshot |
| POST | `/api/indicators/calculate` | Calculate indicator values |
| GET | `/api/indicators/builtin` | List built-in indicators |
| POST | `/api/alerts` | Create an alert |
| GET | `/api/alerts` | List all alerts |
| PUT | `/api/alerts/:id` | Update alert |
| DELETE | `/api/alerts/:id` | Delete alert |
| POST | `/api/alerts/:id/test` | Send test webhook |
| POST | `/api/backtest/run` | Run backtest |
| POST | `/api/webhook/trade` | Webhook receiver for trades |
| GET | `/health` | Health check |

## License

MIT
