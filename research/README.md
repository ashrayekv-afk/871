# Research artifacts — interface 8.0

`evidence_model.json` and its SHA-256 are active only for separately labelled cohort-adjusted observed rates. Primary reference-evidence flags do not use this fitted prior.

To reproduce the fit in a private environment with numpy and pandas:

```bash
python research/fit_observed_evidence.py /private/private_paired.csv /private/evidence_model.json
```

Input columns: `patient_id`, `age_baseline`, `interval_years`, and `baseline_` / `latest_` prefixed A, B, C, Kmax, BAD_D, ARTmax. The supplied private cohort contains complete numeric pairs. No raw rows or patient identifiers are included in this package. Fitting is not run in the deployed app.

Fit: 179 eligible eyes / 101 patients; EM converged in 986 iterations. See `../docs/OBSERVED_EVIDENCE.md` for assumptions and reference values. This is not a validated clinical forecasting model.

The retained `domain_training/`, `train_domain_outlook.py`, `reconstruct_source.py`, `evaluate_trajectory.py`, `trajectory_feasibility.json` and `protocol.json` document earlier experiments. They are inactive in this release. Their probability candidates were not promoted to the app. Their historical evaluation remains in `../docs/DOMAIN_TRAINING_REPORT.md`.
