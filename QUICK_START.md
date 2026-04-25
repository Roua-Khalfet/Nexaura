# Quick Start Guide

## Prerequisites
- Docker Desktop running
- Python 3.12+
- Node.js 18+
- Ollama installed

## Start Everything (3 Steps)

### Step 1: Start Docker Services
```bash
cd Startify

# Start Startify services (Neo4j + Qdrant)
./scripts/start-local-stack.ps1

# Start TeamBuilder services (PostgreSQL + Redis)
cd backend/teambuilder
docker-compose up -d
cd ../..
```

### Step 2: Start Backends (2 terminals)

**Terminal 1 - Startify Backend:**
```bash
cd Startify/backend
source ../.venv/bin/activate  # or your venv path
python manage.py runserver
```

**Terminal 2 - TeamBuilder Backend:**
```bash
cd Startify/backend/teambuilder
source venv/bin/activate  # create venv first if needed
pip install -r requirements.txt  # first time only
python manage.py migrate  # first time only
python manage.py runserver 8001
```

### Step 3: Start Frontend (new terminal)

**Terminal 3 - Frontend:**
```bash
cd Startify/frontend
npm install  # first time only
npm run dev
```

## Access

Open browser: **http://localhost:3000**

## Verify Services

```bash
# Check all services are running
curl http://localhost:7474  # Neo4j
curl http://localhost:6333  # Qdrant
curl http://localhost:8000/api/  # Startify backend
curl http://localhost:8001/health  # TeamBuilder backend
curl http://localhost:3000  # Frontend

# Check Docker containers
docker ps
```

Should see:
- neo4j-local
- qdrant-local
- teambuilder-postgres
- teambuilder-redis

## First Time Setup

### 1. Configure TeamBuilder
```bash
cd Startify/backend/teambuilder

# Edit .env and add your credentials:
# - GOOGLE_CLIENT_ID
# - GOOGLE_CLIENT_SECRET
# - OPENAI_API_KEY (optional)
```

### 2. Update Google OAuth
Add this redirect URI in Google Cloud Console:
```
http://localhost:8001/api/v1/auth/google/callback
```

### 3. Load Salary Data (optional)
```bash
cd Startify/backend/teambuilder
python manage.py loaddata db/seeds/salary_rates_tn.json
```

## Stop Everything

```bash
# Stop backends: Ctrl+C in each terminal

# Stop Docker services
cd Startify/backend/teambuilder
docker-compose down

cd Startify
docker stop neo4j-local qdrant-local
```

## Ports Reference

| Service | Port | URL |
|---------|------|-----|
| Frontend | 3000 | http://localhost:3000 |
| Startify Backend | 8000 | http://localhost:8000 |
| TeamBuilder Backend | 8001 | http://localhost:8001 |
| Neo4j Browser | 7474 | http://localhost:7474 |
| Neo4j Bolt | 7687 | bolt://localhost:7687 |
| Qdrant | 6333 | http://localhost:6333 |
| PostgreSQL | 5433 | localhost:5433 |
| Redis | 6380 | localhost:6380 |

## Troubleshooting

**Port in use?**
```bash
lsof -i :8001  # Find process
kill -9 <PID>  # Kill it
```

**Database error?**
```bash
docker-compose ps  # Check status
docker-compose logs postgres  # Check logs
docker-compose restart postgres  # Restart
```

**Need help?**
See `TEAMBUILDER_SETUP.md` for detailed guide.
