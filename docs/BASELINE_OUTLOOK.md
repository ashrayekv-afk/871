# Working baseline forecast — 8.2

## What changed

The baseline dropdown now calculates an **experimental 12-month forecast from the entered age and six baseline values**. It no longer displays a blanket “Patient forecast not released” result. Its percentages are responses from a model fitted to the available dataset; there are no hardcoded fictional percentages in the application.

The existing NKPI is unchanged. Its former sensitivity display remains under **Existing NKPI & input sensitivity**. The forecast is a separate model with a separate target and separate feature contributions. One must not substitute for the other.

This is a working research demo, not a clinically calibrated forecast. Its main card says **Experimental · Not clinically validated** and displays the limited internal discrimination. It must not be used to diagnose progression, decide CXL or set follow-up timing.

## Exact question the percentage answers

Given the first-visit age and six measurements, what response does this selected-cohort model assign to **at least two of four numerical domains crossing at a scan one year after that baseline**?

| Numerical domain | Strict rule, future scan relative to baseline |
|---|---|
| Anterior | ARC decrease >0.106 mm OR Kmax increase >1 D |
| Posterior | PRC decrease >0.085 mm |
| Pachymetric | Thinnest decrease >2% OR ARTmax decrease >44.24 |
| Composite | BAD-D increase >0.42 |

Each domain counts once. Equality does not cross. These are the prior project numerical rules, retained to avoid tuning labels to produce attractive results. They overlap; they are not four independent biological confirmations. This outcome differs from version 8's three-group observed reference-evidence assessment, which remains unchanged.

The target is the state at a later scan, not time of first progression. Two stored scans do not show whether an earlier crossing occurred and then reversed. A positive record years after baseline is not relabelled as a 12-month event.

## Data used

Source workbook SHA-256: `60bd4895f669fa55bd4e7e37266c66a52497f250847869185dfa1424bfa882be`. Input is the existing conservatively reconstructed complete-pair file, whose hash is also recorded in the new artifact.

- Historical inventory: 426 eyes; 425 with at least one numeric tomography value.
- Complete dated pairs under the prior source parser: **262 eyes / 148 patients**.
- New adult demo fit: **232 eyes / 130 patients**, with complete baseline/follow-up measurements, baseline age 18–100 and an observed interval from 90 days to five years.
- **59** positive numerical outcomes and **173** negative numerical outcomes.
- Actual training ages span **18.85–79.54 years**.
- The descriptive 9–15-month subset contains **45 eyes / 25 patients**, with **11** positive endpoints.

The demo broadens the earlier candidate's age restriction from 18–50 to all eligible adults. It retains the same outcome, time bounds and regularized logistic model family. This change and the analysis recipe were written into `research/protocol.json` before fitting this extension. The new results should not be compared to the old AUROC as an improvement on the same test cohort, because eligibility changed.

The source parser excludes known quality/diagnosis problems, missing DOB-derived age, invalid values and a documented post-CXL later scan. Remaining treatment dates and acquisition-quality information are incompletely audited. The source CXL/control sampling scheme is outcome-selected and may distort absolute risk and covariate associations in a general clinic. No sampling correction was invented. The CXL group label is not the new target or a predictor.

## Model and validation

Predictors: baseline age, ARC, PRC, thinnest pachymetry, BAD-D, ARTmax, Kmax and log elapsed years. Later measurements define the training outcome but never enter the predictor matrix. At inference the horizon is fixed at one year, hence `log_interval_years = 0`. Age stays the age at the baseline scan; it is not artificially increased or discounted.

The fit is L2 logistic regression. Standardization is learned only from training folds. The ridge parameter is selected from 0.01, 0.1, 1 and 10 by three inner patient-grouped folds minimizing Brier error. Evaluation uses five outer patient-grouped folds repeated with three predetermined seeds. Both eyes of a patient stay together. The final all-data fit selected `C=0.1`.

