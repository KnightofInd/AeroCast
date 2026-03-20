# Wind Forecast Monitoring Dashboard

Full-stack challenge submission for national-level UK wind generation forecast monitoring and analysis.

## What This Repository Contains

This submission includes the two required parts from the challenge:

1. Forecast monitoring app
2. Forecast error and wind reliability analysis in a Jupyter notebook

## Directory Structure

- `frontend/`: Next.js dashboard UI (desktop + mobile responsive)
- `backend/`: FastAPI API for data fetching, alignment, and horizon-based forecast selection
- `analysis/`: Jupyter notebook for metrics, error-characterization, and wind reliability recommendation

## Core Functionality Implemented

### 1) Forecast Monitoring App

- Time range selection (`start` and `end`)
- Forecast horizon selection (`0-48h`)
- Actual vs forecast chart
- Correct forecast selection logic:
	- For each target time, choose latest forecast where `publishTime <= targetTime - horizon`
- Missing forecast values are skipped (not force matched)
- Data handled in UTC
- Mobile + desktop layout support

### 2) Analysis Notebook

- Mean / median / p99 error
- Error vs forecast horizon
- Error vs time of day
- Wind reliability analysis from actual generation
- Recommended dependable wind MW based on distributional evidence

## Data Sources

- Actual generation (`FUELHH`, `fuelType=WIND`):
	- https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream
- Forecast generation (`WINDFOR`):
	- https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream

Data considered from January 2025 onward, with forecast horizon in `0-48` hours.

## Tech Stack

- Frontend: Next.js, React, Tailwind, Recharts, Axios, Day.js
- Backend: FastAPI, Uvicorn, Pandas, Requests
- Analysis: Jupyter Notebook, Pandas, NumPy, Matplotlib

## Local Setup

### Prerequisites

- Node.js 20+
- Python 3.12+

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend docs: `http://127.0.0.1:8000/docs`

### Frontend

```bash
cd frontend
npm install
# copy .env.local.example to .env.local if needed
npm run dev
```

Frontend: `http://127.0.0.1:3000`

### Analysis Notebook

```bash
cd analysis
pip install -r requirements.txt
jupyter notebook forecast_analysis.ipynb
```

## Deployment Links

- Frontend (Vercel): `ADD_LINK_HERE`
- Backend (Render/Railway/Heroku equivalent): `ADD_LINK_HERE`

## Required Submission Links

- Public Google Drive link to `.zip` of this git repo (including `.git`): `ADD_LINK_HERE`
- Unlisted YouTube demo video (<= 5 min): `ADD_LINK_HERE`
- Final form submission confirmation: `ADD_LINK_HERE`

## AI Tool Usage Disclosure

AI tools were used to assist implementation (coding support, debugging support, UI iteration, and documentation drafting). Final logic validation, integration decisions, and analysis framing were reviewed and controlled manually.

## Additional Submission Aids In This Repo

- Deployment guidance: `DEPLOYMENT_GUIDE.md`
- Demo script for unlisted video: `DEMO_VIDEO_GUIDE.md`
- Final checklist before form submit: `SUBMISSION_CHECKLIST.md`
