# Backend (FastAPI)

## Run

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Endpoints

- `GET /health`
- `GET /data?start=...&end=...&horizon=4`

### Query Parameters

- `start`: UTC datetime (ISO-8601), must be `>= 2025-01-01T00:00:00Z`
- `end`: UTC datetime (ISO-8601), must be after `start`
- `horizon`: forecast horizon in hours, range `0-48`
- `includeMeta`: optional (`true/false`), includes `publishTime` and `cutoffTime` for explainability

### Example

```bash
curl "http://127.0.0.1:8000/data?start=2025-01-10T00:00:00Z&end=2025-01-10T06:00:00Z&horizon=4"
```

```bash
curl "http://127.0.0.1:8000/data?start=2025-01-10T00:00:00Z&end=2025-01-10T06:00:00Z&horizon=4&includeMeta=true"
```

### Output Shape

```json
[
	{
		"time": "2025-01-10T00:00:00Z",
		"actual": 8275.0,
		"forecast": 7758.0
	}
]
```

With `includeMeta=true`, each row additionally includes:

- `publishTime`
- `cutoffTime`
- `horizonHours`
