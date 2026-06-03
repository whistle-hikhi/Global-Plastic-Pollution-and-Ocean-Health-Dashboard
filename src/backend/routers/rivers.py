from fastapi import APIRouter, Query
from typing import Optional
import geopandas as gpd
import zipfile
import tempfile
import os
import shutil

router = APIRouter(prefix="/api/rivers", tags=["rivers"])

COUNTRIES_URL = "https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip"
_CACHE_FILE = os.path.join(os.path.dirname(__file__), "_ne_countries_110m.zip")

_records: Optional[list] = None
_by_country: Optional[list] = None
_by_continent: Optional[list] = None


def _get_world_gdf() -> gpd.GeoDataFrame:
    if not os.path.exists(_CACHE_FILE):
        import urllib.request
        urllib.request.urlretrieve(COUNTRIES_URL, _CACHE_FILE)
    world = gpd.read_file(_CACHE_FILE)
    return world[["NAME", "ISO_A3", "CONTINENT", "geometry"]].rename(
        columns={"NAME": "country", "ISO_A3": "iso3", "CONTINENT": "continent"}
    )


def load_data():
    global _records, _by_country, _by_continent

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
        gdf = gdf.sort_values("dots_exten", ascending=False)

        _records = [
            {"id": i, "lat": row["lat"], "lon": row["lon"], "emissions": round(float(row["dots_exten"]), 4)}
            for i, (_, row) in enumerate(gdf.iterrows())
        ]

        # Spatial join with world countries
        world = _get_world_gdf()
        gdf_wgs = gdf[["dots_exten", "geometry"]].copy()
        gdf_wgs = gdf_wgs.set_crs("EPSG:4326", allow_override=True)
        world = world.to_crs("EPSG:4326")

        joined = gpd.sjoin(gdf_wgs, world, how="left", predicate="within")
        joined["country"] = joined["country"].fillna("Unknown")
        joined["continent"] = joined["continent"].fillna("Unknown")
        joined["iso3"] = joined["iso3"].fillna("")

        # By country
        by_c = (
            joined.groupby(["country", "continent", "iso3"])
            .agg(total_emissions=("dots_exten", "sum"), point_count=("dots_exten", "count"))
            .reset_index()
            .sort_values("total_emissions", ascending=False)
        )
        by_c = by_c[by_c["country"] != "Unknown"]
        _by_country = by_c.to_dict(orient="records")

        # By continent (exclude noise categories)
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


@router.get("/by-country")
def get_by_country(top: int = Query(20, ge=1, le=200)):
    return _by_country[:top]


@router.get("/by-continent")
def get_by_continent():
    return _by_continent
