from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import plastic, rivers, ocean_health, forecast

app = FastAPI(title="Plastic Pollution Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    plastic.load_data()
    rivers.load_data()
    ocean_health.load_data()


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(plastic.router)
app.include_router(rivers.router)
app.include_router(ocean_health.router)
app.include_router(forecast.router)
