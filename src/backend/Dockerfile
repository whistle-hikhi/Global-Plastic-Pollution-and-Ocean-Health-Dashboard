FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgdal-dev gdal-bin \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir uv && uv pip install --system -r requirements.txt

COPY . .

ENV DATA_DIR=/app/data

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
