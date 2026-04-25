#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Startify + TeamBuilder Platform${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running. Please start Docker Desktop.${NC}"
    exit 1
fi

# Start Startify services (Neo4j + Qdrant)
echo -e "${YELLOW}Starting Startify services (Neo4j + Qdrant)...${NC}"
cd scripts
./start-local-stack.ps1
cd ..

# Start TeamBuilder services (PostgreSQL + Redis)
echo -e "${YELLOW}Starting TeamBuilder services (PostgreSQL + Redis)...${NC}"
cd backend/teambuilder
docker-compose up -d
cd ../..

# Wait for services to be ready
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 5

# Check services
echo ""
echo -e "${GREEN}Checking services status:${NC}"
echo -e "Neo4j (7474): $(curl -s -o /dev/null -w '%{http_code}' http://localhost:7474)"
echo -e "Qdrant (6333): $(curl -s -o /dev/null -w '%{http_code}' http://localhost:6333)"
echo -e "PostgreSQL (5433): $(docker ps --filter name=teambuilder-postgres --format '{{.Status}}')"
echo -e "Redis (6380): $(docker ps --filter name=teambuilder-redis --format '{{.Status}}')"

echo ""
echo -e "${GREEN}All Docker services started!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Start Startify backend:"
echo "   cd backend && python manage.py runserver"
echo ""
echo "2. Start TeamBuilder backend (in new terminal):"
echo "   cd backend/teambuilder && python manage.py runserver 8001"
echo ""
echo "3. Start frontend (in new terminal):"
echo "   cd frontend && npm run dev"
echo ""
echo -e "${GREEN}Then open: http://localhost:3000${NC}"
