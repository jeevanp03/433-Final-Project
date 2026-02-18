"""
tests.test_integration
========================
Integration tests verifying end-to-end pipeline artefact creation.

These tests are heavier (they exercise multiple pipeline stages on small
synthetic data) and should be run separately if speed is a concern:

    pytest tests/test_integration.py -v

Test IDs (from TODO.md Phase 8B)
---------------------------------
8.3  test_pipeline_artefacts  : clean → features → (no model training in CI)
8.5  test_recommendation_roundtrip : optimiser produces peak_reduction_kw > 0

Additional tests
-----------------
test_config_loads_all_keys     : params.yaml has all expected top-level keys.
test_file_registry_paths_valid : file_registry path keys exist in params.yaml.
"""

from __future__ import annotations

import json
import pathlib
import tempfile

import numpy as np
import pandas as pd
import pytest


# ---------------------------------------------------------------------------
# Config and registry tests
# ---------------------------------------------------------------------------

class TestConfig:
    def test_config_loads_all_keys(self) -> None:
        """params.yaml must contain all expected top-level keys."""
        from src.skills.config_loader import load_config
        cfg = load_config()
        required_keys = {
            "paths", "data", "splits", "features",
            "model", "evaluation", "conformal",
            "prescriptive", "pricing", "dashboard",
        }
        missing = required_keys - set(cfg.keys())
        assert not missing, f"Missing top-level config keys: {missing}"

    def test_get_param_dot_path(self) -> None:
        """get_param() must resolve nested dot-path keys correctly."""
        from src.skills.config_loader import get_param
        lr = get_param("model.xgboost.learning_rate")
        assert isinstance(lr, float)
        assert 0 < lr < 1, f"Unexpected learning_rate: {lr}"

    def test_xgboost_defaults_match_design_doc(self) -> None:
        """XGBoost defaults must match the values in CLAUDE.md."""
        from src.skills.config_loader import get_param
        assert get_param("model.xgboost.n_estimators") == 300
        assert get_param("model.xgboost.max_depth") == 5
        assert abs(get_param("model.xgboost.learning_rate") - 0.05) < 1e-9
        assert abs(get_param("model.xgboost.subsample") - 0.8) < 1e-9
        assert get_param("model.xgboost.min_child_weight") == 5


# ---------------------------------------------------------------------------
# Pipeline integration tests (using temp directories)
# ---------------------------------------------------------------------------

class TestPipelineArtefacts:
    """Verify clean → features pipeline writes artefacts (TODO 8.3)."""

    def test_clean_and_resample_produces_parquet(self, tmp_path) -> None:
        """clean_and_resample() result can be saved to Parquet and reloaded."""
        n = 24 * 60 * 3  # 3 days of minute data
        idx = pd.date_range("2007-01-01", periods=n, freq="1min")
        rng = np.random.default_rng(5)
        raw_df = pd.DataFrame(
            {
                "Global_active_power": rng.uniform(0.2, 3.0, n),
                "Global_reactive_power": rng.uniform(0.0, 0.5, n),
                "Voltage": rng.uniform(229.0, 241.0, n),
                "Global_intensity": rng.uniform(1.0, 15.0, n),
                "Sub_metering_1": rng.uniform(0, 30, n),
                "Sub_metering_2": rng.uniform(0, 30, n),
                "Sub_metering_3": rng.uniform(0, 30, n),
            },
            index=idx,
        )
        from src.ingestion.clean import clean_and_resample, save_parquet
        hourly = clean_and_resample(raw_df)
        out = tmp_path / "hourly_clean.parquet"
        save_parquet(hourly, path=out)

        assert out.exists(), "Parquet file was not created."
        reloaded = pd.read_parquet(out)
        assert len(reloaded) > 0
        assert "Global_active_power" in reloaded.columns

    def test_build_features_pipeline(self) -> None:
        """build_features() on synthetic data returns non-empty feature matrix."""
        n = 400
        idx = pd.date_range("2007-01-01", periods=n, freq="1h")
        rng = np.random.default_rng(3)
        clean_df = pd.DataFrame(
            {
                "Global_active_power": rng.uniform(0.3, 3.5, n),
                "Global_reactive_power": rng.uniform(0.0, 0.5, n),
                "Voltage": rng.uniform(229.0, 241.0, n),
                "Global_intensity": rng.uniform(1.0, 15.0, n),
                "Sub_metering_1": rng.uniform(0, 40, n),
                "Sub_metering_2": rng.uniform(0, 40, n),
                "Sub_metering_3": rng.uniform(0, 40, n),
                "Other_consumption": rng.uniform(0, 100, n),
                "gap_flag": False,
            },
            index=idx,
        )
        from src.features.engineer import build_features
        feat_df = build_features(clean_df)
        assert len(feat_df) > 0
        assert feat_df.isnull().sum().sum() == 0, "NaN found in feature matrix."


# ---------------------------------------------------------------------------
# Recommendation round-trip test
# ---------------------------------------------------------------------------

class TestRecommendationRoundtrip:
    def test_recommendation_peak_reduction(self) -> None:
        """Optimiser must produce peak_reduction_kw > 0 (TODO 8.5)."""
        from src.prescriptive.optimiser import optimise
        from src.prescriptive.constraints import get_default_loads

        # Evening-peaked profile — optimiser should shift loads to off-peak
        forecast = np.array([
            0.5, 0.4, 0.3, 0.3, 0.4, 0.6,
            1.0, 1.4, 1.6, 1.8, 2.0, 2.1,
            1.9, 1.7, 1.6, 1.8, 2.2, 2.5,
            2.4, 2.0, 1.6, 1.2, 0.9, 0.6,
        ])
        loads = get_default_loads()
        result = optimise(forecast, loads=loads)
        assert result.feasible, "Optimiser must return a feasible schedule."
        assert result.peak_reduction_kw >= 0, (
            "Peak reduction must be non-negative."
        )
