from fastapi import APIRouter, Query
from typing import Optional
import pandas as pd
import os

router = APIRouter(prefix="/api/ohi", tags=["ocean_health"])

_df: Optional[pd.DataFrame] = None
_goals: Optional[list] = None


def load_data():
    global _df, _goals
    data_dir = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "..", "data"))
    csv_path = os.path.join(data_dir, "scores.csv")
    _df = pd.read_csv(csv_path)
    _df.columns = ["year", "goal", "long_goal", "dimension", "region_id", "region_name", "value"]
    _df["year"] = _df["year"].astype(int)
    _df["region_id"] = _df["region_id"].astype(int)
    _df = _df.dropna(subset=["value"])

    goal_df = _df[["goal", "long_goal"]].drop_duplicates().sort_values("goal")
    _goals = goal_df.to_dict(orient="records")


@router.get("/goals")
def get_goals():
    return _goals


@router.get("")
def get_scores(
    goal: str = Query("Index"),
    dimension: str = Query("score"),
    year: int = Query(2023),
):
    mask = (_df["goal"] == goal) & (_df["dimension"] == dimension) & (_df["year"] == year)
    sub = _df[mask][["region_id", "region_name", "value"]]
    return sub.to_dict(orient="records")


@router.get("/trend")
def get_trend(
    region_id: int = Query(0),
    goal: str = Query("Index"),
    dimension: str = Query("score"),
):
    mask = (_df["goal"] == goal) & (_df["dimension"] == dimension) & (_df["region_id"] == region_id)
    sub = _df[mask][["year", "value"]].sort_values("year")
    return sub.to_dict(orient="records")


@router.get("/radar")
def get_radar(region_id: int = Query(0), year: int = Query(2023)):
    sub_goals = [g for g in _df["goal"].unique() if g != "Index"]
    mask = (
        (_df["goal"].isin(sub_goals))
        & (_df["dimension"] == "score")
        & (_df["region_id"] == region_id)
        & (_df["year"] == year)
    )
    sub = _df[mask][["goal", "long_goal", "value"]]
    return sub.to_dict(orient="records")
