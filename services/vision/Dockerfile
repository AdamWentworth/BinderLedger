FROM python:3.12-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    NUMEXPR_NUM_THREADS=1

RUN apt-get update \
    && apt-get install --yes --no-install-recommends tesseract-ocr tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 10001 binderledger \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin binderledger

WORKDIR /app
COPY services/vision/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --requirement requirements.txt

FROM base AS test
COPY services/vision/requirements-dev.txt ./requirements-dev.txt
RUN pip install --no-cache-dir --requirement requirements-dev.txt
COPY services/vision/binderledger_vision ./binderledger_vision
COPY services/vision/tests ./tests
CMD ["pytest", "-q"]

FROM base AS runtime
COPY services/vision/binderledger_vision ./binderledger_vision

USER binderledger
CMD ["python", "-m", "binderledger_vision.worker"]
