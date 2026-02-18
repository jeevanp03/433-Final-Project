"""
tests.test_prescriptive
========================
Unit tests for ``src.prescriptive.*``.

Test IDs (from TODO.md Phase 6C)
---------------------------------
6.10  test_optimiser_feasible        : Default loads + default constraints → feasible.
6.11  test_optimiser_respects_window : No task scheduled outside [earliest, latest].
6.12  test_cost_calculation          : Manual cost check matches engine output.

Additional tests
-----------------
test_flexible_load_feasible_starts : FlexibleLoad.feasible_starts() is correct.
test_tou_rate_all_hours_covered    : get_tou_rate covers all 24 hours.
test_optimised_peak_le_baseline    : Optimised peak must be <= baseline peak.
"""

from __future__ import annotations

import numpy as np
import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def typical_forecast():
    """24-hour synthetic forecast with realistic evening peak."""
    return np.array([
        0.5, 0.4, 0.3, 0.3, 0.4, 0.6,
        1.0, 1.4, 1.6, 1.8, 2.0, 2.1,
        1.9, 1.7, 1.6, 1.8, 2.2, 2.5,
        2.4, 2.0, 1.6, 1.2, 0.9, 0.6,
    ])


@pytest.fixture(scope="module")
def default_loads():
    from src.prescriptive.constraints import get_default_loads
    return get_default_loads()


# ---------------------------------------------------------------------------
# FlexibleLoad tests
# ---------------------------------------------------------------------------

class TestFlexibleLoad:
    def test_feasible_starts_bounds(self, default_loads) -> None:
        """feasible_starts() must respect earliest_start and latest_finish."""
        for load in default_loads:
            starts = load.feasible_starts()
            for s in starts:
                assert s >= load.earliest_start, (
                    f"{load.name}: start {s} < earliest_start {load.earliest_start}"
                )
                assert s + load.duration_h <= load.latest_finish, (
                    f"{load.name}: start {s} + duration {load.duration_h} "
                    f"> latest_finish {load.latest_finish}"
                )

    def test_energy_kwh_formula(self, default_loads) -> None:
        """energy_kwh() == power_kw * duration_h."""
        for load in default_loads:
            assert abs(load.energy_kwh() - load.power_kw * load.duration_h) < 1e-9


# ---------------------------------------------------------------------------
# TOU Pricing tests
# ---------------------------------------------------------------------------

class TestPricing:
    def test_tou_rate_all_hours_covered(self) -> None:
        """get_tou_rate must return a positive rate for every hour 0-23 (TODO 6.12 part)."""
        from src.prescriptive.pricing import get_tou_rate
        for h in range(24):
            rate = get_tou_rate(h)
            assert rate > 0, f"Non-positive TOU rate for hour {h}: {rate}"

    def test_manual_cost_matches_engine(self, typical_forecast) -> None:
        """Manual numpy dot product must match compute_cost (TODO 6.12)."""
        from src.prescriptive.pricing import build_hourly_price_vector, compute_cost
        prices = build_hourly_price_vector(24)
        expected_cost = float(np.dot(typical_forecast, prices))
        actual_cost = compute_cost(typical_forecast, prices)
        assert abs(actual_cost - expected_cost) < 1e-9, (
            f"Cost mismatch: expected {expected_cost:.4f}, got {actual_cost:.4f}"
        )

    def test_price_vector_length(self) -> None:
        """build_hourly_price_vector(24) must return a length-24 array."""
        from src.prescriptive.pricing import build_hourly_price_vector
        prices = build_hourly_price_vector(24)
        assert len(prices) == 24


# ---------------------------------------------------------------------------
# Optimiser tests
# ---------------------------------------------------------------------------

class TestOptimiser:
    def test_optimiser_feasible(self, typical_forecast, default_loads) -> None:
        """Default loads + default forecast → feasible schedule (TODO 6.10)."""
        from src.prescriptive.optimiser import optimise
        result = optimise(typical_forecast, loads=default_loads)
        assert result.feasible, (
            "Optimiser returned infeasible for the default loads and typical forecast."
        )

    def test_optimiser_respects_window(self, typical_forecast, default_loads) -> None:
        """No task must be scheduled outside its [earliest_start, latest_finish) window (TODO 6.11)."""
        from src.prescriptive.optimiser import optimise
        result = optimise(typical_forecast, loads=default_loads)
        assert result.feasible, "Skip window check: infeasible result."

        for load in default_loads:
            start = result.schedule.get(load.name)
            if start is None:
                continue
            assert start >= load.earliest_start, (
                f"{load.name}: scheduled start {start} < earliest_start {load.earliest_start}"
            )
            assert start + load.duration_h <= load.latest_finish, (
                f"{load.name}: scheduled end {start + load.duration_h} "
                f"> latest_finish {load.latest_finish}"
            )

    def test_optimised_peak_le_baseline(self, typical_forecast, default_loads) -> None:
        """Optimised peak must be <= baseline peak."""
        from src.prescriptive.optimiser import optimise
        result = optimise(typical_forecast, loads=default_loads)
        assert result.feasible, "Skip peak test: infeasible."
        assert np.max(result.optimised_profile) <= np.max(result.baseline_profile) + 1e-6, (
            "Optimised peak exceeds baseline peak."
        )

    def test_schedule_keys_are_load_names(self, typical_forecast, default_loads) -> None:
        """Schedule dict must have load names as keys."""
        from src.prescriptive.optimiser import optimise
        result = optimise(typical_forecast, loads=default_loads)
        if not result.feasible:
            pytest.skip("Infeasible; cannot check schedule keys.")
        load_names = {l.name for l in default_loads}
        for key in result.schedule:
            assert key in load_names, f"Unexpected schedule key: {key}"
