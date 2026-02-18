"""
src.models
==========
Forecasting models sub-package.

Modules
-------
base        : Abstract ``Forecaster`` base class.
baseline    : Seasonal-naive benchmark (y(t) = y(t-168)).
ridge       : Direct multi-step Ridge regression (24 independent models).
xgb         : Direct multi-step XGBoost (24 independent models, primary).
evaluate    : Rolling-window backtesting harness and metric computation.
conformal   : Conformal prediction intervals (90 % coverage target).
explain     : SHAP-based feature-importance analysis.
"""
