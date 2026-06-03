from fastapi import APIRouter, Query
from typing import Optional
import pandas as pd
import os
import zipfile
import io

router = APIRouter(prefix="/api/plastic", tags=["plastic"])

_df: Optional[pd.DataFrame] = None


def load_data():
    global _df
    data_dir = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "..", "data"))
    zip_path = os.path.join(data_dir, "mismanaged-plastic-waste-per-capita.zip")
    with zipfile.ZipFile(zip_path) as z:
        csv_name = [n for n in z.namelist() if n.endswith(".csv")][0]
        with z.open(csv_name) as f:
            _df = pd.read_csv(f)
    _df.columns = ["entity", "code", "year", "value"]
    _df = _df[~_df["code"].str.startswith("OWID_", na=False)]
    _df = _df.dropna(subset=["code", "value"])


@router.get("")
def get_plastic():
    return _df[["entity", "code", "year", "value"]].to_dict(orient="records")


@router.get("/top")
def get_top_countries(n: int = Query(20, ge=1, le=200)):
    top = _df.nlargest(n, "value")
    return top[["entity", "code", "year", "value"]].to_dict(orient="records")
