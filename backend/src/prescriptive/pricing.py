"""
src.prescriptive.pricing
========================
Time-of-use (TOU) tariff schedule and hourly cost computation.

A synthetic 3-tier TOU schedule is defined in ``configs/params.yaml`` under
``pricing``.  The three tiers are:
    - Off-peak  : 10 PM – 7 AM  (lowest rate)
    - Mid-peak  : 7–10 AM, 8–10 PM
    - On-peak   : 10 AM – 8 PM  (highest rate)

Functions
---------
get_tou_rate(hour)              : Return the EUR/kWh rate for a given hour.
build_hourly_price_vector(n)    : 24-element or n-element price array.
compute_cost(power_kw, prices)  : Daily cost given a kW profile.

Usage::

    from src.prescriptive.pricing import get_tou_rate, compute_cost
"""

from __future__ import annotations

import numpy as np

from src.skills.config_loader import get_param, load_config


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_tou_rate(hour: int) -> float:
    """Return the TOU electricity rate for a given hour of the day.

    Parameters
    ----------
    hour : int
        Hour of day in 0-23 range (24-hour clock).

    Returns
    -------
    float
        Rate in EUR/kWh.
    """
    pricing: dict = get_param("pricing")
    for tier_name, tier in pricing["tiers"].items():
        for start, end in tier["hours"]:
            if start <= hour <= end:
                return float(tier["rate_per_kwh"])
    # Fallback to off-peak (should never reach here if config covers all hours)
    return float(pricing["tiers"]["off_peak"]["rate_per_kwh"])


def build_hourly_price_vector(n_hours: int = 24) -> np.ndarray:
    """Build an array of TOU rates for ``n_hours`` consecutive hours.

    Parameters
    ----------
    n_hours : int
        Number of hours (default 24 for a full day).

    Returns
    -------
    np.ndarray
        Shape ``(n_hours,)`` with EUR/kWh rates.
    """
    return np.array([get_tou_rate(h % 24) for h in range(n_hours)])


def compute_cost(power_kw: np.ndarray, prices: np.ndarray) -> float:
    """Compute total electricity cost for a given hourly power profile.

    Parameters
    ----------
    power_kw : np.ndarray
        Hourly average power in kW (shape ``(n,)``).
    prices : np.ndarray
        Hourly electricity prices in EUR/kWh (shape ``(n,)``).
        Must be the same length as ``power_kw``.

    Returns
    -------
    float
        Total cost in EUR.  (cost = sum(power_kw * prices * 1 hour))
    """
    if len(power_kw) != len(prices):
        raise ValueError(
            f"power_kw length ({len(power_kw)}) must match prices length ({len(prices)})."
        )
    return float(np.dot(power_kw, prices))


def get_tier_label(hour: int) -> str:
    """Return the tier name ('off_peak', 'mid_peak', 'on_peak') for an hour.

    Parameters
    ----------
    hour : int
        Hour of day (0-23).

    Returns
    -------
    str
    """
    pricing: dict = get_param("pricing")
    for tier_name, tier in pricing["tiers"].items():
        for start, end in tier["hours"]:
            if start <= hour <= end:
                return tier_name
    return "off_peak"


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    load_config()
    prices = build_hourly_price_vector()
    print("Hourly TOU rates (EUR/kWh):")
    for h, p in enumerate(prices):
        print(f"  {h:02d}:00  {p:.3f}  [{get_tier_label(h)}]")

    # Example: 2 kW flat profile all day
    example_power = np.full(24, 2.0)
    cost = compute_cost(example_power, prices)
    print(f"\nDaily cost for 2 kW flat load: EUR {cost:.2f}")
