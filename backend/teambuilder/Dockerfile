FROM python:3.12-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Run migrations and collect static files
RUN python manage.py collectstatic --noinput || true

EXPOSE 8001

# Run Django with gunicorn on port 8001
CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8001", "--workers", "4"]
