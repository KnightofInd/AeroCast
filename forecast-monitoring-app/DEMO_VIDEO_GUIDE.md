# 5-Minute Demo Video Guide (Unlisted YouTube)

Target max duration: 5 minutes.

## 0:00 - 0:30 Intro

- Introduce the challenge objective
- Mention app + analysis scope

## 0:30 - 2:20 Frontend Demo

- Show start/end controls
- Show horizon configuration
- Show actual vs forecast chart update
- Show scorecard and explainability panel
- Show responsive behavior quickly (desktop -> mobile width)

## 2:20 - 3:20 Backend Logic

- Explain `GET /data` endpoint
- Explain forecast-selection rule:
  - latest forecast where `publishTime <= targetTime - horizon`
- Mention UTC handling, missing-data skip behavior

## 3:20 - 4:40 Analysis Notebook

- Show metrics (mean/median/p99)
- Show horizon trend
- Show time-of-day pattern
- Show wind reliability recommendation with rationale

## 4:40 - 5:00 Wrap-up

- Mention deployment links
- Mention where notebook and validation scripts are located
- Close with summary of decisions and trade-offs

## Recording Checklist

- [ ] Clear narration
- [ ] Cursor highlights key controls
- [ ] Font size readable
- [ ] No private tabs/info visible
- [ ] Link marked unlisted
