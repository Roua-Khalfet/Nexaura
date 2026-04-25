# TeamBuilder Integration Setup Guide

This guide explains how to run the integrated Startify + TeamBuilder platform.

## Architecture Overview

```
Startify Platform
├── Startify Backend (Django) - Port 8000
│   ├── ComplianceGuard features
│   ├── Green Analysis
│   └── Uses: Neo4j (7687), Qdrant (6333), SQLite
│
├── TeamBuilder Backend (Django) - Port 8001
│   ├── CV Upload & Parsing
│   ├── Candidate Management
│   ├── AI Team Builder
│   └── Uses: PostgreSQL (5433), Redis (6380), ChromaDB
│
└── Frontend (Next.js) - Port 3000
    ├── Startify sections (Chat, Documents, Conformité, etc.)
    └── TeamBuilder sections (Dashboard, AI Assistant, Upload CVs, Candidates, History)
```

## Port Configuration

### Startify Services (Original - Don't Touch)
- **Startify Backend**: 8000
- **Neo4j**: 7474 (HTTP), 7687 (Bolt)
- **Qdrant**: 6333, 6334
- **Frontend**: 3000

### TeamBuilder Services (New - Modified Ports)
- **TeamBuilder Backend**: 8001 (changed from 8000)
- **PostgreSQL**: 5433 (changed from 5432)
- **Redis**: 6380 (changed from 6379)
- **Langfuse** (optional): 3001 (changed from 3000)

## Step-by-Step Setup

### 1. Start Startify Services (Original Setup)

```bash
cd Startify

# Start Neo4j and Qdrant using the original script
.\scripts\start-local-stack.ps1

# Verify services are running
.\scripts\check-local-stack.ps1
```

### 2. Start TeamBuilder Docker Services

```bash
cd Startify/backend/teambuilder

# Start PostgreSQL and Redis
docker-compose up -d

# Verify services are running
docker-compose ps
```

You should see:
- `teambuilder-postgres` - Up
- `teambuilder-redis` - Up

### 3. Configure TeamBuilder Environment

```bash
cd Startify/backend/teambuilder

# Copy your Google OAuth credentials from original teambuilder
# Edit .env and update:
# - GOOGLE_CLIENT_ID
# - GOOGLE_CLIENT_SECRET
# - OPENAI_API_KEY (if using)
```

**Important**: Update Google OAuth redirect URI in Google Cloud Console:
```
http://localhost:8001/api/v1/auth/google/callback
```

### 4. Install TeamBuilder Dependencies

```bash
cd Startify/backend/teambuilder

# Create virtual environment (or use existing)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 5. Run TeamBuilder Migrations

```bash
cd Startify/backend/teambuilder

python manage.py migrate
```

### 6. Load Salary Data (Optional)

```bash
cd Startify/backend/teambuilder

python manage.py loaddata db/seeds/salary_rates_tn.json
```

### 7. Start Startify Backend

```bash
cd Startify/backend

# Activate Startify's virtual environment
source ../.venv/bin/activate  # Adjust path as needed

# Start on port 8000 (default)
python manage.py runserver
```

Keep this terminal running.

### 8. Start TeamBuilder Backend

Open a **new terminal**:

```bash
cd Startify/backend/teambuilder

# Activate TeamBuilder's virtual environment
source venv/bin/activate

# Start on port 8001
python manage.py runserver 8001
```

Keep this terminal running.

### 9. Start Frontend

Open a **new terminal**:

```bash
cd Startify/frontend

# Install dependencies (first time only)
npm install

# Start development server
npm run dev
```

### 10. Access the Application

Open your browser to: **http://localhost:3000**

- **Startify sections** call APIs on port 8000
- **TeamBuilder sections** call APIs on port 8001

## Verification Checklist

### Check All Services Are Running

```bash
# Neo4j
curl http://localhost:7474

# Qdrant
curl http://localhost:6333/collections

