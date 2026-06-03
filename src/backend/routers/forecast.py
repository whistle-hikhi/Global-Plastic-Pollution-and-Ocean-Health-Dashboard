from fastapi import APIRouter, Query
import numpy as np
import warnings

router = APIRouter(prefix="/api/ohi/forecast", tags=["forecast"])

MODELS = ["linear", "polynomial", "holt_winters", "arima"]


# ── helpers ────────────────────────────────────────────────────────────────

def _ci_band(preds, std, n=1.28):
    """80 % CI from residual std."""
    return [
        {"year": int(yr), "value": round(float(p), 2),
         "lower": round(float(max(0, p - n * std)), 2),
         "upper": round(float(min(100, p + n * std)), 2)}
        for yr, p in preds
    ]

def _metrics(y_true, y_pred):
    y_true, y_pred = np.array(y_true), np.array(y_pred)
    ss_res = np.sum((y_true - y_pred) ** 2)
    ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
    r2 = float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0
    mae = float(np.mean(np.abs(y_true - y_pred)))
    return {"r2": round(r2, 3), "mae": round(mae, 3)}


# ── model implementations ──────────────────────────────────────────────────

def _linear(years, values, horizon):
    from sklearn.linear_model import LinearRegression
    X = np.array(years).reshape(-1, 1)
    y = np.array(values)
    m = LinearRegression().fit(X, y)
    fitted = m.predict(X)
    std = np.std(y - fitted)
    future = list(range(max(years) + 1, max(years) + horizon + 1))
    preds = m.predict(np.array(future).reshape(-1, 1))
    return _ci_band(zip(future, np.clip(preds, 0, 100)), std), _metrics(y, fitted)


def _polynomial(years, values, horizon, degree=2):
    from sklearn.linear_model import LinearRegression
    from sklearn.preprocessing import PolynomialFeatures
    X = np.array(years).reshape(-1, 1)
    y = np.array(values)
    poly = PolynomialFeatures(degree=degree)
    m = LinearRegression().fit(poly.fit_transform(X), y)
    fitted = m.predict(poly.transform(X))
    std = np.std(y - fitted)
    future = list(range(max(years) + 1, max(years) + horizon + 1))
    preds = m.predict(poly.transform(np.array(future).reshape(-1, 1)))
    return _ci_band(zip(future, np.clip(preds, 0, 100)), std), _metrics(y, fitted)


def _holt_winters(years, values, horizon):
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    y = np.array(values)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        m = ExponentialSmoothing(y, trend="add", damped_trend=True).fit(optimized=True)
    preds = np.clip(m.forecast(horizon), 0, 100)
    std = float(np.std(m.resid))
    future = list(range(max(years) + 1, max(years) + horizon + 1))
    fitted = m.fittedvalues
    return _ci_band(zip(future, preds), std), _metrics(y, fitted)


def _arima(years, values, horizon):
    from statsmodels.tsa.arima.model import ARIMA
    y = np.array(values, dtype=float)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        m = ARIMA(y, order=(1, 1, 1)).fit()
    fc = m.get_forecast(steps=horizon)
    preds = np.clip(fc.predicted_mean, 0, 100)
    ci = np.array(fc.conf_int(alpha=0.2))   # 80% CI — numpy-safe
    future = list(range(max(years) + 1, max(years) + horizon + 1))
    rows = [
        {"year": int(yr), "value": round(float(p), 2),
         "lower": round(float(max(0, ci[i, 0])), 2),
         "upper": round(float(min(100, ci[i, 1])), 2)}
        for i, (yr, p) in enumerate(zip(future, preds))
    ]
    fitted = m.fittedvalues
    met = _metrics(y[1:], fitted[1:])    # ARIMA loses first obs
    return rows, met


_DISPATCH = {
    "linear": _linear,
    "polynomial": _polynomial,
    "holt_winters": _holt_winters,
    "arima": _arima,
}

_MODEL_LABELS = {
    "linear": "Linear Regression",
    "polynomial": "Polynomial (degree 2)",
    "holt_winters": "Holt-Winters",
    "arima": "ARIMA(1,1,1)",
}


# ── endpoint ────────────────────────────────────────────────────────────────

@router.get("")
def get_forecast(
    region_id: int = 0,
    model: str = "linear",
    horizon: int = 5,
    goal: str = "Index",
    dimension: str = "score",
):
    import routers.ocean_health as _ohi
    _df = _ohi._df

    if model not in _DISPATCH:
        return {"error": f"Unknown model '{model}'. Choose from {MODELS}.",
                "forecast": [], "metrics": {}}

    mask = (_df["goal"] == goal) & (_df["dimension"] == dimension) & (_df["region_id"] == region_id)
    sub = _df[mask][["year", "value"]].sort_values("year").dropna()

    if len(sub) < 5:
        return {"error": "Insufficient historical data (need ≥ 5 years).",
                "forecast": [], "metrics": {}}

    years = sub["year"].tolist()
    values = sub["value"].tolist()

    try:
        forecast, metrics = _DISPATCH[model](years, values, horizon)
        return {
            "model": model,
            "model_label": _MODEL_LABELS[model],
            "region_id": region_id,
            "forecast": forecast,
            "metrics": metrics,
        }
    except Exception as e:
        return {"error": str(e), "forecast": [], "metrics": {}}


@router.get("/models")
def list_models():
    return [{"id": k, "label": v} for k, v in _MODEL_LABELS.items()]
