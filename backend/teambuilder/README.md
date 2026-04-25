# TeamBuilder Backend

This is the TeamBuilder backend integrated into Startify.

## Port Configuration

To avoid conflicts with Startify services:
- **Backend API**: Port 8001 (instead of 8000)
- **PostgreSQL**: Port 5433 (instead of 5432)
- **Redis**: Port 6380 (instead of 6379)
- **Langfuse**: Port 3001 (instead of 3000)

## Quick Start

### 1. Start Docker Services

```bash
cd Startify/backend/teambuilder
docker-compose up -d
```

This starts:
- PostgreSQL on port 5433
- Redis on port 6380

### 2. Configure Environment

Copy your Google OAuth credentials from `teambuilder/.env` to `Startify/backend/teambuilder/.env`:

```bash
# Update these in .env:
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

**Important**: Update Google OAuth redirect URI to:
```
http://localhost:8001/api/v1/auth/google/callback
```

### 3. Install Dependencies

```bash
# From Startify root
cd backend/teambuilder
pip install -r requirements.txt
```

### 4. Run Migrations

```bash
python manage.py migrate
```

### 5. Load Salary Data (Optional)

```bash
python manage.py loaddata db/seeds/salary_rates_tn.json
```

### 6. Start Backend

```bash
python manage.py runserver 8001
```

Backend will be available at: http://localhost:8001

## API Endpoints

All TeamBuilder API endpoints are now on port 8001:
- `http://localhost:8001/api/v1/team-builder`
- `http://localhost:8001/api/v1/hr/candidates`
- `http://localhost:8001/api/v1/hr/upload-cv`
- etc.

## Frontend Integration

The Startify frontend has been updated to call TeamBuilder APIs on port 8001.

## Stopping Services

```bash
docker-compose down
```

## Troubleshooting

### Port Already in Use

If you get port conflicts:
1. Check what's using the port: `lsof -i :5433` (or 6380)
2. Stop the conflicting service
3. Or change the port in `docker-compose.yml`

### Database Connection Error

Make sure PostgreSQL is running:
```bash
docker-compose ps
```

Should show `teambuilder-postgres` as `Up`.

### Redis Connection Error

Make sure Redis is running:
```bash
docker-compose ps
```

Should show `teambuilder-redis` as `Up`.