# PostgreSQL (TeamBuilder)
psql -h localhost -p 5433 -U tb_user -d teambuilder

# Redis (TeamBuilder)
redis-cli -p 6380 ping

# Startify Backend
curl http://localhost:8000/api/

# TeamBuilder Backend
curl http://localhost:8001/health

# Frontend
curl http://localhost:3000
```

### Test TeamBuilder Features

1. **Login**: Go to http://localhost:3000/login
2. **Upload CV**: Navigate to "Upload CVs" in TeamBuilder section
3. **View Candidates**: Navigate to "Candidates" in TeamBuilder section
4. **AI Assistant**: Navigate to "AI Assistant" in TeamBuilder section
5. **Dashboard**: Navigate to "Dashboard" in TeamBuilder section

## Troubleshooting

### Port Conflicts

If you get "Address already in use" errors:

```bash
# Check what's using a port
lsof -i :8001  # or :5433, :6380, etc.

# Kill the process
kill -9 <PID>
```

### Database Connection Errors

```bash
# Check PostgreSQL is running
docker-compose ps

# Check logs
docker-compose logs postgres

# Restart if needed
docker-compose restart postgres
```

### Redis Connection Errors

```bash
# Check Redis is running
docker-compose ps

# Test connection
redis-cli -p 6380 ping

# Should return: PONG
```

### Backend Not Starting

```bash
# Check if port is already in use
lsof -i :8001

# Check Python dependencies
pip list | grep Django

# Check database connection
python manage.py check
```

### Frontend API Errors

Check browser console for errors. Common issues:
- Backend not running on correct port
- CORS errors (check Django CORS settings)
- API key mismatch

## Stopping Services

### Stop Backends
Press `Ctrl+C` in each terminal running Django servers.

### Stop TeamBuilder Docker Services
```bash
cd Startify/backend/teambuilder
docker-compose down
```

### Stop Startify Docker Services
```bash
# Stop Neo4j
docker stop neo4j-local

# Stop Qdrant
docker stop qdrant-local
```

## Development Workflow

### Making Changes to TeamBuilder Backend

1. Edit files in `Startify/backend/teambuilder/`
2. Django auto-reloads on file changes
3. If you add models, run migrations:
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

### Making Changes to TeamBuilder Frontend

1. Edit files in `Startify/frontend/components/teambuilder/`
2. Next.js auto-reloads on file changes
3. If you change API endpoints, update the port to 8001

### Syncing with Original TeamBuilder

If you need to pull updates from the original teambuilder repo:

```bash
# Copy updated files
cp -r teambuilder/api/* Startify/backend/teambuilder/api/
cp -r teambuilder/services/* Startify/backend/teambuilder/services/
# etc.

# Run migrations if models changed
cd Startify/backend/teambuilder
python manage.py migrate
```

## Environment Variables Reference

### Startify Backend (.env in Startify root)
```env
DJANGO_SECRET_KEY=...
NEO4J_URI=bolt://localhost:7687
NEO4J_PASSWORD=neo4j123
QDRANT_URL=http://localhost:6333
OPENAI_API_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

### TeamBuilder Backend (.env in Startify/backend/teambuilder)
```env
DATABASE_URL=postgresql://tb_user:tb_pass@localhost:5433/teambuilder
REDIS_URL=redis://localhost:6380/0
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8001/api/v1/auth/google/callback
OPENAI_API_KEY=...
```

## Production Deployment

For production, you'll want to:

1. Use environment-specific configurations
2. Set `DEBUG=False` in both backends
3. Use proper secret keys
4. Configure HTTPS
5. Use production-grade databases
6. Set up proper CORS origins
7. Use gunicorn/uwsgi for Django
8. Use nginx as reverse proxy

## Support

If you encounter issues:
1. Check this guide's troubleshooting section
2. Check Docker logs: `docker-compose logs`
3. Check Django logs in terminal
4. Check browser console for frontend errors
