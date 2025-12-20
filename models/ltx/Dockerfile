# Multi-stage build for optimized image size
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04 AS base

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/tmp/huggingface \
    TRANSFORMERS_CACHE=/tmp/huggingface \
    TORCH_HOME=/tmp/torch

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 \
    python3-pip \
    python3-dev \
    git \
    ffmpeg \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create symbolic links for python
RUN ln -sf /usr/bin/python3.10 /usr/bin/python && \
    ln -sf /usr/bin/pip3 /usr/bin/pip

# Upgrade pip
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Set working directory
WORKDIR /app

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download xformers if possible
RUN pip install --no-cache-dir xformers==0.0.23 || echo "xformers installation skipped"

# Copy application code
COPY serve.py .

# Create necessary directories
RUN mkdir -p /tmp/huggingface /tmp/torch /tmp/videos

# Set proper permissions
RUN chmod -R 777 /tmp

# Expose port for the application
EXPOSE 8080

# Health check
HEALTHCHECK --interval=60s --timeout=30s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run as non-root user for security (optional, comment out if issues)
# RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app /tmp
# USER appuser

# Command to run the application
CMD ["uvicorn", "serve:app", "--host", "0.0.0.0", "--port", "8080", "--timeout-keep-alive", "300", "--workers", "1"]