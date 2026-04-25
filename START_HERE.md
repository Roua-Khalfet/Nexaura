# 🚀 Start Here - Startify Platform

Quick reference to get the integrated platform running.

## What is Startify?

Startify combines two powerful AI modules:
- **ComplianceGuard**: Legal compliance assistant for Tunisian startups
- **TeamBuilder**: AI-powered recruitment and team building platform

## Quick Start (3 Steps)

### 1️⃣ Start Docker Services

```bash
cd Startify

# Start ComplianceGuard services (Neo4j + Qdrant)
./scripts/start-local-stack.ps1

# Start TeamBuilder services (PostgreSQL + Redis)
cd backend/teambuilder
docker compose up -d
cd ../..
```

### 2️⃣ Start Backends (2 terminals)

**Terminal 1 - ComplianceGuard:**
```bash
cd Startify/backend
python manage.py runserver
# → http://localhost:8000
```

**Terminal 2 - TeamBuilder:**
```bash
cd Startify/backend/teambuilder
../../.venv/bin/python manage.py runserver 8001
# → http://localhost:8001
```

### 3️⃣ Start Frontend

**Terminal 3:**
```bash
cd Startify/frontend
npm run dev
# → http://localhost:3000
```

## Access

Open: **http://localhost:3000**

## Port Reference

| Service | Port |
|---------|------|
| Frontend | 3000 |
| ComplianceGuard Backend | 8000 |
| TeamBuilder Backend | 8001 |
| Neo4j | 7474, 7687 |
| Qdrant | 6333 |
| PostgreSQL | 5433 |
| Redis | 6380 |

## First Time Setup

### 1. Install Dependencies

```bash
cd Startify

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install Python packages
pip install -r requirements.txt

# Run migrations
cd backend
python manage.py migrate

cd teambuilder
../../.venv/bin/python manage.py migrate
cd ../..

# Install frontend packages
cd frontend
npm install
cd ..
```

### 2. Configure Environment

**ComplianceGuard (.env in Startify root):**
```bash
cp .env.example .env
# Edit with your API keys
```

**TeamBuilder (.env in backend/teambuilder):**
```bash
cd backend/teambuilder
# Edit .env with Google OAuth credentials
# Update redirect URI: http://localhost:8001/api/v1/auth/google/callback
```

### 3. Download AI Models

```bash
ollama pull qwen3-embedding:0.6b
ollama pull llama3.2
```

## Verify Everything Works

```bash
# Check Docker containers
docker ps

# Should see:
# - neo4j-local
# - qdrant-local
# - teambuilder-postgres
# - teambuilder-redis

# Test backends
curl http://localhost:8000/api/  # ComplianceGuard
curl http://localhost:8001/health  # TeamBuilder

# Test frontend
curl http://localhost:3000
```

## Stop Everything

```bash
# Stop backends: Ctrl+C in each terminal

# Stop Docker services
cd Startify/backend/teambuilder
docker compose down

cd Startify
docker stop neo4j-local qdrant-local
```

## Need Help?

- **Detailed Setup**: See `README.md`
- **TeamBuilder Specific**: See `TEAMBUILDER_SETUP.md`
- **Quick Reference**: See `QUICK_START.md`
- **Integration Details**: See `INTEGRATION_SUMMARY.md`

## Common Issues

**Port already in use?**
```bash
lsof -i :8001  # Find process
kill -9 <PID>  # Kill it
```

**Database error?**
```bash
docker compose ps  # Check status
docker compose logs postgres  # Check logs
```

**Module not found?**
```bash
# Make sure virtual environment is activated
source .venv/bin/activate
pip install -r requirements.txt
```
