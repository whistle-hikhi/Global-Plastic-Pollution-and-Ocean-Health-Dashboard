from fastapi import APIRouter, Query
from typing import Optional
import geopandas as gpd
import zipfile
import tempfile
import os
import shutil
import numpy as np

router = APIRouter(prefix="/api/rivers", tags=["rivers"])

COUNTRIES_URL = "https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip"
_CACHE_FILE = os.path.join(os.path.dirname(__file__), "_ne_countries_110m.zip")

DEFAULT_K = 10

_records: Optional[list] = None
_by_country: Optional[list] = None
_by_continent: Optional[list] = None
_clusters: Optional[list] = None


def _get_world_gdf() -> gpd.GeoDataFrame:
    if not os.path.exists(_CACHE_FILE):
        import urllib.request
        urllib.request.urlretrieve(COUNTRIES_URL, _CACHE_FILE)
    world = gpd.read_file(_CACHE_FILE)
    return world[["NAME", "ISO_A3", "CONTINENT", "geometry"]].rename(
        columns={"NAME": "country", "ISO_A3": "iso3", "CONTINENT": "continent"}
    )


def _kmeans_clusters(coords: np.ndarray, emissions: np.ndarray, k: int) -> np.ndarray:
    from sklearn.cluster import KMeans
    weights = np.sqrt(np.maximum(emissions, 1e-6))
    km = KMeans(n_clusters=k, random_state=42, n_init="auto")
    km.fit(coords, sample_weight=weights)
    return km.labels_.astype(int)


def _dbscan_clusters(coords: np.ndarray, eps: float = 3.0, min_samples: int = 30) -> np.ndarray:
    from sklearn.cluster import DBSCAN
    db = DBSCAN(eps=eps, min_samples=min_samples)
    return db.fit_predict(coords).astype(int)


def _build_cluster_summaries(joined, labels: np.ndarray, total_em: float, k: int) -> list:
    """Summarise each cluster: centroid, emissions, dominant country/continent, bbox."""
    joined = joined.copy()
    joined["cluster_id"] = labels
    summaries = []
    noise_ids = {-1}  # DBSCAN noise

    unique_ids = sorted(set(labels) - noise_ids)
    for cid in unique_ids:
        mask = joined["cluster_id"] == cid
        sub = joined[mask]
        if len(sub) == 0:
            continue

        em = sub["dots_exten"].values
        lats = sub["lat"].values
        lons = sub["lon"].values

        center_lat = float(np.average(lats, weights=em))
        center_lon = float(np.average(lons, weights=em))
        cluster_em = float(em.sum())

        valid_countries = sub[sub["country"] != "Unknown"]
        country_agg = valid_countries.groupby("country")["dots_exten"].sum()
        dominant_country = country_agg.idxmax() if len(country_agg) else "Unknown"

        skip_cont = {"Unknown", "Seven seas (open ocean)", "Antarctica"}
        valid_cont = sub[~sub["continent"].isin(skip_cont)]
        cont_agg = valid_cont.groupby("continent")["dots_exten"].sum()
        dominant_continent = cont_agg.idxmax() if len(cont_agg) else "Unknown"

        top3 = country_agg.nlargest(3).reset_index()
        top_countries = [
            {"country": r["country"], "emissions": round(float(r["dots_exten"]), 1)}
            for _, r in top3.iterrows()
        ]

        pad = 2.0
        summaries.append({
            "id": int(cid),
            "label": dominant_country if dominant_country != "Unknown" else f"Region {cid}",
            "center_lat": round(center_lat, 3),
            "center_lon": round(center_lon, 3),
            "total_emissions": round(cluster_em, 1),
            "point_count": int(len(sub)),
            "emission_pct": round(cluster_em / total_em * 100, 1),
            "dominant_country": dominant_country,
            "continent": dominant_continent,
            "top_countries": top_countries,
            "bbox": {
                "lat_min": round(float(lats.min()) - pad, 2),
                "lat_max": round(float(lats.max()) + pad, 2),
                "lon_min": round(float(lons.min()) - pad, 2),
                "lon_max": round(float(lons.max()) + pad, 2),
            },
        })

    return sorted(summaries, key=lambda x: x["total_emissions"], reverse=True)


def load_data():
    global _records, _by_country, _by_continent, _clusters

    data_dir = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "..", "data"))
    zip_path = os.path.join(data_dir, "Meijer2021_midpoint_emissions.zip")

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

        # Spatial join with world countries
        world = _get_world_gdf()
        gdf_wgs = gdf[["dots_exten", "lat", "lon", "geometry"]].copy()
        gdf_wgs = gdf_wgs.set_crs("EPSG:4326", allow_override=True)
        world = world.to_crs("EPSG:4326")

        joined = gpd.sjoin(gdf_wgs, world, how="left", predicate="within")
        joined = joined[~joined.index.duplicated(keep="first")].sort_index()
        joined["country"] = joined["country"].fillna("Unknown")
        joined["continent"] = joined["continent"].fillna("Unknown")
        joined["iso3"] = joined["iso3"].fillna("")

        # ── K-Means clustering ──────────────────────────────────────────────
        coords = joined[["lat", "lon"]].values
        emissions_arr = joined["dots_exten"].values
        labels = _kmeans_clusters(coords, emissions_arr, k=DEFAULT_K)
        joined["cluster_id"] = labels

        total_em = float(emissions_arr.sum())
        _clusters = _build_cluster_summaries(joined, labels, total_em, k=DEFAULT_K)

        # Assign a display rank (0 = highest emitter cluster) to each record
        id_to_rank = {c["id"]: rank for rank, c in enumerate(_clusters)}

        # ── Build _records ───────────────────────────────────────────────────
        _records = []
        for idx, row in joined.iterrows():
            cid = int(row["cluster_id"])
            _records.append({
                "id": int(idx),
                "lat": round(float(row["lat"]), 5),
                "lon": round(float(row["lon"]), 5),
                "emissions": round(float(row["dots_exten"]), 4),
                "cluster_id": cid,
                "cluster_rank": id_to_rank.get(cid, -1),
                "country": row["country"],
                "continent": row["continent"],
            })
        # Keep emission-descending order
        _records.sort(key=lambda r: r["emissions"], reverse=True)
        for i, r in enumerate(_records):
            r["id"] = i

        # ── By country ───────────────────────────────────────────────────────
        by_c = (
            joined.groupby(["country", "continent", "iso3"])
            .agg(total_emissions=("dots_exten", "sum"), point_count=("dots_exten", "count"))
            .reset_index()
            .sort_values("total_emissions", ascending=False)
        )
        by_c = by_c[by_c["country"] != "Unknown"]
        _by_country = by_c.to_dict(orient="records")

        # ── By continent ────────────────────────────────────────────────────
        skip = {"Unknown", "Seven seas (open ocean)", "Antarctica"}
        by_cont = (
            joined[~joined["continent"].isin(skip)]
            .groupby("continent")
            .agg(total_emissions=("dots_exten", "sum"), point_count=("dots_exten", "count"))
            .reset_index()
            .sort_values("total_emissions", ascending=False)
        )
        _by_continent = by_cont.to_dict(orient="records")

    finally:
        shutil.rmtree(tmp)


@router.get("")
def get_rivers(top: int = Query(200, ge=1, le=1000)):
    return _records[:top]


@router.get("/clusters")
def get_clusters():
    return _clusters


@router.get("/by-country")
def get_by_country(top: int = Query(20, ge=1, le=200)):
    return _by_country[:top]


@router.get("/by-continent")
def get_by_continent():
    return _by_continent
