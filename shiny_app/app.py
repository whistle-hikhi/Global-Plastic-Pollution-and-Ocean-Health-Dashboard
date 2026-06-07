"""
=============================================================================
 Global Plastic Pollution & Ocean Health — Python Shiny Dashboard
=============================================================================
"""
from __future__ import annotations

import os, io, zipfile, tempfile, shutil, warnings
from pathlib import Path

import numpy as np
import pandas as pd
import geopandas as gpd
from sklearn.cluster import KMeans
from shiny import App, Inputs, Outputs, Session, ui, render, reactive
from shinywidgets import output_widget, render_plotly
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots

# ─────────────────────────────────────────────────────────────────────────────
#  PATHS
# ─────────────────────────────────────────────────────────────────────────────
HERE     = Path(__file__).parent
DATA_DIR = (HERE / ".." / "data").resolve()
NE_CACHE = (HERE / ".." / "src" / "backend" / "routers" / "_ne_countries_110m.zip").resolve()

# ─────────────────────────────────────────────────────────────────────────────
#  THEME TOKENS
# ─────────────────────────────────────────────────────────────────────────────
BG      = "#080d1a"
SURF    = "#0d1526"
SURF2   = "#111e35"
BORDER  = "#1a3355"
ACCENT  = "#00d4ff"
GREEN   = "#00ff88"
CORAL   = "#ff6b35"
TEXT    = "#e2e8f0"
MUTED   = "#7890a8"
OCEAN   = "#050c16"
LAND    = "#0d1e30"
COAST   = "#1a3050"
YELLOW  = "#ffd166"

_CLUSTER_COLORS = [
    "#00d4ff","#00ff88","#ff6b35","#ffd166","#c77dff",
    "#ff4da6","#4dffdb","#ff9f1c","#7bf1a8","#f72585",
]

def _geo_base():
    return dict(
        bgcolor=BG, lakecolor=OCEAN, landcolor=LAND,
        oceancolor=OCEAN, showocean=True, showlakes=True,
        showcoastlines=True, coastlinecolor=COAST, showland=True,
        projection_type="natural earth", showframe=False,
        lataxis_showgrid=False, lonaxis_showgrid=False,
    )

def _layout(**kw):
    base = dict(
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color=TEXT, family="'Inter','Segoe UI',sans-serif", size=12),
        margin=dict(l=10, r=10, t=40, b=10),
        legend=dict(
            bgcolor="rgba(8,13,26,0.88)", bordercolor=BORDER,
            borderwidth=1, font=dict(color=TEXT, size=11),
        ),
        xaxis=dict(
            gridcolor=BORDER, zerolinecolor=BORDER,
            tickfont=dict(color=MUTED), title_font=dict(color=TEXT),
        ),
        yaxis=dict(
            gridcolor=BORDER, zerolinecolor=BORDER,
            tickfont=dict(color=MUTED), title_font=dict(color=TEXT),
        ),
    )
    base.update(kw)
    return base


# ─────────────────────────────────────────────────────────────────────────────
#  DATA LOADING
# ─────────────────────────────────────────────────────────────────────────────

def _load_plastic() -> pd.DataFrame:
    zip_path = DATA_DIR / "mismanaged-plastic-waste-per-capita.zip"
    with zipfile.ZipFile(zip_path) as z:
        csv_name = [n for n in z.namelist() if n.endswith(".csv")][0]
        with z.open(csv_name) as f:
            df = pd.read_csv(f)
    df.columns = ["entity", "code", "year", "value"]
    df = df[~df["code"].str.startswith("OWID_", na=False)]
    df = df.dropna(subset=["code", "value"])
    return df


def _load_rivers() -> tuple[pd.DataFrame, list[dict]]:
    zip_path = DATA_DIR / "Meijer2021_midpoint_emissions.zip"
    tmp = tempfile.mkdtemp()
    try:
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(tmp)
        shp = os.path.join(tmp, "Meijer2021_midpoint_emissions.shp")
        gdf = gpd.read_file(shp)
        gdf = gdf[gdf["dots_exten"] > 0].copy()
        gdf["lon"] = gdf.geometry.x
        gdf["lat"] = gdf.geometry.y
        gdf = gdf.sort_values("dots_exten", ascending=False).reset_index(drop=True)

        world = gpd.read_file(NE_CACHE)[["NAME","ISO_A3","CONTINENT","geometry"]]
        world.columns = ["country","iso3","continent","geometry"]
        gdf_wgs = gdf[["dots_exten","lat","lon","geometry"]].copy()
        gdf_wgs = gdf_wgs.set_crs("EPSG:4326", allow_override=True)
        world = world.to_crs("EPSG:4326")

        joined = gpd.sjoin(gdf_wgs, world, how="left", predicate="within")
        joined = joined[~joined.index.duplicated(keep="first")].sort_index()
        joined["country"]   = joined["country"].fillna("Unknown")
        joined["continent"] = joined["continent"].fillna("Unknown")
        joined["iso3"]      = joined["iso3"].fillna("")

        coords = joined[["lat","lon"]].values
        emissions_arr = joined["dots_exten"].values
        weights = np.sqrt(np.maximum(emissions_arr, 1e-6))
        km = KMeans(n_clusters=10, random_state=42, n_init="auto")
        km.fit(coords, sample_weight=weights)
        labels = km.labels_.astype(int)
        joined["cluster_id"] = labels

        total_em = float(emissions_arr.sum())

        # build cluster summaries
        clusters = []
        for cid in range(10):
            mask = joined["cluster_id"] == cid
            sub = joined[mask]
            if len(sub) == 0:
                continue
            em = sub["dots_exten"].values
            center_lat = float(np.average(sub["lat"].values, weights=em))
            center_lon = float(np.average(sub["lon"].values, weights=em))
            cluster_em = float(em.sum())
            valid = sub[sub["country"] != "Unknown"]
            ca = valid.groupby("country")["dots_exten"].sum()
            dom = ca.idxmax() if len(ca) else f"Region {cid}"
            top3 = ca.nlargest(3).reset_index()
            top_countries = [
                {"country": r["country"], "emissions": round(float(r["dots_exten"]), 1)}
                for _, r in top3.iterrows()
            ]
            skip = {"Unknown","Seven seas (open ocean)","Antarctica"}
            vc = sub[~sub["continent"].isin(skip)]
            cont_agg = vc.groupby("continent")["dots_exten"].sum()
            continent = cont_agg.idxmax() if len(cont_agg) else "Unknown"
            clusters.append({
                "id": cid,
                "label": dom,
                "center_lat": round(center_lat, 3),
                "center_lon": round(center_lon, 3),
                "total_emissions": round(cluster_em, 1),
                "point_count": int(len(sub)),
                "emission_pct": round(cluster_em / total_em * 100, 1),
                "continent": continent,
                "top_countries": top_countries,
                "color": _CLUSTER_COLORS[cid % len(_CLUSTER_COLORS)],
            })
        clusters.sort(key=lambda x: x["total_emissions"], reverse=True)

        id_to_rank = {c["id"]: rank for rank, c in enumerate(clusters)}
        rivers_df = joined[["lat","lon","dots_exten","country","continent","cluster_id"]].copy()
        rivers_df = rivers_df.rename(columns={"dots_exten": "emissions"})
        rivers_df["cluster_rank"] = rivers_df["cluster_id"].map(id_to_rank)

        # build by-country
        by_country = (
            joined[joined["country"] != "Unknown"]
            .groupby(["country","continent","iso3"])
            .agg(total_emissions=("dots_exten","sum"), point_count=("dots_exten","count"))
            .reset_index()
            .sort_values("total_emissions", ascending=False)
        )

        return rivers_df.reset_index(drop=True), clusters, by_country

    finally:
        shutil.rmtree(tmp)


