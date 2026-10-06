# Update to 8.2.0-baseline-forecast-demo

1. Download **NKPI_v820_Extract.zip** completely. Right-click → **Extract All** in Windows.
2. Upload the extracted contents to your GitHub repository root, keeping folders intact and replacing the old files. Do not upload the ZIP itself. There are 99 files, below the 100-file browser-upload limit.
3. Include the updated `nkpi/baseline_outlook.py`, `components/baseline_outlook.js`, `components/schema.js`, and both new `research/baseline_forecast_demo.json` and `.sha256` files. Preserve every file in `models/` and the extractor resources.
4. The Streamlit main file remains **kcn_dual_calculator_app.py**. Reboot the app and refresh the browser. Confirm **8.2.0-baseline-forecast-demo** in the footer.
5. Reimport the report or enter a single visit and confirm its source values. Calculate NKPI, then open **Baseline 12-month research forecast · Both eyes**.

The displayed baseline percentage is now computed by the dataset-fitted research model. Both eyes use their own inputs. Two-visit eyes continue to show the existing observed-evidence section. Known treated eyes, quality warnings, missing or unverified inputs retain their existing holds.

Changing source selections or inputs clears old results. Reconfirm and calculate to update the forecast. No model training runs in Streamlit; no new API key is needed.

This is an experimental working demo with limited discrimination, not a clinically validated prognostic calculator. The current dataset does not establish calibrated patient risk. See `docs/BASELINE_OUTLOOK.md` for the exact endpoint, validation and assumptions.

The package uses ordinary DEFLATE ZIP compression, no encryption or ZIP64 dependency, and a manifest that can be checked with `python tools/verify_package.py`. No patient rows, report images or private training outputs are distributed.