| Internal evaluation | AUROC | Brier error |
|---|---:|---:|
| New baseline candidate, full variable-interval cohort | 0.578 | 0.1883 |
| Training-fold average comparator, same cohort | — | 0.1897 |
| Candidate, 9–15-month descriptive held-out subset | 0.599 | 0.1815 |
| Training-fold average, same subset | — | 0.1849 |

The table uses averaged out-of-fold predictions. Every seed's metrics and patient-cluster bootstrap summaries are retained in the artifact. The narrow-window audit evaluates held-out predictions at actual recorded intervals, not precisely at 12 months. It was not used to choose the model or thresholds. There is no external validation or prospective treatment-effect analysis.

**Predictive discrimination remains limited and the Brier improvement is small.** The fact that the demo now returns a number does not improve its scientific performance. The UI does not assign low/high progression categories, a treatment threshold, confidence in stability or an unsupported individual confidence interval.

## Calculation and explanations

For the eight model inputs, use the stored scaler, coefficients and intercept:

`p = sigmoid(intercept + sum(coef[j] * (input[j] - mean[j]) / scale[j]))`

The main display is `100*p`, to one decimal place. This precision is for the working demo and does not imply clinical accuracy. A training-median substitution of one baseline feature yields `q`; its displayed effect is `100*(p-q)` percentage points. These contributions use the forecast model, not the NKPI coefficients, and are neither additive nor causal.

Example fixture, synthetic OD: age 24; A 7.2 mm; B 5.8 mm; C 500 µm; Kmax 47.2 D; BAD-D 2.4; ARTmax 310. The trained demo returns **29.480057%**, displayed **29.5%**; the unchanged baseline NKPI is approximately **26.92/100**. This example demonstrates that forecast and NKPI are independent calculations with different targets.

There is no future-measurement imputation, artificial age protection, outcome label input, random forecast, manual score multiplier or percentile remapping. Missing measurements remain missing. Source verification and existing quality/treatment holds remain in place. No additional API or external image reader is introduced.

Valid calculator inputs outside the forecast's marginal training ranges still produce a research extrapolation, explicitly flagged beside the forecast. Values are not silently clipped into the cohort range. Unknown treatment or quality is shown as unconfirmed. A known treated or quality-warning case stays held under the existing calculator policy. Two-visit mode continues to show the unchanged longitudinal evidence; select single-visit mode for the baseline forecast.

## Preserved NKPI sensitivity

The secondary section retains the version 8.1 deterministic stress test: perturb the six measured variables by published same-day pair-repeatability reference sizes, hold age fixed, and evaluate the frozen NKPI. Its rectangular extreme envelope ignores cross-variable correlation and is not a confidence interval, plausible future cornea or a repeat-scan prediction. The forecast percentage above is not obtained from this envelope.

References for those preserved perturbation sizes: [Neuhann 2020](https://doi.org/10.1038/s41598-020-76020-6) and [Gustafsson 2020](https://doi.org/10.1371/journal.pone.0228992). They did not validate this forecast.

## Reproduce and audit

Use the existing source reconstruction on an authorized private copy of the workbook, then:

```bash
python research/train_domain_outlook.py --paired /private/private_paired.csv --out /private/demo_artifacts --private-out /private/demo_validation --baseline-demo
```

Training additionally requires pandas and scikit-learn. Deployment requires neither: the app uses arithmetic with a JSON artifact. Reproduction writes patient-level out-of-fold rows only to `--private-out`; never commit or distribute that directory. Coefficients, aggregate validation and source hashes are the only fitted information shipped.

The artifact `research/baseline_forecast_demo.json` has a companion SHA-256 file. Both are required. Its clinical-release and population-risk-calibration fields remain false. Calculation outputs bind the forecast to the eye, normalized input fingerprint and artifact hash. The browser independently recomputes the percentage and all feature contributions. Edits/reset invalidate the old result. Audited JSON includes the forecast and its research flags; the existing one-page PDF continues to summarize NKPI, with only its interface version updated.

Reporting framework: [TRIPOD+AI, BMJ 2024](https://doi.org/10.1136/bmj-2023-078378). A functional software test is not clinical model validation.