def _load_ohi() -> tuple[pd.DataFrame, list[dict]]:
    csv_path = DATA_DIR / "scores.csv"
    df = pd.read_csv(csv_path)
    df.columns = ["year","goal","long_goal","dimension","region_id","region_name","value"]
    df["year"]      = df["year"].astype(int)
    df["region_id"] = df["region_id"].astype(int)
    df = df.dropna(subset=["value"])
    goal_df = df[["goal","long_goal"]].drop_duplicates().sort_values("goal")
    goals = goal_df.to_dict(orient="records")
    return df, goals


# ─────────────────────────────────────────────────────────────────────────────
#  FORECAST HELPERS (same logic as backend)
# ─────────────────────────────────────────────────────────────────────────────

def _ci_band(preds, std, n=1.28):
    return [
        {"year": int(yr), "value": float(p),
         "lower": float(max(0, p - n*std)),
         "upper": float(min(100, p + n*std))}
        for yr, p in preds
    ]

def _metrics(y_true, y_pred):
    y_true, y_pred = np.array(y_true), np.array(y_pred)
    ss_res = np.sum((y_true - y_pred)**2)
    ss_tot = np.sum((y_true - np.mean(y_true))**2)
    r2  = float(1 - ss_res/ss_tot) if ss_tot > 0 else 0.0
    mae = float(np.mean(np.abs(y_true - y_pred)))
    return round(r2, 3), round(mae, 3)

def _run_forecast(years, values, model, horizon=5):
    from sklearn.linear_model import LinearRegression
    from sklearn.preprocessing import PolynomialFeatures
    years = list(years); values = list(values)
    X = np.array(years).reshape(-1,1)
    y = np.array(values)
    future_yrs = list(range(max(years)+1, max(years)+horizon+1))

    if model == "linear":
        m = LinearRegression().fit(X, y)
        fitted = m.predict(X)
        std = float(np.std(y - fitted))
        preds = np.clip(m.predict(np.array(future_yrs).reshape(-1,1)), 0, 100)
        rows = _ci_band(zip(future_yrs, preds), std)
        r2, mae = _metrics(y, fitted)

    elif model == "polynomial":
        poly = PolynomialFeatures(degree=2)
        Xp = poly.fit_transform(X)
        m = LinearRegression().fit(Xp, y)
        fitted = m.predict(Xp)
        std = float(np.std(y - fitted))
        preds = np.clip(m.predict(poly.transform(np.array(future_yrs).reshape(-1,1))), 0, 100)
        rows = _ci_band(zip(future_yrs, preds), std)
        r2, mae = _metrics(y, fitted)

    elif model == "holt_winters":
        from statsmodels.tsa.holtwinters import ExponentialSmoothing
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            hw = ExponentialSmoothing(y, trend="add", damped_trend=True).fit(optimized=True)
        preds = np.clip(hw.forecast(horizon), 0, 100)
        std = float(np.std(hw.resid))
        rows = _ci_band(zip(future_yrs, preds), std)
        r2, mae = _metrics(y, hw.fittedvalues)

    elif model == "arima":
        from statsmodels.tsa.arima.model import ARIMA
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            am = ARIMA(y.astype(float), order=(1,1,1)).fit()
        fc = am.get_forecast(steps=horizon)
        preds = np.clip(fc.predicted_mean, 0, 100)
        ci = np.array(fc.conf_int(alpha=0.2))
        rows = [
            {"year": int(yr), "value": float(p),
             "lower": float(max(0, ci[i,0])), "upper": float(min(100, ci[i,1]))}
            for i, (yr, p) in enumerate(zip(future_yrs, preds))
        ]
        r2, mae = _metrics(y[1:], am.fittedvalues[1:])

    elif model == "prophet":
        import pandas as _pd
        from prophet import Prophet
        df_p = _pd.DataFrame({"ds": _pd.to_datetime([str(y_) for y_ in years]), "y": values})
        pm = Prophet(yearly_seasonality=False, weekly_seasonality=False,
                     daily_seasonality=False, changepoint_prior_scale=0.3, interval_width=0.80)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            pm.fit(df_p)
        future = pm.make_future_dataframe(periods=horizon, freq="YE")
        fc = pm.predict(future)
        fitted = fc["yhat"].values[:len(years)]
        rows = [
            {"year": int(row["ds"].year),
             "value": float(np.clip(row["yhat"], 0, 100)),
             "lower": float(max(0, row["yhat_lower"])),
             "upper": float(min(100, row["yhat_upper"]))}
            for _, row in fc.tail(horizon).iterrows()
        ]
        r2, mae = _metrics(y, fitted)

    else:
        raise ValueError(f"Unknown model: {model}")

    return rows, r2, mae


# ─────────────────────────────────────────────────────────────────────────────
#  STARTUP: LOAD ALL DATA
# ─────────────────────────────────────────────────────────────────────────────
print("Loading plastic waste data …")
PLASTIC_DF = _load_plastic()

print("Loading river emissions data (this may take ~30 s) …")
RIVERS_DF, RIVER_CLUSTERS, RIVERS_BY_COUNTRY = _load_rivers()

print("Loading Ocean Health Index data …")
OHI_DF, OHI_GOALS = _load_ohi()

PLASTIC_YEARS   = sorted(PLASTIC_DF["year"].unique())
PLASTIC_COUNTRIES = sorted(PLASTIC_DF["entity"].dropna().unique().tolist())
OHI_YEARS       = sorted(OHI_DF["year"].unique())

# Region list for Act III dropdown
_region_opts = (
    OHI_DF[OHI_DF["region_id"] != 0][["region_id","region_name"]]
    .drop_duplicates()
    .sort_values("region_name")
)
REGION_CHOICES = {"0": "🌍 Global Average"} | {
    str(r["region_id"]): r["region_name"]
    for _, r in _region_opts.iterrows()
}

