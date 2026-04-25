# TeamBuilder Integration Summary

## What Was Done

### 1. Backend Integration ✅

**Location**: `Startify/backend/teambuilder/`

Copied all TeamBuilder backend files:
- `api/` - Django REST API endpoints
- `agent/` - LangGraph agent for team building
- `services/` - CV parser, Google OAuth, email notifications
- `tools/` - Local database search tools
- `db/` - Salary lookup and vector store
- `cache/` - Redis client
- `core/` - Django settings and configuration
- `manage.py` - Django management script
- `requirements.txt` - Python dependencies

### 2. Port Configuration ✅

**Changed ports to avoid conflicts with Startify:**

| Service | Original Port | New Port | Reason |
|---------|--------------|----------|--------|
| TeamBuilder Backend | 8000 | **8001** | Startify uses 8000 |
| PostgreSQL | 5432 | **5433** | Avoid conflicts |
| Redis | 6379 | **6380** | Avoid conflicts |
| Langfuse | 3000 | **3001** | Frontend uses 3000 |

**Startify ports (unchanged):**
- Startify Backend: 8000
- Neo4j: 7474, 7687
- Qdrant: 6333, 6334
- Frontend: 3000

### 3. Docker Configuration ✅

**Created**: `Startify/backend/teambuilder/docker-compose.yml`

Services:
- PostgreSQL 16 (port 5433)
- Redis 7 (port 6380)
- Langfuse + PostgreSQL (optional, port 3001)

### 4. Frontend Updates ✅

**Updated all TeamBuilder components to use port 8001:**

Files modified:
- `frontend/components/teambuilder/dashboard-section.tsx`
- `frontend/components/teambuilder/ai-assistant-section.tsx`
- `frontend/components/teambuilder/candidates-section.tsx`
- `frontend/components/teambuilder/upload-cv-section.tsx`
- `frontend/components/teambuilder/history-section.tsx`

All API calls now point to `http://localhost:8001` instead of `http://localhost:8000`.

### 5. Configuration Files ✅

**Created**:
- `backend/teambuilder/.env` - Environment variables with new ports
- `backend/teambuilder/README.md` - TeamBuilder-specific setup guide
- `TEAMBUILDER_SETUP.md` - Complete integration setup guide
- `INTEGRATION_SUMMARY.md` - This file
- `start-all.sh` - Quick start script for all services

**Updated**:
- `backend/teambuilder/core/settings.py` - Database port changed to 5433
- `.env.example` - Added TeamBuilder configuration notes

## File Structure

```
Startify/
├── backend/
│   ├── api/                    # Startify API (port 8000)
│   ├── config/                 # Startify Django config
│   ├── green_analysis/         # Startify green analysis
│   ├── services/               # Startify services
│   ├── manage.py               # Startify management
│   │
│   └── teambuilder/            # ← NEW: TeamBuilder backend
│       ├── api/                # TeamBuilder API
│       ├── agent/              # LangGraph agent
│       ├── services/           # CV parser, OAuth, etc.
│       ├── tools/              # Search tools
│       ├── db/                 # Salary lookup
│       ├── cache/              # Redis client
│       ├── core/               # Django config
│       ├── manage.py           # TeamBuilder management
│       ├── requirements.txt    # Python dependencies
│       ├── docker-compose.yml  # PostgreSQL + Redis
│       ├── Dockerfile          # Container build
│       ├── .env                # Environment config
│       └── README.md           # Setup guide
│
├── frontend/
│   ├── components/
│   │   ├── teambuilder/        # TeamBuilder components (use port 8001)
│   │   │   ├── dashboard-section.tsx
│   │   │   ├── ai-assistant-section.tsx
│   │   │   ├── candidates-section.tsx
│   │   │   ├── upload-cv-section.tsx
│   │   │   └── history-section.tsx
│   │   └── ...                 # Other Startify components
│   └── ...
│
├── scripts/
│   ├── start-local-stack.ps1   # Start Neo4j + Qdrant
│   └── ...
│
├── TEAMBUILDER_SETUP.md        # Complete setup guide
├── INTEGRATION_SUMMARY.md      # This file
├── start-all.sh                # Quick start script
└── .env.example                # Updated with TeamBuilder notes
```

