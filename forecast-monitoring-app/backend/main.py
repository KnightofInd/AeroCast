from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pandas as pd
import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Forecast Monitoring API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FUELHH_STREAM_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream"
WINDFOR_STREAM_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream"
MIN_SUPPORTED_START = datetime(2025, 1, 1, tzinfo=UTC)
MAX_CHUNK_DAYS = 7

http_session = requests.Session()


def _parse_utc_datetime(value: str, field_name: str) -> datetime:
    normalized = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name} datetime format") from exc

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    else:
        parsed = parsed.astimezone(UTC)
    return parsed


def _chunk_ranges(start: datetime, end: datetime, max_days: int = MAX_CHUNK_DAYS) -> list[tuple[datetime, datetime]]:
    chunks: list[tuple[datetime, datetime]] = []
    cursor = start
    delta = timedelta(days=max_days)
    while cursor < end:
        chunk_end = min(cursor + delta, end)
        chunks.append((cursor, chunk_end))
        cursor = chunk_end
    return chunks


def _fetch_stream_records(url: str, start: datetime, end: datetime, extra_params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    all_records: list[dict[str, Any]] = []

    for chunk_start, chunk_end in _chunk_ranges(start, end):
        params = {
            "publishDateTimeFrom": chunk_start.isoformat().replace("+00:00", "Z"),
            "publishDateTimeTo": chunk_end.isoformat().replace("+00:00", "Z"),
        }
        if extra_params:
            params.update(extra_params)

        try:
            response = http_session.get(url, params=params, timeout=30)
            response.raise_for_status()
        except requests.RequestException as exc:
            raise HTTPException(status_code=502, detail=f"Upstream API request failed: {exc}") from exc

        payload = response.json()
        if isinstance(payload, list):
            all_records.extend(payload)
        elif isinstance(payload, dict) and isinstance(payload.get("data"), list):
            all_records.extend(payload["data"])

    return all_records


def get_actual_data(start: datetime, end: datetime) -> pd.DataFrame:
    # Actuals are published close to delivery time; include a small right buffer.
    records = _fetch_stream_records(
        FUELHH_STREAM_URL,
        start,
        end + timedelta(hours=1),
        extra_params={"fuelType": "WIND"},
    )

    if not records:
        return pd.DataFrame(columns=["startTime", "actual"])

    df = pd.DataFrame(records)
    if "fuelType" in df.columns:
        df = df[df["fuelType"] == "WIND"]
    df = df.dropna(subset=["startTime", "generation"])

    df["startTime"] = pd.to_datetime(df["startTime"], utc=True, errors="coerce")
    if "publishTime" in df.columns:
        df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True, errors="coerce")
        df = df.sort_values(["startTime", "publishTime"])
        df = df.drop_duplicates(subset=["startTime"], keep="last")
    else:
        df = df.sort_values(["startTime"])

    df = df[df["startTime"].between(start, end, inclusive="both")]
    df = df[df["startTime"].dt.minute.isin([0, 30])]
    df = df.rename(columns={"generation": "actual"})[["startTime", "actual"]]
    df["actual"] = pd.to_numeric(df["actual"], errors="coerce")
    df = df.dropna(subset=["actual"])  # defensive null cleanup
    return df


def get_forecast_data(start: datetime, end: datetime) -> pd.DataFrame:
    records = _fetch_stream_records(WINDFOR_STREAM_URL, start, end)
    if not records:
        return pd.DataFrame(columns=["startTime", "publishTime", "forecast"])

    df = pd.DataFrame(records)
    df = df.dropna(subset=["startTime", "publishTime", "generation"])

    df["startTime"] = pd.to_datetime(df["startTime"], utc=True, errors="coerce")
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True, errors="coerce")
    df = df.dropna(subset=["startTime", "publishTime"])

    df = df.sort_values(by=["startTime", "publishTime"])
    df = df[df["startTime"].dt.minute.isin([0, 30])]
    df = df.rename(columns={"generation": "forecast"})[["startTime", "publishTime", "forecast"]]
    df["forecast"] = pd.to_numeric(df["forecast"], errors="coerce")
    df = df.dropna(subset=["forecast"])
    df = df.drop_duplicates(subset=["startTime", "publishTime"], keep="last")
    return df


