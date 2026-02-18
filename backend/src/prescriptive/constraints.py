"""
src.prescriptive.constraints
============================
Flexible-load dataclass definitions and default appliance configurations.

A ``FlexibleLoad`` represents an appliance that can be scheduled at any
feasible start time within a [earliest_start, latest_finish) window,
subject to a maximum deferral limit and optionally to contiguity constraints
(non-preemptable loads must run in consecutive hours).

Default loads are read from ``configs/params.yaml`` under
``prescriptive.default_loads``.

Usage::

    from src.prescriptive.constraints import FlexibleLoad, get_default_loads
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from src.skills.config_loader import get_param, load_config


@dataclass
class FlexibleLoad:
    """Represents an appliance with flexible scheduling constraints.

    Attributes
    ----------
    name : str
        Human-readable appliance name (e.g. "Dishwasher").
    duration_h : int
        Required runtime in whole hours.
    power_kw : float
        Average power draw during operation (kW).
    earliest_start : int
        Earliest allowed start hour of day (0-23, inclusive).
    latest_finish : int
        Latest allowed finish hour of day (1-24, inclusive).
        The load must complete by this hour; it cannot start after
        ``latest_finish - duration_h``.
    preemptable : bool
        If ``False``, the load must run in ``duration_h`` contiguous hours.
        If ``True``, it may be split across non-consecutive hours.
    max_deferral_h : int
        Maximum number of hours the original scheduled start may be shifted.
    original_start : int | None
        Desired start hour (before optimisation).  If ``None``, the
        optimiser is free to place the load anywhere within the window.
    """

    name: str
    duration_h: int
    power_kw: float
    earliest_start: int
    latest_finish: int
    preemptable: bool = False
    max_deferral_h: int = 6
    original_start: Optional[int] = None

    def feasible_starts(self) -> list[int]:
        """Return all feasible start hours given window and duration.

        Returns
        -------
        list[int]
            Start hours h such that the load can complete within the window:
            earliest_start <= h <= latest_finish - duration_h.
        """
        max_start = self.latest_finish - self.duration_h
        return list(range(self.earliest_start, max_start + 1))

    def energy_kwh(self) -> float:
        """Total energy consumed in one scheduling period (kWh)."""
        return self.power_kw * self.duration_h

    def __repr__(self) -> str:
        return (
            f"FlexibleLoad({self.name!r}, {self.duration_h}h, "
            f"{self.power_kw}kW, window=[{self.earliest_start},{self.latest_finish}))"
        )


def get_default_loads() -> list[FlexibleLoad]:
    """Return the default flexible appliance list from params.yaml.

    Returns
    -------
    list[FlexibleLoad]
        Configured in ``prescriptive.default_loads``.
    """
    raw: dict = get_param("prescriptive.default_loads")
    loads: list[FlexibleLoad] = []
    for name, cfg in raw.items():
        earliest = int(cfg["earliest_start"])
        loads.append(
            FlexibleLoad(
                name=name,
                duration_h=int(cfg["duration_h"]),
                power_kw=float(cfg["power_kw"]),
                earliest_start=earliest,
                latest_finish=int(cfg["latest_finish"]),
                preemptable=bool(cfg.get("preemptable", False)),
                max_deferral_h=int(cfg.get("max_deferral_h", 6)),
                original_start=int(cfg["original_start"]) if "original_start" in cfg else None,
            )
        )
    return loads


if __name__ == "__main__":
    load_config()
    for load in get_default_loads():
        print(load)
        print(f"  Feasible starts: {load.feasible_starts()}")
        print(f"  Energy: {load.energy_kwh():.2f} kWh")
