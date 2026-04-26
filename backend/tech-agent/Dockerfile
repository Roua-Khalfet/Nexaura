FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

WORKDIR /app

COPY requirements.txt ./
RUN python -m pip install --upgrade pip && \
	pip install --no-cache-dir --retries 10 --timeout 120 -r requirements.txt

COPY technical_advisor_agent ./technical_advisor_agent

EXPOSE 8000

CMD ["uvicorn", "technical_advisor_agent.main:app", "--host", "0.0.0.0", "--port", "8000"]