GOAL_CHOICES = {g["goal"]: g["long_goal"] for g in OHI_GOALS}

MODEL_CHOICES = {
    "linear":       "Linear Regression",
    "polynomial":   "Polynomial (Degree 2)",
    "holt_winters": "Holt-Winters",
    "arima":        "ARIMA(1,1,1)",
}

print("Data loaded. Starting Shiny app …\n")


# ─────────────────────────────────────────────────────────────────────────────
#  CSS
# ─────────────────────────────────────────────────────────────────────────────
CSS = """
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

:root {
  --bg:       #080d1a;
  --surf:     #0d1526;
  --surf2:    #111e35;
  --border:   #1a3355;
  --accent:   #00d4ff;
  --green:    #00ff88;
  --coral:    #ff6b35;
  --yellow:   #ffd166;
  --text:     #e2e8f0;
  --muted:    #7890a8;
  --radius:   12px;
  --glow:     0 0 20px rgba(0,212,255,0.18);
}

/* ── Reset & base ── */
*, *::before, *::after { box-sizing: border-box; }

html, body {
  background: var(--bg) !important;
  color: var(--text) !important;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
  min-height: 100vh;
  overflow-x: hidden;
}

/* Subtle ocean noise gradient */
body::before {
  content: '';
  position: fixed; inset: 0; z-index: -1;
  background:
    radial-gradient(ellipse 80% 60% at 15% 50%, rgba(0,100,180,.07) 0%, transparent 70%),
    radial-gradient(ellipse 60% 40% at 85% 20%, rgba(0,212,255,.04) 0%, transparent 60%),
    radial-gradient(ellipse 40% 30% at 50% 90%, rgba(0,255,136,.03) 0%, transparent 60%);
}

/* ── Navbar ── */
.navbar {
  background: linear-gradient(135deg, #050a18 0%, #0a1428 50%, #0d1e38 100%) !important;
  border-bottom: 1px solid var(--border) !important;
  box-shadow: 0 2px 20px rgba(0,0,0,.5), 0 1px 0 rgba(0,212,255,.12) !important;
  padding: 0 1.5rem !important;
}
.navbar .navbar-brand {
  font-size: 1.15rem !important;
  font-weight: 700 !important;
  color: var(--text) !important;
  letter-spacing: -0.02em;
  display: flex; align-items: center; gap: .5rem;
}
.navbar-brand span.brand-icon {
  font-size: 1.4rem;
  filter: drop-shadow(0 0 8px rgba(0,212,255,.6));
}
.navbar-nav .nav-link {
  color: var(--muted) !important;
  font-weight: 500;
  font-size: .9rem;
  padding: .75rem 1.1rem !important;
  border-radius: 8px;
  margin: .25rem .1rem;
  transition: all .2s ease;
  letter-spacing: .01em;
}
.navbar-nav .nav-link:hover {
  color: var(--text) !important;
  background: rgba(0,212,255,.08) !important;
}
.navbar-nav .nav-link.active {
  color: var(--accent) !important;
  background: rgba(0,212,255,.12) !important;
  box-shadow: inset 0 -2px 0 var(--accent);
}

/* ── Sidebar ── */
.bslib-sidebar-layout > .sidebar {
  background: rgba(13,21,38,.97) !important;
  border-right: 1px solid var(--border) !important;
  padding: 1.25rem !important;
  overflow-y: auto;
}
.sidebar-panel, .bslib-sidebar { max-height: 100vh; }

/* ── Cards ── */
.card, .bslib-card {
  background: rgba(13,21,38,.85) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius) !important;
  box-shadow: 0 4px 24px rgba(0,0,0,.4), var(--glow) !important;
  backdrop-filter: blur(12px);
  color: var(--text) !important;
  overflow: hidden;
}
.card-header, .bslib-card .card-header {
  background: rgba(17,30,53,.9) !important;
  border-bottom: 1px solid var(--border) !important;
  font-weight: 600 !important;
  font-size: .9rem !important;
  color: var(--text) !important;
  padding: .75rem 1rem !important;
  letter-spacing: .01em;
}

/* ── Value boxes ── */
.value-box {
  background: rgba(13,21,38,.9) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius) !important;
  box-shadow: 0 4px 16px rgba(0,0,0,.35) !important;
}
.value-box .value-box-value {
  font-size: 1.6rem !important;
  font-weight: 700 !important;
}
.value-box .value-box-title { font-size: .8rem !important; opacity: .8 !important; }

/* ── Form controls ── */
.form-control, .form-select {
  background: var(--surf2) !important;
  border: 1px solid var(--border) !important;
  color: var(--text) !important;
  border-radius: 8px !important;
  font-size: .875rem !important;
  transition: border-color .2s, box-shadow .2s;
}
.form-control:focus, .form-select:focus {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 3px rgba(0,212,255,.15) !important;
  outline: none !important;
  background: var(--surf2) !important;
}
.form-control::placeholder { color: var(--muted) !important; }
.form-control option, .form-select option {
  background: var(--surf2); color: var(--text);
}

/* ── Selectize (multi-select tags) ── */
.selectize-control .selectize-input {
  background: var(--surf2) !important;
  border: 1px solid var(--border) !important;
  border-radius: 8px !important;
  color: var(--text) !important;
  box-shadow: none !important;
  padding: 5px 8px !important;
}
.selectize-control .selectize-input.focus {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 3px rgba(0,212,255,.15) !important;
}
.selectize-control .selectize-input input {
  color: var(--text) !important;
}
.selectize-control .selectize-input input::placeholder { color: var(--muted) !important; }
.selectize-dropdown {
  background: var(--surf2) !important;
  border: 1px solid var(--border) !important;
  border-radius: 8px !important;
  box-shadow: 0 8px 24px rgba(0,0,0,.5) !important;
  color: var(--text) !important;
}
.selectize-dropdown .option {
  color: var(--text) !important;
  padding: 6px 10px !important;
  font-size: .875rem !important;
}
.selectize-dropdown .option:hover,
.selectize-dropdown .option.active {
  background: rgba(0,212,255,.12) !important;
  color: var(--accent) !important;
}
.selectize-control .item {
  background: rgba(0,212,255,.15) !important;
  border: 1px solid rgba(0,212,255,.3) !important;
  color: var(--accent) !important;
  border-radius: 4px !important;
  font-size: .8rem !important;
  font-weight: 500 !important;
}
.selectize-control .item .remove {
  color: var(--accent) !important;
  border-left: 1px solid rgba(0,212,255,.3) !important;
}

/* ── Labels ── */
.form-label, label {
  color: var(--muted) !important;
  font-size: .8rem !important;
  font-weight: 500 !important;
  text-transform: uppercase;
  letter-spacing: .07em;
  margin-bottom: .3rem !important;
}

/* ── Sliders (ionRangeSlider) ── */
.irs--shiny .irs-bar { background: var(--accent) !important; border-color: var(--accent) !important; }
.irs--shiny .irs-bar--single { background: var(--accent) !important; }
.irs--shiny .irs-handle { background: var(--accent) !important; border: 2px solid #fff !important;
  box-shadow: 0 0 10px rgba(0,212,255,.5) !important; }
.irs--shiny .irs-handle > i { display: none !important; }
.irs--shiny .irs-from, .irs--shiny .irs-to, .irs--shiny .irs-single {
  background: var(--surf2) !important;
  color: var(--accent) !important;
  border: 1px solid var(--border) !important;
  border-radius: 6px !important;
  font-size: .8rem !important;
  font-weight: 600;
}
.irs--shiny .irs-line { background: var(--border) !important; }
.irs--shiny .irs-grid-text { color: var(--muted) !important; font-size: .7rem !important; }
.irs--shiny .irs-min, .irs--shiny .irs-max { color: var(--muted) !important; font-size: .7rem !important; }

/* ── Typography ── */
h1, h2, h3, h4, h5, h6 { color: var(--text) !important; }
p, span, div { color: inherit; }

/* ── Divider ── */
hr {
  border-color: var(--border) !important;
  opacity: .6 !important;
  margin: .75rem 0 !important;
}

/* ── Act section heading ── */
.act-heading {
  display: flex; align-items: center; gap: .6rem;
  margin-bottom: 1rem;
  padding-bottom: .5rem;
  border-bottom: 1px solid var(--border);
}
.act-heading .act-icon {
  width: 32px; height: 32px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.act-heading h4 {
  margin: 0 !important;
  font-size: 1rem !important;
  font-weight: 600 !important;
  color: var(--text) !important;
}
.act-heading small {
  display: block;
  font-size: .75rem;
  color: var(--muted);
  font-weight: 400;
}

/* ── KPI stat card ── */
.stat-card {
  background: var(--surf2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: .7rem .9rem;
  margin-bottom: .5rem;
  display: flex; flex-direction: column;
}
.stat-card .stat-label {
  font-size: .7rem;
  text-transform: uppercase;
  letter-spacing: .07em;
  color: var(--muted);
  margin-bottom: .15rem;
}
.stat-card .stat-value {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text);
  line-height: 1.2;
}
.stat-card .stat-sub {
  font-size: .75rem;
  color: var(--muted);
  margin-top: .1rem;
}

/* ── Cluster badge ── */
.cluster-badge {
  display: inline-flex; align-items: center; gap: .4rem;
  padding: .25rem .65rem;
  border-radius: 20px;
  font-size: .78rem; font-weight: 600;
  margin: .2rem .15rem;
  cursor: pointer;
  transition: transform .15s, box-shadow .15s;
  border: 1px solid transparent;
}
.cluster-badge:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,.3); }

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--surf); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #2a4575; }

/* ── Widget / plotly ── */
.shinywidget-output-plotly { border-radius: 8px; overflow: hidden; }
iframe.vega-embed-container { background: transparent !important; }

/* ── Tab content spacing ── */
.tab-content { padding: 0 !important; }
.tab-pane { padding: 0 !important; }

/* ── Sidebar layout ──
   All three acts: sidebar is sticky and scrolls internally;
   main content grows to its natural height and the page scrolls.   */
.bslib-sidebar-layout {
  /* let height be driven by content, not viewport */
  height: auto !important;
  min-height: calc(100vh - 58px);
  /* preserve the grid so sidebar stays on the left */
  display: grid !important;
}

/* Sidebar: pin to top, full viewport height, internal scroll */
.bslib-sidebar-layout > aside.sidebar,
.bslib-sidebar-layout > .sidebar {
  position: sticky !important;
  top: 0 !important;
  height: calc(100vh - 58px) !important;
  max-height: calc(100vh - 58px) !important;
  overflow-y: auto !important;
  align-self: start !important;
}

/* Main content: natural height, no fill stretching */
.bslib-sidebar-layout > .main {
  height: auto !important;
  overflow-y: visible !important;
  /* cards must not be squished by flex */
  display: flex !important;
  flex-direction: column !important;
  gap: 1rem;
  padding: 1rem;
}

/* Cards inside the main area never shrink below their content */
.bslib-sidebar-layout > .main .card,
.bslib-sidebar-layout > .main .bslib-card {
  flex-shrink: 0 !important;
  height: auto !important;
}

/* Remove fill-forcing on layout_columns children */
.bslib-sidebar-layout > .main .bslib-gap-spacing,
.bslib-sidebar-layout > .main .bslib-grid {
  height: auto !important;
  flex-shrink: 0 !important;
}

/* ── Loading spinner ── */
.recalculating { opacity: .6 !important; transition: opacity .2s; }
"""

