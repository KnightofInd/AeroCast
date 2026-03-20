This is the frontend for the Forecast Monitoring App.

## Getting Started

1. Configure the backend URL:

```bash
cp .env.local.example .env.local
```

2. Start the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

3. Open [http://localhost:3000](http://localhost:3000) and use the dashboard controls.

The UI includes:

- Start/end datetime pickers
- Horizon comparison chips (0-48h options)
- Time display mode (Local/UTC)
- Recharts line chart for Actual vs Forecast
- Forecast quality scorecard (MAE, RMSE, Bias, P99)
- Explainability panel (target/cutoff/publish details)
- CSV export of current filtered data
- Loading and error states for API requests

The frontend expects backend endpoint:

`GET /data?start=...&end=...&horizon=...`
