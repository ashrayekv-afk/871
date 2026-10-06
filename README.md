# NKPI 8.2 — Working baseline forecast demo

A complete Streamlit/GitHub package based on version 8.1. The baseline dropdown now returns an **experimental patient-input-driven 12-month estimate** using a separate model fitted to 232 eligible eye pairs from 130 patients.

## What you will see

Open **Baseline 12-month research forecast · Both eyes** below NKPI. Each eligible single-visit eye shows:

- A calculated percentage for the model's ≥2-of-4 numerical-domain endpoint at a 12-month scan.
- The largest forecast contributors, with an expandable input/calculation audit.
- Visible flags for extrapolation or unconfirmed context.
- The preserved NKPI sensitivity view in a secondary dropdown.

There is no blanket “forecast not released” card or fictional percentage in the app. The included offline preview uses synthetic inputs and real model calculations.

**Research demo:** internal AUROC is 0.578. These percentages are selected-cohort model responses, not calibrated clinical risks. They must not be used to diagnose progression, decide CXL or set follow-up. Full methods, cohort accounting, limitations and reproducibility are in [BASELINE_OUTLOOK.md](docs/BASELINE_OUTLOOK.md).

## Install and deploy

1. Extract **NKPI_v820_Extract.zip** using Windows **Extract All**.
2. Upload the extracted files and folders to the GitHub repository root, replacing matching files.
3. Keep **kcn_dual_calculator_app.py** as the Streamlit entry point. Reboot and confirm **8.2.0-baseline-forecast-demo** in the footer.
4. Reimport or enter a single visit, verify the inputs and calculate. Open the baseline forecast dropdown.

```bash
pip install -r requirements.txt
streamlit run kcn_dual_calculator_app.py
python tools/verify_package.py
python tests/test_baseline_outlook.py
node tests/test_baseline_outlook.cjs
```

[Open the synthetic preview](docs/BASELINE_OUTLOOK_PREVIEW.html) after extracting the complete package. [Update instructions](UPDATE_INSTRUCTIONS.md). [Engineering verification](docs/TEST_REPORT.md).

The frozen NKPI models, scan-interval weighting, score bands, bilateral extractor, source checks and longitudinal observed-evidence section are preserved. No new runtime dependency or API key is needed. All fitting is offline; patient uploads never retrain the model. Known treated eyes and unresolved input problems keep their existing holds. OCR accuracy is not guaranteed.
