# Deployment Guide

This guide prepares the project for final submission links.

## 1) Frontend (Vercel)

1. Import `frontend/` as a Vercel project.
2. Framework preset: Next.js.
3. Build command: `npm run build`.
4. Output: default for Next.js.
5. Environment variable:
   - `NEXT_PUBLIC_API_BASE_URL=<deployed_backend_url>`
6. Deploy and copy the public URL.

## 2) Backend (Render or Railway)

### Render

1. Create a new Web Service from `backend/`.
2. Runtime: Python.
3. Build command:

```bash
pip install -r requirements.txt
```

4. Start command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

5. Deploy and copy backend URL.

### Railway (alternative)

1. New project from repo, root at `backend/`.
2. Install command:

```bash
pip install -r requirements.txt
```

3. Start command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

## 3) Connect Frontend and Backend

1. Set frontend env var `NEXT_PUBLIC_API_BASE_URL` to deployed backend URL.
2. Redeploy frontend.
3. Verify API requests from UI succeed.

## 4) Post-Deployment Checks

- `GET /health` works on deployed backend
- UI loads without console/network errors
- Chart updates for multiple horizons
- CSV export works
- Explainability panel shows publish/cutoff details

## 5) Update README

After deployment, update these placeholders in `README.md`:

- Frontend link
- Backend link
- Drive zip link
- YouTube video link
- Form submission reference
