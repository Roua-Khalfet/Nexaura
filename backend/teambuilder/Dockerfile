# TeamBuilder Backend Dockerfile
FROM python:3.12-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt /app/requirements.txt

# Install Python dependencies
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Copy TeamBuilder application
COPY . /app/

# Create necessary directories
RUN mkdir -p /app/media /app/staticfiles /app/db /app/saved_contexts

# Collect static files
RUN python manage.py collectstatic --noinput || true

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

# Run migrations and start server
CMD python manage.py migrate && \
    python manage.py runserver 0.0.0.0:8000