def build_aligned_dataframe(actual_df: pd.DataFrame, forecast_df: pd.DataFrame, horizon_hours: int) -> pd.DataFrame:
    if actual_df.empty or forecast_df.empty:
        return pd.DataFrame(columns=["startTime", "actual", "cutoffTime", "publishTime", "forecast"])

    actual = actual_df.copy().sort_values("startTime")
    forecast = forecast_df.copy().sort_values("publishTime")

    actual["cutoffTime"] = actual["startTime"] - pd.to_timedelta(horizon_hours, unit="h")
    targets = actual[["startTime", "actual", "cutoffTime"]].sort_values("cutoffTime")

    aligned = pd.merge_asof(
        left=targets,
        right=forecast,
        left_on="cutoffTime",
        right_on="publishTime",
        by="startTime",
        direction="backward",
        allow_exact_matches=True,
    )

    aligned = aligned.dropna(subset=["forecast", "publishTime", "actual"])
    aligned = aligned[aligned["publishTime"] <= aligned["cutoffTime"]]

    if aligned.empty:
        return pd.DataFrame(columns=["startTime", "actual", "cutoffTime", "publishTime", "forecast"])

    aligned = aligned.sort_values("startTime")
    aligned = aligned.drop_duplicates(subset=["startTime"], keep="last")
    return aligned[["startTime", "actual", "cutoffTime", "publishTime", "forecast"]]


def align_actual_and_forecast(actual_df: pd.DataFrame, forecast_df: pd.DataFrame, horizon_hours: int) -> list[dict[str, Any]]:
    return align_actual_and_forecast_with_options(
        actual_df=actual_df,
        forecast_df=forecast_df,
        horizon_hours=horizon_hours,
        include_meta=False,
    )


def align_actual_and_forecast_with_options(
    actual_df: pd.DataFrame,
    forecast_df: pd.DataFrame,
    horizon_hours: int,
    include_meta: bool,
) -> list[dict[str, Any]]:
    aligned = build_aligned_dataframe(actual_df=actual_df, forecast_df=forecast_df, horizon_hours=horizon_hours)

    if aligned.empty:
        return []

    result: list[dict[str, Any]] = []
    for _, row in aligned.iterrows():
        payload: dict[str, Any] = {
            "time": row["startTime"].to_pydatetime().isoformat().replace("+00:00", "Z"),
            "actual": float(row["actual"]),
            "forecast": float(row["forecast"]),
        }
        if include_meta:
            payload["publishTime"] = row["publishTime"].to_pydatetime().isoformat().replace("+00:00", "Z")
            payload["cutoffTime"] = row["cutoffTime"].to_pydatetime().isoformat().replace("+00:00", "Z")
            payload["horizonHours"] = horizon_hours
        result.append(payload)
    return result


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/data")
def get_data(
    start: str = Query(..., description="UTC ISO timestamp"),
    end: str = Query(..., description="UTC ISO timestamp"),
    horizon: int = Query(4, ge=0, le=48, description="Forecast horizon in hours"),
    includeMeta: bool = Query(False, description="Include publish/cutoff metadata for explainability"),
) -> list[dict[str, Any]]:
    start_dt = _parse_utc_datetime(start, "start")
    end_dt = _parse_utc_datetime(end, "end")

    if start_dt < MIN_SUPPORTED_START:
        raise HTTPException(status_code=400, detail="Start date must be on or after 2025-01-01T00:00:00Z")
    if start_dt >= end_dt:
        raise HTTPException(status_code=400, detail="Start must be before end")

    # Fetch forecasts with a lookback window so cutoff-based selection can be resolved.
    forecast_fetch_start = start_dt - timedelta(hours=48)
    forecast_fetch_end = end_dt

    actual_df = get_actual_data(start=start_dt, end=end_dt)
    forecast_df = get_forecast_data(start=forecast_fetch_start, end=forecast_fetch_end)

    forecast_df = forecast_df[forecast_df["startTime"].between(start_dt, end_dt, inclusive="both")]

    payload = align_actual_and_forecast_with_options(
        actual_df=actual_df,
        forecast_df=forecast_df,
        horizon_hours=horizon,
        include_meta=includeMeta,
    )

    if len(payload) > 10000:
        raise HTTPException(status_code=400, detail="Requested range is too large; please reduce date window")

    return payload
