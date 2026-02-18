"""
src.prescriptive.optimiser
==========================
MILP load-shift optimiser using the PuLP modelling layer with CBC solver.

Objective: minimise  ``alpha * peak + (1 - alpha) * cost``

Where:
    - ``alpha`` is the peak-reduction weight from ``prescriptive.peak_weight``
      in params.yaml (0 = cost only, 1 = peak only).
    - ``peak``  is the maximum hourly load over the 24-hour horizon (kW).
    - ``cost``  is the total TOU electricity cost (EUR).

Decision variables:
    - ``x[i, t]`` ∈ {0, 1}: appliance ``i`` runs in hour ``t``.

Constraints:
    - Duration: each appliance must run for exactly ``duration_h`` hours.
    - Time window: ``x[i, t] = 0`` if t < earliest_start or t >= latest_finish.
    - Contiguity (non-preemptable): load must run in consecutive hours.
    - Max deferral: |start_opt - start_original| <= max_deferral_h.
    - Max load: auxiliary variable captures hourly total load (kW).

Infeasibility handling: if no feasible solution is found, ``max_deferral_h``
is relaxed incrementally by ``infeasibility_deferral_step_h`` up to
``max_relaxation_attempts`` times.

Usage::

    python -m src.prescriptive.optimiser
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import numpy as np

from src.prescriptive.constraints import FlexibleLoad, get_default_loads
from src.prescriptive.pricing import build_hourly_price_vector, compute_cost
from src.skills.config_loader import get_param, load_config
from src.skills.logger import get_logger

logger: logging.Logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Output dataclasses
# ---------------------------------------------------------------------------

@dataclass
class OptimisedSchedule:
    """Result object returned by the load-shift optimiser.

    Attributes
    ----------
    feasible : bool
        Whether a feasible solution was found.
    schedule : dict[str, int]
        Mapping of appliance name -> optimised start hour.  Empty if
        infeasible.
    baseline_profile : np.ndarray
        Hourly load profile without shifting (shape ``(24,)``, kW).
    optimised_profile : np.ndarray
        Hourly load profile with shifted appliances (shape ``(24,)``, kW).
    peak_reduction_kw : float
        Absolute peak reduction achieved (kW).
    peak_reduction_pct : float
        Relative peak reduction as a percentage.
    cost_change_eur : float
        Change in daily electricity cost (negative = saving).
    cost_change_pct : float
        Relative cost change as a percentage.
    relaxation_steps : int
        Number of deferral relaxation steps required (0 = solved as-is).
    """

    feasible: bool
    schedule: dict[str, int]
    baseline_profile: np.ndarray
    optimised_profile: np.ndarray
    peak_reduction_kw: float = 0.0
    peak_reduction_pct: float = 0.0
    cost_change_eur: float = 0.0
    cost_change_pct: float = 0.0
    relaxation_steps: int = 0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def optimise(
    forecast_profile: np.ndarray,
    loads: Optional[list[FlexibleLoad]] = None,
    peak_weight: Optional[float] = None,
) -> OptimisedSchedule:
    """Run the load-shift MILP optimisation.

    Parameters
    ----------
    forecast_profile : np.ndarray
        24-element array of forecast household load in kW (baseline, without
        flexible appliances already removed).
    loads : list[FlexibleLoad] | None
        Flexible appliances to schedule.  Defaults to ``get_default_loads()``.
    peak_weight : float | None
        Objective weight on peak vs cost reduction.  Defaults to
        ``prescriptive.peak_weight`` from params.yaml.

    Returns
    -------
    OptimisedSchedule
        Contains the schedule, profiles, and summary metrics.
    """
    if loads is None:
        loads = get_default_loads()
    if peak_weight is None:
        peak_weight = float(get_param("prescriptive.peak_weight"))

    prices = build_hourly_price_vector(24)
    baseline_profile = _build_baseline_profile(forecast_profile, loads)
    baseline_peak = float(np.max(baseline_profile))
    baseline_cost = compute_cost(baseline_profile, prices)

    max_attempts: int = get_param("prescriptive.max_relaxation_attempts")
    step_h: int = get_param("prescriptive.infeasibility_deferral_step_h")

    for attempt in range(max_attempts + 1):
        result = _solve_milp(
            forecast_profile=forecast_profile,
            loads=loads,
            prices=prices,
            peak_weight=peak_weight,
            extra_deferral=attempt * step_h,
        )
        if result is not None:
            schedule, opt_profile = result
            opt_peak = float(np.max(opt_profile))
            opt_cost = compute_cost(opt_profile, prices)
            return OptimisedSchedule(
                feasible=True,
                schedule=schedule,
                baseline_profile=baseline_profile,
                optimised_profile=opt_profile,
                peak_reduction_kw=baseline_peak - opt_peak,
                peak_reduction_pct=(baseline_peak - opt_peak) / baseline_peak * 100,
                cost_change_eur=opt_cost - baseline_cost,
                cost_change_pct=(opt_cost - baseline_cost) / baseline_cost * 100,
                relaxation_steps=attempt,
            )
        if attempt < max_attempts:
            logger.warning(
                "MILP infeasible at attempt %d/%d. "
                "Relaxing max_deferral by +%d h.",
                attempt + 1, max_attempts, step_h,
            )

    logger.error("MILP infeasible after %d relaxation attempts.", max_attempts)
    return OptimisedSchedule(
        feasible=False,
        schedule={},
        baseline_profile=baseline_profile,
        optimised_profile=baseline_profile.copy(),
        relaxation_steps=max_attempts,
    )


# ---------------------------------------------------------------------------
# MILP formulation (PuLP)
# ---------------------------------------------------------------------------

def _solve_milp(
    forecast_profile: np.ndarray,
    loads: list[FlexibleLoad],
    prices: np.ndarray,
    peak_weight: float,
    extra_deferral: int = 0,
) -> Optional[tuple[dict[str, int], np.ndarray]]:
    """Formulate and solve the MILP.  Returns None if infeasible."""
    try:
        import pulp
    except ImportError as exc:
        raise ImportError("pulp is required. Install with: pip install pulp") from exc

    T = 24  # hours in scheduling horizon
    prob = pulp.LpProblem("load_shift", pulp.LpMinimize)

    # Decision variables: x[i][t] = 1 if appliance i runs in hour t
    x = {
        (i, t): pulp.LpVariable(f"x_{i}_{t}", cat="Binary")
        for i in range(len(loads))
        for t in range(T)
    }

    # Auxiliary variable: peak load over the horizon
    peak_var = pulp.LpVariable("peak", lowBound=0)

    # Total load per hour = forecast + flexible load
    load_per_hour = [
        forecast_profile[t] + pulp.lpSum(
            loads[i].power_kw * x[(i, t)] for i in range(len(loads))
        )
        for t in range(T)
    ]

    # Objective
    total_cost = pulp.lpSum(load_per_hour[t] * prices[t] for t in range(T))
    prob += peak_weight * peak_var + (1 - peak_weight) * total_cost

    # Peak constraint: peak_var >= load[t] for all t
    for t in range(T):
        prob += peak_var >= load_per_hour[t]

    for i, load in enumerate(loads):
        eff_deferral = load.max_deferral_h + extra_deferral

        # Time-window constraint: cannot run outside [earliest_start, latest_finish)
        for t in range(T):
            if t < load.earliest_start or t >= load.latest_finish:
                prob += x[(i, t)] == 0

        # Duration constraint: must run for exactly duration_h hours
        prob += pulp.lpSum(x[(i, t)] for t in range(T)) == load.duration_h

        # Contiguity constraint (non-preemptable): consecutive hours only
        if not load.preemptable and load.duration_h > 1:
            for t in range(T - load.duration_h + 1):
                # If load starts at t, all hours t .. t+duration_h-1 must be 1
                for d in range(1, load.duration_h):
                    prob += x[(i, t + d)] >= x[(i, t)] - pulp.lpSum(
                        x[(i, t + dd)] for dd in range(d)
                    )

        # Max deferral constraint
        if load.original_start is not None:
            earliest_allowed = max(load.earliest_start, load.original_start - eff_deferral)
            latest_allowed = min(
                load.latest_finish - load.duration_h,
                load.original_start + eff_deferral,
            )
            for t in range(T):
                if t < earliest_allowed or t > latest_allowed:
                    prob += x[(i, t)] == 0

    # Solve (suppress solver output)
    solver = pulp.PULP_CBC_CMD(msg=False)
    status = prob.solve(solver)

    if pulp.LpStatus[status] != "Optimal":
        return None

    # Extract schedule and build optimised profile
    schedule: dict[str, int] = {}
    opt_profile = forecast_profile.copy().astype(float)

    for i, load in enumerate(loads):
        for t in range(T):
            if pulp.value(x[(i, t)]) and pulp.value(x[(i, t)]) > 0.5:
                # Record first active hour as the start
                if load.name not in schedule:
                    schedule[load.name] = t
                opt_profile[t] += load.power_kw

    return schedule, opt_profile


def _build_baseline_profile(
    forecast_profile: np.ndarray,
    loads: list[FlexibleLoad],
) -> np.ndarray:
    """Add flexible loads to the forecast at their original_start (if set)."""
    profile = forecast_profile.copy().astype(float)
    for load in loads:
        if load.original_start is not None:
            for d in range(load.duration_h):
                t = (load.original_start + d) % 24
                profile[t] += load.power_kw
    return profile


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    load_config()
    import pathlib
    project_root = pathlib.Path(__file__).resolve().parents[2]
    features_path = project_root / get_param("paths.features_parquet")

    # Use a simple flat-profile test if features aren't available yet
    try:
        import pandas as pd
        df = pd.read_parquet(features_path)
        example_forecast = df[get_param("data.target_column")].iloc[:24].values
    except FileNotFoundError:
        example_forecast = np.array([
            0.5, 0.4, 0.3, 0.3, 0.4, 0.6, 1.0, 1.4, 1.6, 1.8,
            2.0, 2.1, 1.9, 1.7, 1.6, 1.8, 2.2, 2.5, 2.4, 2.0,
            1.6, 1.2, 0.9, 0.6,
        ])

    result = optimise(example_forecast)
    print(f"Feasible: {result.feasible}")
    print(f"Schedule: {result.schedule}")
    print(f"Peak reduction: {result.peak_reduction_kw:.3f} kW ({result.peak_reduction_pct:.1f}%)")
    print(f"Cost change: EUR {result.cost_change_eur:.3f} ({result.cost_change_pct:.1f}%)")