# ─────────────────────────────────────────────────────────────────────────────
#  UI HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _act_heading(icon, color, title, subtitle=""):
    return ui.HTML(f"""
        <div class="act-heading">
          <div class="act-icon" style="background:rgba(0,0,0,.3);border:1px solid {color};color:{color}">
            {icon}
          </div>
          <div>
            <h4>{title}</h4>
            {'<small>' + subtitle + '</small>' if subtitle else ''}
          </div>
        </div>
    """)


def _stat_html(label, value, sub="", color=TEXT):
    return f"""
    <div class="stat-card">
      <div class="stat-label">{label}</div>
      <div class="stat-value" style="color:{color}">{value}</div>
      {'<div class="stat-sub">' + sub + '</div>' if sub else ''}
    </div>"""


# ─────────────────────────────────────────────────────────────────────────────
#  UI DEFINITION
# ─────────────────────────────────────────────────────────────────────────────

app_ui = ui.page_navbar(
    # ── HEAD ──────────────────────────────────────────────────────────────────
    ui.head_content(ui.tags.style(CSS)),

    # ══════════════════════════════════════════════════════════════════════════
    #  ACT I — PLASTIC CRISIS
    # ══════════════════════════════════════════════════════════════════════════
    ui.nav_panel(
        "Act I — Plastic Crisis",
        ui.layout_sidebar(
            ui.sidebar(
                _act_heading("♻️", CORAL, "Act I: Plastic Crisis",
                             "Mismanaged waste per capita"),
                ui.input_slider("p_year", "Year",
                                min=min(PLASTIC_YEARS), max=max(PLASTIC_YEARS),
                                value=2019, step=1, sep=""),
                ui.input_slider("p_top_n", "Top N Countries",
                                min=10, max=50, value=20, step=1),
                ui.input_selectize(
                    "p_countries", "Countries",
                    choices=PLASTIC_COUNTRIES,
                    multiple=True,
                    options={"placeholder": "All countries (type to filter)"},
                ),
                ui.hr(),
                ui.output_ui("kpi_plastic"),
                width=280,
            ),
            ui.layout_columns(
                ui.card(
                    ui.card_header("🗺 World Map — Mismanaged Plastic Waste per Capita (kg/person/yr)"),
                    output_widget("map_plastic"),
                    full_screen=True,
                ),
                col_widths=[12],
            ),
            ui.layout_columns(
                ui.card(
                    ui.card_header("📊 Top Countries by Plastic Waste"),
                    output_widget("bar_plastic"),
                ),
                col_widths=[12],
            ),
            fillable=False,
        ),
    ),

    # ══════════════════════════════════════════════════════════════════════════
    #  ACT II — RIVERS OF PLASTIC
    # ══════════════════════════════════════════════════════════════════════════
    ui.nav_panel(
        "Act II — Rivers",
        ui.layout_sidebar(
            ui.sidebar(
                _act_heading("🌊", ACCENT, "Act II: Rivers of Plastic",
                             "Meijer et al. 2021 river emissions"),
                ui.input_slider("r_top", "Rivers to show",
                                min=100, max=1000, value=500, step=50, sep=""),
                ui.input_slider("r_min_em", "Min Emissions (tonnes/yr)",
                                min=0, max=5000, value=0, step=100, sep=""),
                ui.hr(),
                ui.output_ui("kpi_rivers"),
                width=280,
            ),
            ui.layout_columns(
                ui.card(
                    ui.card_header("🗺 Global River Plastic Emission Points (K-Means Clustered)"),
                    output_widget("map_rivers"),
                    full_screen=True,
                ),
                col_widths=[12],
            ),
            ui.layout_columns(
                ui.card(
                    ui.card_header("🏭 Top Countries by River Emissions"),
                    output_widget("bar_rivers_country"),
                ),
                ui.card(
                    ui.card_header("🌍 Emissions by Continent"),
                    output_widget("bar_rivers_continent"),
                ),
                col_widths=[7, 5],
            ),
            fillable=False,
        ),
    ),

    # ══════════════════════════════════════════════════════════════════════════
    #  ACT III — OCEAN HEALTH
    # ══════════════════════════════════════════════════════════════════════════
    ui.nav_panel(
        "Act III — Ocean Health",
        ui.layout_sidebar(
            ui.sidebar(
                _act_heading("🐋", GREEN, "Act III: Ocean Health",
                             "Ocean Health Index 2012–2023"),
                ui.input_slider("o_year", "Year",
                                min=min(OHI_YEARS), max=max(OHI_YEARS),
                                value=max(OHI_YEARS), step=1, sep=""),
                ui.input_select("o_goal", "Goal / Sub-Goal",
                                choices=GOAL_CHOICES, selected="Index"),
                ui.input_select("o_region", "Region / Country",
                                choices=REGION_CHOICES, selected="0"),
                ui.hr(),
                ui.tags.div(ui.tags.strong("Forecast Settings",
                    style=f"color:{MUTED};font-size:.78rem;text-transform:uppercase;letter-spacing:.07em")),
                ui.input_select("o_model", "Model",
                                choices=MODEL_CHOICES, selected="linear"),
                ui.input_slider("o_horizon", "Forecast Horizon (years)",
                                min=1, max=10, value=5, step=1),
                ui.hr(),
                ui.output_ui("kpi_ohi"),
                width=290,
            ),
            ui.layout_columns(
                ui.card(
                    ui.card_header("🗺 World Map — Ocean Health Index Score"),
                    output_widget("map_ohi"),
                    full_screen=True,
                ),
                col_widths=[12],
            ),
            ui.layout_columns(
                ui.card(
                    ui.card_header("📈 Historical Trend"),
                    output_widget("chart_trend"),
                ),
                ui.card(
                    ui.card_header("🕸 Sub-Goal Radar"),
                    output_widget("chart_radar"),
                ),
                col_widths=[7, 5],
            ),
            ui.layout_columns(
                ui.card(
                    ui.card_header("🔮 Forecast"),
                    output_widget("chart_forecast"),
                ),
                col_widths=[12],
            ),
            fillable=False,
        ),
    ),

    # ── NAVBAR ────────────────────────────────────────────────────────────────
    title=ui.tags.span(
        ui.tags.span("🌊", class_="brand-icon"),
        " Global Plastic & Ocean Health",
        style="font-weight:700;color:#e2e8f0;letter-spacing:-.02em",
    ),
    navbar_options=ui.navbar_options(bg="#080d1a"),
    fillable=True,
)


