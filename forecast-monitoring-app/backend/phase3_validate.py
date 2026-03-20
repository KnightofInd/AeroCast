from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pandas as pd

from main import build_aligned_dataframe, get_actual_data, get_forecast_data


def _fmt(ts: pd.Timestamp) -> str:
    return ts.to_pydatetime().isoformat().replace("+00:00", "Z")


def run_validation() -> None:
    checks = [
        {
            "start": datetime(2025, 1, 10, 0, 0, tzinfo=UTC),
            "end": datetime(2025, 1, 10, 12, 0, tzinfo=UTC),
            "horizon": 0,
        },
        {
            "start": datetime(2025, 1, 10, 0, 0, tzinfo=UTC),
            "end": datetime(2025, 1, 10, 12, 0, tzinfo=UTC),
            "horizon": 4,
        },
        {
            "start": datetime(2025, 2, 15, 0, 0, tzinfo=UTC),
            "end": datetime(2025, 2, 16, 0, 0, tzinfo=UTC),
            "horizon": 24,
        },
    ]

    print("PHASE 3 VALIDATION")
    print("-")

    for case in checks:
        start = case["start"]
        end = case["end"]
        horizon = case["horizon"]

        actual_df = get_actual_data(start=start, end=end)
        forecast_df = get_forecast_data(start=start - timedelta(hours=48), end=end)
        forecast_df = forecast_df[forecast_df["startTime"].between(start, end, inclusive="both")]

        aligned = build_aligned_dataframe(actual_df=actual_df, forecast_df=forecast_df, horizon_hours=horizon)

        print(f"CASE start={start.isoformat()} end={end.isoformat()} horizon={horizon}h")
        print(f"actual_rows={len(actual_df)} forecast_rows={len(forecast_df)} aligned_rows={len(aligned)}")

        if aligned.empty:
            print("status=SKIP no aligned rows")
            print("-")
            continue

        # 1) Forecast does not come from future relative to cutoff.
        assert (aligned["publishTime"] <= aligned["cutoffTime"]).all()

        # 2) One output row per target startTime.
        assert not aligned["startTime"].duplicated().any()

        # 3) Null handling is clean.
        assert aligned[["actual", "forecast", "publishTime", "cutoffTime"]].notna().all().all()

        # 4) 30-minute alignment on target times.
        assert aligned["startTime"].dt.minute.isin([0, 30]).all()

        # 5) UTC consistency.
        assert str(aligned["startTime"].dt.tz) == "UTC"
        assert str(aligned["publishTime"].dt.tz) == "UTC"

        sample = aligned[["startTime", "cutoffTime", "publishTime", "actual", "forecast"]].head(5)
        print("sample_rows:")
        for _, row in sample.iterrows():
            print(
                "  "
                + f"start={_fmt(row['startTime'])} "
                + f"cutoff={_fmt(row['cutoffTime'])} "
                + f"publish={_fmt(row['publishTime'])} "
                + f"actual={float(row['actual']):.1f} "
                + f"forecast={float(row['forecast']):.1f}"
            )

        print("status=PASS")
        print("-")

    print("All validation cases completed.")


if __name__ == "__main__":
    run_validation()