## How It Works

### Request Flow

```
User Browser (localhost:3000)
│
├─► Startify Features
│   └─► API calls to localhost:8000 (Startify Backend)
│       └─► Uses: Neo4j, Qdrant, SQLite
│
└─► TeamBuilder Features
    └─► API calls to localhost:8001 (TeamBuilder Backend)
        └─► Uses: PostgreSQL (5433), Redis (6380), ChromaDB
```

### Running Services

**Terminal 1**: Startify Backend
```bash
cd Startify/backend
python manage.py runserver
# Runs on port 8000
```

**Terminal 2**: TeamBuilder Backend
```bash
cd Startify/backend/teambuilder
python manage.py runserver 8001
# Runs on port 8001
```

**Terminal 3**: Frontend
```bash
cd Startify/frontend
npm run dev
# Runs on port 3000
```

**Docker Services** (started once):
```bash
# Startify services
./scripts/start-local-stack.ps1  # Neo4j + Qdrant

# TeamBuilder services
cd backend/teambuilder
docker-compose up -d  # PostgreSQL + Redis
```

## Key Changes Made

### 1. Database Port Change
```python
# backend/teambuilder/core/settings.py
DATABASES = {
    'default': env.db('DATABASE_URL', 
        default='postgres://tb_user:tb_pass@localhost:5433/teambuilder')
        # Changed from 5432 to 5433 ↑
}
```

### 2. API Base URL Change
```typescript
// All TeamBuilder frontend components
const API_BASE = 'http://localhost:8001';  // Changed from 8000
```

### 3. OAuth Redirect URI
```env
# backend/teambuilder/.env
GOOGLE_REDIRECT_URI=http://localhost:8001/api/v1/auth/google/callback
# Changed from 8000 to 8001 ↑
```

## What Was NOT Changed

✅ **Startify Backend** - Still runs on port 8000
✅ **Startify Services** - Neo4j (7687), Qdrant (6333) unchanged
✅ **Startify Frontend Components** - Still call port 8000
✅ **Frontend Port** - Still runs on port 3000
✅ **Original TeamBuilder Repo** - Completely untouched

## Testing Checklist

After setup, verify:

- [ ] Startify backend responds on port 8000
- [ ] TeamBuilder backend responds on port 8001
- [ ] Frontend loads on port 3000
- [ ] Startify features work (Chat, Documents, etc.)
- [ ] TeamBuilder features work (Dashboard, AI Assistant, etc.)
- [ ] Can upload CVs
- [ ] Can view candidates
- [ ] Can build teams
- [ ] Google OAuth works for TeamBuilder
- [ ] No port conflicts

## Troubleshooting Quick Reference

### Port Already in Use
```bash
# Find what's using the port
lsof -i :8001

# Kill the process
kill -9 <PID>
```

### Database Connection Failed
```bash
# Check PostgreSQL is running
docker ps | grep teambuilder-postgres

# Restart if needed
cd backend/teambuilder
docker-compose restart postgres
```

### Redis Connection Failed
```bash
# Check Redis is running
docker ps | grep teambuilder-redis

# Test connection
redis-cli -p 6380 ping
```

### Frontend API Errors
- Check both backends are running
- Check browser console for exact error
- Verify API URLs use correct ports (8000 vs 8001)

## Next Steps

1. **Setup**: Follow `TEAMBUILDER_SETUP.md` for detailed instructions
2. **Configure**: Update `.env` files with your credentials
3. **Test**: Verify all features work
4. **Develop**: Make changes as needed

## Notes

- TeamBuilder backend is completely isolated in `backend/teambuilder/`
- All port conflicts have been resolved
- Original Startify functionality is preserved
- Original TeamBuilder repo is untouched
- Both backends can run simultaneously
- Frontend seamlessly integrates both systems

## Support

For issues:
1. Check `TEAMBUILDER_SETUP.md` troubleshooting section
2. Verify all services are running: `docker ps`
3. Check backend logs in terminals
4. Check browser console for frontend errors