# ─────────────────────────────────────────────────────────────────────────────
#  SERVER
# ─────────────────────────────────────────────────────────────────────────────

def server(input: Inputs, output: Outputs, session: Session):

    # ── ACT I REACTIVES ───────────────────────────────────────────────────────

    @reactive.calc
    def plastic_filtered():
        df = PLASTIC_DF[PLASTIC_DF["year"] == input.p_year()].copy()
        selected = input.p_countries()
        if selected:
            df = df[df["entity"].isin(selected)]
        return df

    @reactive.calc
    def plastic_top():
        df = plastic_filtered()
        return df.nlargest(input.p_top_n(), "value").sort_values("value")

    @render.ui
    def kpi_plastic():
        df = plastic_filtered()
        if df.empty:
            return ui.HTML("<p style='color:var(--muted)'>No data</p>")
        worst = df.nlargest(1, "value").iloc[0]
        avg   = df["value"].mean()
        n     = len(df)
        html  = _stat_html("Worst Country", worst["entity"],
                           f"{worst['value']:.1f} kg/capita/yr", CORAL)
        html += _stat_html("Global Average", f"{avg:.2f} kg/capita", "", YELLOW)
        html += _stat_html("Countries with Data", str(n), f"Year {input.p_year()}", ACCENT)
        return ui.HTML(html)

    @render_plotly
    def map_plastic():
        df = plastic_filtered()
        if df.empty:
            fig = go.Figure()
            fig.update_layout(**_layout(title="No data for selected filters"),
                              geo=_geo_base())
            return fig

        fig = px.choropleth(
            df, locations="code", locationmode="ISO-3",
            color="value", hover_name="entity",
            hover_data={"code": False, "value": ":.2f"},
            color_continuous_scale=[
                [0.00, "#0d2137"], [0.10, "#0d4a7a"], [0.25, "#1565c0"],
                [0.40, "#f57c00"], [0.65, "#e53935"], [1.00, "#b71c1c"],
            ],
            range_color=[0, df["value"].quantile(0.95)],
            labels={"value": "kg/capita/yr"},
        )
        fig.update_geos(**_geo_base())
        fig.update_layout(
            **_layout(
                title=dict(
                    text=f"Mismanaged Plastic Waste · {input.p_year()}",
                    font=dict(size=14, color=TEXT),
                    x=0.01, y=0.98,
                ),
                coloraxis_colorbar=dict(
                    title=dict(text="kg/capita", font=dict(color=TEXT)),
                    bgcolor=SURF, bordercolor=BORDER, borderwidth=1,
                    tickfont=dict(color=TEXT),
                    thickness=14, len=0.6,
                ),
            ),
            height=460,
        )
        return fig

    @render_plotly
    def bar_plastic():
        df = plastic_top()
        if df.empty:
            fig = go.Figure()
            fig.update_layout(**_layout())
            return fig

        n_colors = len(df)
        norm = (df["value"] - df["value"].min()) / max(df["value"].max() - df["value"].min(), 1)
        colors = [
            f"rgba({int(13+200*v)},{int(33-10*v)},{int(38-10*v)},1)"
            for v in norm
        ]
        fig = go.Figure(go.Bar(
            x=df["value"], y=df["entity"],
            orientation="h",
            marker=dict(
                color=df["value"],
                colorscale=[
                    [0.0, "#0d4a7a"], [0.4, "#f57c00"], [1.0, "#b71c1c"]
                ],
                line=dict(width=0),
            ),
            text=df["value"].round(1).astype(str) + " kg",
            textposition="outside",
            textfont=dict(color=TEXT, size=11),
            hovertemplate="<b>%{y}</b><br>%{x:.2f} kg/capita/yr<extra></extra>",
        ))
        fig.update_layout(
            **_layout(
                yaxis=dict(
                    gridcolor=BORDER, zerolinecolor=BORDER,
                    tickfont=dict(color=TEXT, size=11),
                    title_font=dict(color=TEXT),
                ),
                xaxis=dict(
                    gridcolor=BORDER, zerolinecolor=BORDER,
                    tickfont=dict(color=MUTED),
                    title="kg per capita per year",
                    title_font=dict(color=MUTED),
                ),
                showlegend=False,
            ),
            height=max(280, len(df) * 28),
        )
        return fig

    # ── ACT II REACTIVES ──────────────────────────────────────────────────────

    @reactive.calc
    def rivers_filtered():
        df = RIVERS_DF.copy()
        df = df[df["emissions"] >= input.r_min_em()]
        return df.nlargest(input.r_top(), "emissions")

    @render.ui
    def kpi_rivers():
        total_em = RIVERS_DF["emissions"].sum()
        top_c    = (
            RIVERS_BY_COUNTRY.iloc[0]["country"]
            if len(RIVERS_BY_COUNTRY) else "N/A"
        )
        top_em   = (
            RIVERS_BY_COUNTRY.iloc[0]["total_emissions"]
            if len(RIVERS_BY_COUNTRY) else 0
        )
        html  = _stat_html("Total River Emissions",
                           f"{total_em/1e6:.2f}M", "tonnes/year", ACCENT)
        html += _stat_html("Top Emitter Country", top_c,
                           f"{top_em:,.0f} t/yr", CORAL)
        html += _stat_html("K-Means Clusters", "10",
                           "emission-weighted", GREEN)
        clusters_html = '<div style="margin-top:.5rem">'
        for i, cl in enumerate(RIVER_CLUSTERS[:10]):
            c = cl["color"]
            clusters_html += f"""
            <div style="display:flex;align-items:center;gap:.5rem;
                        margin-bottom:.3rem;font-size:.8rem">
              <div style="width:10px;height:10px;border-radius:50%;
                          background:{c};flex-shrink:0;
                          box-shadow:0 0 6px {c}88"></div>
              <span style="color:{TEXT};font-weight:500">
                {cl['label']}</span>
              <span style="color:{MUTED};margin-left:auto">
                {cl['emission_pct']}%</span>
            </div>"""
        clusters_html += "</div>"
        return ui.HTML(html + clusters_html)

    @render_plotly
    def map_rivers():
        df = rivers_filtered()
        if df.empty:
            fig = go.Figure()
            fig.update_layout(**_layout(), geo=_geo_base())
            return fig

        traces = []
        for rank, cl in enumerate(RIVER_CLUSTERS):
            cid   = cl["id"]
            color = cl["color"]
            sub   = df[df["cluster_id"] == cid]
            if sub.empty:
                continue
            log_em = np.log1p(sub["emissions"].values)
            sizes  = 3 + 12 * (log_em / (log_em.max() + 1e-9))

            traces.append(go.Scattergeo(
                lat=sub["lat"], lon=sub["lon"],
                mode="markers",
                name=cl["label"],
                marker=dict(
                    size=sizes,
                    color=color,
                    opacity=0.75,
                    line=dict(width=0),
                    sizemode="diameter",
                ),
                text=[
                    f"<b>{r['country']}</b><br>{r['emissions']:,.1f} t/yr"
                    for _, r in sub.iterrows()
                ],
                hovertemplate="%{text}<extra></extra>",
                showlegend=True,
            ))

        fig = go.Figure(data=traces)
        fig.update_geos(**_geo_base())
        fig.update_layout(
            **_layout(
                title=dict(
                    text="River Plastic Emissions — K-Means Clusters",
                    font=dict(size=14, color=TEXT), x=0.01, y=0.98,
                ),
                legend=dict(
                    bgcolor="rgba(8,13,26,.88)", bordercolor=BORDER,
                    borderwidth=1, font=dict(color=TEXT, size=11),
                    itemsizing="constant",
                ),
            ),
            height=460,
        )
        return fig

    @render_plotly
    def bar_rivers_country():
        df = RIVERS_BY_COUNTRY.head(20)
        if df.empty:
            return go.Figure()
        fig = go.Figure(go.Bar(
            x=df["total_emissions"] / 1000,
            y=df["country"],
            orientation="h",
            marker=dict(
                color=df["total_emissions"] / 1000,
                colorscale=[[0, "#0d2137"], [0.5, ACCENT], [1.0, CORAL]],
                line=dict(width=0),
            ),
            hovertemplate="<b>%{y}</b><br>%{x:.1f}k tonnes/yr<extra></extra>",
        ))
        fig.update_layout(
            **_layout(
                xaxis=dict(
                    title="Emissions (1 000 t/yr)",
                    title_font=dict(color=MUTED),
                    tickfont=dict(color=MUTED),
                    gridcolor=BORDER,
                ),
                yaxis=dict(
                    tickfont=dict(color=TEXT, size=11),
                    gridcolor=BORDER,
                    zerolinecolor=BORDER,
                ),
                showlegend=False,
            ),
            height=420,
        )
        return fig

    @render_plotly
    def bar_rivers_continent():
        skip = {"Unknown","Seven seas (open ocean)","Antarctica"}
        df = (
            RIVERS_DF[~RIVERS_DF["continent"].isin(skip)]
            .groupby("continent")["emissions"]
            .sum()
            .reset_index()
            .sort_values("emissions", ascending=True)
        )
        if df.empty:
            return go.Figure()
        fig = go.Figure(go.Bar(
            x=df["emissions"] / 1000,
            y=df["continent"],
            orientation="h",
            marker=dict(
                color=[ACCENT, GREEN, CORAL, YELLOW, "#c77dff", "#ff4da6"][:len(df)],
                line=dict(width=0),
            ),
            text=(df["emissions"]/1000).round(0).astype(int).astype(str) + "k",
            textposition="outside",
            textfont=dict(color=TEXT, size=11),
            hovertemplate="<b>%{y}</b><br>%{x:.1f}k t/yr<extra></extra>",
        ))
        fig.update_layout(
            **_layout(
                xaxis=dict(
                    title="Emissions (1 000 t/yr)",
                    title_font=dict(color=MUTED),
                    tickfont=dict(color=MUTED),
                    gridcolor=BORDER,
                ),
                yaxis=dict(
                    tickfont=dict(color=TEXT, size=12),
                    gridcolor="rgba(0,0,0,0)",
                ),
                showlegend=False,
            ),
            height=320,
        )
        return fig

    # ── ACT III REACTIVES ─────────────────────────────────────────────────────

    @reactive.calc
    def ohi_map_data():
        df = OHI_DF
        year = input.o_year()
        goal = input.o_goal()
        mask = (
            (df["goal"] == goal) &
            (df["dimension"] == "score") &
            (df["year"] == year) &
            (df["region_id"] != 0)
        )
        return df[mask][["region_name","region_id","value"]].copy()

    @reactive.calc
    def ohi_trend_data():
        region_id = int(input.o_region())
        goal      = input.o_goal()
        mask = (
            (OHI_DF["goal"] == goal) &
            (OHI_DF["dimension"] == "score") &
            (OHI_DF["region_id"] == region_id)
        )
        return OHI_DF[mask][["year","value"]].sort_values("year")

    @reactive.calc
    def ohi_radar_data():
        region_id = int(input.o_region())
        year      = input.o_year()
        sub_goals = [g for g in OHI_DF["goal"].unique() if g != "Index"]
        mask = (
            (OHI_DF["goal"].isin(sub_goals)) &
            (OHI_DF["dimension"] == "score") &
            (OHI_DF["region_id"] == region_id) &
            (OHI_DF["year"] == year)
        )
        return OHI_DF[mask][["goal","long_goal","value"]].copy()

    @render.ui
    def kpi_ohi():
        df = ohi_map_data()
        region_id   = int(input.o_region())
        region_name = REGION_CHOICES.get(str(region_id), "Global Average")
        if region_id == 0:
            gdf = OHI_DF[
                (OHI_DF["goal"] == input.o_goal()) &
                (OHI_DF["dimension"] == "score") &
                (OHI_DF["year"] == input.o_year()) &
                (OHI_DF["region_id"] == 0)
            ]
            score = gdf["value"].iloc[0] if len(gdf) else float("nan")
        else:
            sub = df[df["region_id"] == region_id]
            score = sub["value"].iloc[0] if len(sub) else float("nan")

        if not df.empty:
            best  = df.nlargest(1, "value").iloc[0]
            worst = df.nsmallest(1, "value").iloc[0]
        else:
            best = worst = None

        score_color = GREEN if score >= 70 else YELLOW if score >= 50 else CORAL
        html  = _stat_html(
            f"Score · {region_name[:20]}",
            f"{score:.1f}" if not pd.isna(score) else "N/A",
            f"Goal: {GOAL_CHOICES.get(input.o_goal(), input.o_goal())}",
            score_color,
        )
        if best is not None:
            html += _stat_html("Best Region", best["region_name"][:22],
                               f"{best['value']:.1f}", GREEN)
            html += _stat_html("Needs Most Care", worst["region_name"][:22],
                               f"{worst['value']:.1f}", CORAL)
        return ui.HTML(html)

    @render_plotly
    def map_ohi():
        df = ohi_map_data()
        if df.empty:
            fig = go.Figure()
            fig.update_layout(**_layout(), geo=_geo_base())
            return fig

        fig = px.choropleth(
            df, locations="region_name", locationmode="country names",
            color="value", hover_name="region_name",
            color_continuous_scale=[
                [0.0,  "#3d0000"], [0.15, "#7b0000"], [0.30, "#c62828"],
                [0.50, "#f57c00"], [0.70, "#388e3c"], [1.0,  "#00c853"],
            ],
            range_color=[0, 100],
            labels={"value": "OHI Score"},
        )
        goal_label = GOAL_CHOICES.get(input.o_goal(), input.o_goal())
        fig.update_geos(**_geo_base())
        fig.update_layout(
            **_layout(
                title=dict(
                    text=f"Ocean Health Index · {goal_label} · {input.o_year()}",
                    font=dict(size=14, color=TEXT), x=0.01, y=0.98,
                ),
                coloraxis_colorbar=dict(
                    title=dict(text="Score (0–100)", font=dict(color=TEXT)),
                    bgcolor=SURF, bordercolor=BORDER, borderwidth=1,
                    tickfont=dict(color=TEXT),
                    thickness=14, len=0.6,
                ),
            ),
            height=460,
        )
        return fig

    @render_plotly
    def chart_trend():
        df = ohi_trend_data()
        region_id   = int(input.o_region())
        region_name = REGION_CHOICES.get(str(region_id), "Global Average")
        goal_label  = GOAL_CHOICES.get(input.o_goal(), input.o_goal())

        if df.empty:
            fig = go.Figure()
            fig.update_layout(**_layout(title="No trend data"))
            return fig

        fig = go.Figure()
        fig.add_trace(go.Scatter(
            x=df["year"], y=df["value"],
            mode="lines+markers",
            name=region_name,
            line=dict(color=ACCENT, width=2.5),
            marker=dict(color=ACCENT, size=6, symbol="circle",
                        line=dict(color=BG, width=1.5)),
            fill="tozeroy",
            fillcolor="rgba(0,212,255,0.07)",
            hovertemplate="<b>%{x}</b><br>Score: %{y:.1f}<extra></extra>",
        ))
        # Highlight selected year
        sel_yr = input.o_year()
        sub_yr = df[df["year"] == sel_yr]
        if len(sub_yr):
            fig.add_trace(go.Scatter(
                x=sub_yr["year"], y=sub_yr["value"],
                mode="markers",
                name="Selected",
                marker=dict(color=CORAL, size=10, symbol="diamond",
                            line=dict(color=BG, width=1.5)),
                hovertemplate="<b>%{x}</b><br>Score: %{y:.1f}<extra></extra>",
            ))
        fig.update_layout(
            **_layout(
                title=dict(
                    text=f"{region_name} · {goal_label}",
                    font=dict(size=13, color=TEXT), x=0, xanchor="left",
                ),
                yaxis=dict(
                    range=[max(0, df["value"].min() - 10), min(105, df["value"].max() + 10)],
                    title="Score (0–100)", title_font=dict(color=MUTED),
                    tickfont=dict(color=MUTED), gridcolor=BORDER,
                ),
                xaxis=dict(
                    title="Year", title_font=dict(color=MUTED),
                    tickfont=dict(color=MUTED), gridcolor=BORDER,
                    tickmode="linear", dtick=2,
                ),
                showlegend=True,
            ),
            height=320,
        )
        return fig

    @render_plotly
    def chart_radar():
        df = ohi_radar_data()
        region_id   = int(input.o_region())
        region_name = REGION_CHOICES.get(str(region_id), "Global Average")

        if df.empty:
            fig = go.Figure()
            fig.update_layout(**_layout(title="No sub-goal data"))
            return fig

        # Close the radar polygon
        cats   = df["long_goal"].tolist()
        vals   = df["value"].tolist()
        cats  += [cats[0]]
        vals  += [vals[0]]

        fig = go.Figure()
        fig.add_trace(go.Scatterpolar(
            r=vals, theta=cats,
            fill="toself",
            fillcolor="rgba(0,212,255,0.12)",
            line=dict(color=ACCENT, width=2),
            marker=dict(color=ACCENT, size=6),
            name=region_name,
            hovertemplate="<b>%{theta}</b><br>Score: %{r:.1f}<extra></extra>",
        ))
        fig.update_layout(
            **_layout(margin=dict(l=50, r=50, t=40, b=50)),
            polar=dict(
                bgcolor="rgba(11,18,34,0.5)",
                radialaxis=dict(
                    visible=True, range=[0, 100],
                    tickfont=dict(color=MUTED, size=10),
                    gridcolor=BORDER,
                    linecolor=BORDER,
                ),
                angularaxis=dict(
                    tickfont=dict(color=TEXT, size=10),
                    gridcolor=BORDER,
                    linecolor=BORDER,
                ),
            ),
            title=dict(
                text=f"{region_name} · {input.o_year()}",
                font=dict(size=13, color=TEXT), x=0, xanchor="left",
            ),
            showlegend=False,
            height=320,
        )
        return fig

    @render_plotly
    def chart_forecast():
        region_id = int(input.o_region())
        goal      = input.o_goal()
        model     = input.o_model()
        horizon   = input.o_horizon()
        region_name = REGION_CHOICES.get(str(region_id), "Global Average")
        goal_label  = GOAL_CHOICES.get(goal, goal)
        model_label = MODEL_CHOICES.get(model, model)

        # Get historical data
        mask = (
            (OHI_DF["goal"] == goal) &
            (OHI_DF["dimension"] == "score") &
            (OHI_DF["region_id"] == region_id)
        )
        hist = OHI_DF[mask][["year","value"]].sort_values("year").dropna()

        fig = go.Figure()

        if len(hist) < 5:
            fig.add_annotation(
                text="Insufficient historical data (need ≥ 5 years)",
                xref="paper", yref="paper", x=0.5, y=0.5,
                font=dict(color=MUTED, size=14), showarrow=False,
            )
            fig.update_layout(**_layout(), height=300)
            return fig

        # Historical trace
        fig.add_trace(go.Scatter(
            x=hist["year"], y=hist["value"],
            mode="lines+markers", name="Historical",
            line=dict(color=ACCENT, width=2.5),
            marker=dict(color=ACCENT, size=5, symbol="circle",
                        line=dict(color=BG, width=1)),
            hovertemplate="<b>%{x}</b><br>Score: %{y:.1f}<extra></extra>",
        ))

        # Run forecast
        try:
            rows, r2, mae = _run_forecast(
                hist["year"].tolist(), hist["value"].tolist(), model, horizon
            )
            f_years  = [r["year"]  for r in rows]
            f_vals   = [r["value"] for r in rows]
            f_lower  = [r["lower"] for r in rows]
            f_upper  = [r["upper"] for r in rows]

            # CI band
            fig.add_trace(go.Scatter(
                x=f_years + f_years[::-1],
                y=f_upper + f_lower[::-1],
                fill="toself",
                fillcolor="rgba(0,255,136,0.1)",
                line=dict(color="rgba(0,0,0,0)"),
                name="80% CI",
                hoverinfo="skip",
                showlegend=True,
            ))
            # Forecast line
            fig.add_trace(go.Scatter(
                x=f_years, y=f_vals,
                mode="lines+markers", name=model_label,
                line=dict(color=GREEN, width=2.5, dash="dot"),
                marker=dict(color=GREEN, size=7, symbol="diamond",
                            line=dict(color=BG, width=1.5)),
                hovertemplate="<b>%{x}</b><br>Forecast: %{y:.1f}<extra></extra>",
            ))

            metrics_text = f"R²={r2:.3f}  MAE={mae:.3f}"
        except Exception as e:
            metrics_text = f"Forecast error: {e}"

        # Vertical separator line
        last_yr = int(hist["year"].max())
        fig.add_vline(
            x=last_yr + 0.5,
            line=dict(color=BORDER, width=1.5, dash="dash"),
            annotation_text="Forecast →",
            annotation_font=dict(color=MUTED, size=11),
            annotation_position="top right",
        )

        fig.update_layout(
            **_layout(
                title=dict(
                    text=f"{region_name} · {goal_label} · {model_label}",
                    font=dict(size=13, color=TEXT), x=0, xanchor="left",
                ),
                yaxis=dict(
                    range=[0, 105], title="Score (0–100)",
                    title_font=dict(color=MUTED),
                    tickfont=dict(color=MUTED), gridcolor=BORDER,
                ),
                xaxis=dict(
                    title="Year", title_font=dict(color=MUTED),
                    tickfont=dict(color=MUTED), gridcolor=BORDER,
                    tickmode="linear", dtick=2,
                ),
                legend=dict(
                    bgcolor="rgba(8,13,26,.85)", bordercolor=BORDER,
                    borderwidth=1, font=dict(color=TEXT, size=11),
                ),
                annotations=[
                    dict(
                        text=metrics_text, xref="paper", yref="paper",
                        x=0.01, y=0.02, showarrow=False,
                        font=dict(color=MUTED, size=11),
                        bgcolor="rgba(13,21,38,.7)",
                        bordercolor=BORDER, borderwidth=1,
                        borderpad=4,
                    )
                ],
            ),
            height=360,
        )
        return fig


# ─────────────────────────────────────────────────────────────────────────────
#  APP
# ─────────────────────────────────────────────────────────────────────────────
app = App(app_ui, server)
