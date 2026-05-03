# Green Analysis Module

A multi-agent environmental impact analysis system for Tunisian businesses. This Django app provides an AI-powered pipeline that assesses business environmental impacts, generates ESG scores, identifies relevant certifications, and offers sustainability recommendations.

## 📋 Overview

The **green_analysis** module implements a collaborative, dependency-driven agent system using LangGraph. It processes free-text business descriptions and produces comprehensive environmental assessments, actionable recommendations, and ESG scorings tailored for Tunisian enterprises.

### Key Features

- **Free-text Input Processing**: Parses unstructured business descriptions into structured data
- **Human-in-the-Loop**: Asks clarification questions when inputs are ambiguous
- **Parallel Agent Execution**: Cert Advisor and Sustainability Coach run concurrently for efficiency
- **Live Data Integration**: Pulls real-time data from Climate Watch, World Bank, and custom knowledge bases
- **ESG Scoring**: Generates structured Environmental, Social, and Governance scores
- **Real-time Streaming**: Server-Sent Events (SSE) for live agent status updates
- **Comprehensive Reporting**: Auto-generates markdown reports with findings and recommendations
- **Transparent Reasoning**: Logs agent decision-making steps for auditability

---

## 🏗️ Architecture

### Agent Graph Flow (Dependency-Driven DAG)

```
                          ┌─ Cert Advisor ────────┐
                          │                       │
    Input Parser ──────→ Impact Analyst ────────→┤ ──────→ ESG Scorer ──→ END
         ↓                                        │
    Clarification                 Sustainability  └──────→┘ (fan-out/fan-in)
    Interrupt?                          Coach
         │
         ├─ YES → Return questions → User responds → resume with parsed_input + user_responses
         └─ NO → Continue to Impact Analyst
```

**Dependency Graph**:
- **Input Parser** (entry): No dependencies
- **Impact Analyst**: Requires `parsed_input` from Input Parser
- **Cert Advisor** (parallel): Requires `parsed_input` + `impact_assessment` from Impact Analyst
- **Sustainability Coach** (parallel): Requires `parsed_input` + `impact_assessment` from Impact Analyst
- **ESG Scorer**: Requires all previous outputs (`parsed_input`, `impact_assessment`, `certifications`, `recommendations`)
- **END**: Terminal node

**Parallelization**: Cert Advisor and Sustainability Coach execute concurrently once Impact Analyst completes, reducing total execution time.

**Interruption Pattern**: If Input Parser sets `needs_clarification=True`, the graph pauses at `interrupt()`. On resumption with user responses, the full pipeline re-runs with enriched context.

### Technology Stack

- **LLM**: Azure AI (Kimi-K2.5) via OpenAI-compatible endpoint
- **Graph Engine**: LangGraph with SQLite checkpointing
- **Database**: Django ORM + SQLite checkpoints for session persistence
- **Data Sources**: Climate Watch API, World Bank API, FAISS vector store (knowledge base)
- **API Framework**: Django REST Framework with Server-Sent Events

---

## 🤖 Agents

### 1. **Input Parser** (`agents/input_parser.py`)

**Purpose**: Extract structured business data from free-text descriptions.

**Outputs**:
- `business_description` (str): Cleaned summary
- `industry_sector` (str): Primary sector (agriculture, textiles, IT, etc.)
- `sub_sector` (str): Detailed sub-sector classification
- `location` (str): Business location in Tunisia
- `scale` (str): micro, small, medium, or large
- `activities` (list[str]): Key business operations
- `resources_used` (list[str]): Energy, water, raw materials, chemicals, etc.
- `exports_to_eu` (bool): EU export eligibility (CBAM relevant)

**Special Behavior**:
- Sets `needs_clarification=True` if input is too vague
- Generates follow-up questions for the user
- On re-run, merges user responses into enriched context

---

### 2. **Impact Analyst** (`agents/impact_analyst.py`)

**Purpose**: Assess environmental impacts using live data and knowledge base.

**Data Sources**:
- FAISS vector store (semantic sector search)
- Climate Watch API (emissions data for Tunisia)
- World Bank API (energy profiles, climate metrics)
- Custom knowledge base (certifications, emission factors)

**Outputs**:
- `primary_impacts` (list[str]): Major environmental concerns
- `emissions_profile` (dict): Estimated emissions by category
- `water_usage` (dict): Water consumption risks
- `waste_streams` (dict): Waste categories and volumes
- `supply_chain_risks` (list[str]): External environmental dependencies
- `regulatory_alignment` (dict): CBAM, EU taxonomy compliance status

**Transparency**: Logs every tool call and data retrieval in `agent_trace`

---

### 3. **Cert Advisor** (`agents/cert_advisor.py`)

**Purpose**: Identify relevant environmental and quality certifications. *Runs in parallel with Sustainability Coach.*

**Outputs**:
- `certifications` (list[Certification]): Recommended certifications
  - `name` (str): Certification title
  - `issuer` (str): Certifying body
  - `relevance_score` (float): 0–1 relevance to business
  - `effort_level` (str): low, medium, high
  - `timeline_months` (int): Estimated time to achieve
  - `url` (str): Reference link

---

### 4. **Sustainability Coach** (`agents/sustainability_coach.py`)

**Purpose**: Generate actionable sustainability recommendations. *Runs in parallel with Cert Advisor.*

**Outputs**:
- `recommendations` (list[Recommendation]): Prioritized action items
  - `title` (str): Recommendation title
  - `description` (str): Detailed explanation
  - `priority` (str): critical, high, medium, low
  - `category` (str): energy, water, waste, supply_chain, compliance, culture
  - `estimated_cost` (str): Financial impact estimate
  - `payback_period_months` (int or null): ROI timeline

---

### 5. **ESG Scorer** (`agents/esg_scorer.py`)

**Purpose**: Synthesize all previous outputs into final ESG scores and report.

**Outputs**:
- `esg_score` (ESGScore): Structured scoring
  - `e_score` (float): Environmental (0–100)
  - `s_score` (float): Social (0–100)
  - `g_score` (float): Governance (0–100)
  - `overall_score` (float): Weighted average
  - `rating` (str): A, B, C, D (grade)
  - `interpretation` (str): Plain-language summary
- `final_report` (str): Markdown report with all findings

---

## 📊 Data Models

### AnalysisSession (`models.py`)

Central Django model persisting all analysis state:

```python
AnalysisSession
├─ id (UUID, primary key)
├─ status (pending → clarification_needed → processing → completed/failed)
├─ raw_input (str)                          # Original user input
├─ follow_up_questions (JSON)               # If clarification needed
├─ user_responses (JSON)                    # User's answers to follow-ups
├─ parsed_input (JSON)                      # ParsedInput model
├─ impact_assessment (JSON)                 # ImpactAssessment model
├─ certifications (JSON list)               # Cert Advisor output
├─ recommendations (JSON list)              # Sustainability Coach output
├─ esg_score (JSON)                         # ESGScore model
├─ final_report (str)                       # Markdown report
├─ errors (JSON list)                       # Error log
├─ agent_status (JSON dict)                 # Real-time per-agent status
├─ agent_trace (JSON dict)                  # Per-agent reasoning traces
├─ created_at (datetime)
└─ updated_at (datetime)
```

---

## 🔌 API Endpoints

All endpoints are under `/api/green-analysis/` (see `api/urls.py` for routing).

### 1. POST `/`

**Create and start a new analysis.**

**Request**:
```json
{
  "raw_input": "We produce organic tomatoes and strawberries in the Sousse region..."
}
```

**Response** (202 Accepted):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "Analysis queued"
}
```

**Note**: Starts the analysis asynchronously in the background.

---

### 2. GET `/{id}/`

**Get full analysis results.**

**Response** (200 OK):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "raw_input": "...",
  "parsed_input": {
    "business_description": "...",
    "industry_sector": "agriculture",
    "sub_sector": "crop production",
    "location": "Sousse",
    "scale": "small",
    "activities": ["organic farming", "direct sales"],
    "resources_used": ["water", "land", "organic pesticides"],
    "exports_to_eu": false
  },
  "impact_assessment": { ... },
  "certifications": [ ... ],
  "recommendations": [ ... ],
  "esg_score": { ... },
  "final_report": "# Environmental Analysis Report\n...",
  "errors": [],
  "agent_status": {
    "input_parser": "completed",
    "impact_analyst": "completed",
    "cert_advisor": "completed",
    "sustainability_coach": "completed",
    "esg_scorer": "completed"
  },
  "agent_trace": { ... },
  "created_at": "2026-05-03T10:30:00Z",
  "updated_at": "2026-05-03T10:35:00Z"
}
```

---

### 3. GET `/{id}/stream/`

**Stream live agent status updates via Server-Sent Events (SSE).**

**Usage** (JavaScript):
```javascript
const eventSource = new EventSource(`/api/green-analysis/${sessionId}/stream/`);
eventSource.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log(`Agent ${update.agent}: ${update.status}`);
};
```

**Example Event**:
```json
{
  "type": "status",
  "agent": "impact_analyst",
  "status": "running",
  "timestamp": "2026-05-03T10:31:45Z"
}
```

---

### 4. POST `/{id}/followup/`

**Submit answers to clarification questions.**

**Request**:
```json
{
  "user_responses": {
    "question_1": "We currently use drip irrigation",
    "question_2": "About 5 employees"
  }
}
```

**Response** (200 OK):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "message": "Analysis resumed with clarifications"
}
```

**Behavior**: Merges responses into context and re-runs the full pipeline.

---

### 5. GET `/{id}/report/`

**Retrieve only the final markdown report.**

**Response** (200 OK):
```json
{
  "final_report": "# Environmental Analysis & Green Recommendations Report\n\n..."
}
```

---

## 🛠️ Tools & Data Sources

### Tools (`tools/`)

#### `climate_watch.py`
Fetches Tunisia's historical emissions data by sector from the Climate Watch API.
- **Function**: `get_tunisia_emissions(sector, start_year, end_year)`

#### `world_bank.py`
Retrieves Tunisia's energy profile, climate vulnerability indices, and development metrics.
- **Function**: `get_tunisia_energy_profile()`

#### `knowledge_base.py`
Wraps the FAISS vector store for semantic sector/industry searches.
- **Function**: `semantic_sector_search(sector_description)`

#### `vectorstore.py`
Manages the FAISS index and embedding pipeline.
- **Index Location**: `knowledge/faiss_index/index.faiss`
- **Embeddings Model**: Configured via environment

#### `web_search.py`
Optional live web search for real-time regulatory or market data.

### Knowledge Base (`knowledge/data/`)

#### `certifications.json`
Pre-loaded Tunisian and EU environmental certifications.

#### `emission_factors.json`
Sector-specific GHG emission factors for impact modeling.

#### `tunisian_programs.json`
National green business incentives and support programs.

---

## 🚀 Setup & Configuration

### Environment Variables

Create a `.env` file in the backend root or set these in your environment:

```bash
# Azure AI (shared across all agents)
AZURE_GREEN_API_KEY=<your-azure-api-key>
AZURE_GREEN_ENDPOINT=<your-azure-endpoint>
AZURE_GREEN_MODEL=Kimi-K2.5

# Optional: Groq fallback (used in some agent alternatives)
GROQ_API_KEY=<your-groq-key>

# Optional: Web search
TAVILY_API_KEY=<your-tavily-key>

# Optional: Knowledge base / embeddings
EMBEDDINGS_MODEL=sentence-transformers/all-MiniLM-L6-v2

# Django settings
DEBUG=False
SECRET_KEY=<your-django-key>
ALLOWED_HOSTS=localhost,127.0.0.1
```

### Database Setup

```bash
# Run migrations to create AnalysisSession table
python manage.py migrate green_analysis

# Optional: Seed knowledge base (if provided)
python manage.py load_certifications  # custom command
```

### FAISS Index

The FAISS vector store must be pre-built from knowledge data:

```python
# Or via a management command
python manage.py build_faiss_index
```

---

## 💻 Usage Example (Backend)

### Via Django Shell

```python
from green_analysis.models import AnalysisSession
from green_analysis.agents.graph import build_graph
from langgraph.checkpoint.sqlite import SqliteSaver
import sqlite3

# Create a session
session = AnalysisSession.objects.create(
    raw_input="We make eco-friendly packaging from recycled plastic in Tunisia..."
)

# Build graph with checkpointer
conn = sqlite3.connect("checkpoints.sqlite3", check_same_thread=False)
checkpointer = SqliteSaver(conn)
graph = build_graph(checkpointer=checkpointer)

# Run pipeline
config = {"configurable": {"thread_id": str(session.id)}}
final_state = graph.invoke(
    {"raw_input": session.raw_input},
    config=config
)

# Update session with results
session.parsed_input = final_state.get("parsed_input")
session.impact_assessment = final_state.get("impact_assessment")
session.certifications = final_state.get("certifications", [])
session.esg_score = final_state.get("esg_score")
session.final_report = final_state.get("final_report", "")
session.status = AnalysisSession.Status.COMPLETED
session.save()
```

### Via REST API (Frontend/Client)

```bash
# 1. Start analysis
curl -X POST http://localhost:8000/api/green-analysis/ \
  -H "Content-Type: application/json" \
  -d '{"raw_input": "We make textile dyes in Sfax..."}'

# Returns: {"id": "...", "status": "pending"}

# 2. Poll for results
curl -X GET http://localhost:8000/api/green-analysis/{id}/

# 3. Stream live updates
curl -X GET http://localhost:8000/api/green-analysis/{id}/stream/ \
  --header "Accept: text/event-stream"

# 4. If clarification needed, submit responses
curl -X POST http://localhost:8000/api/green-analysis/{id}/followup/ \
  -H "Content-Type: application/json" \
  -d '{"user_responses": {"q1": "answer", "q2": "answer"}}'

# 5. Get report
curl -X GET http://localhost:8000/api/green-analysis/{id}/report/
```

---

## 📝 Agent Prompts

Each agent has a dedicated markdown prompt file in `prompts/`:

- `input_parser.md` — Instructions for structuring business data
- `impact_analyst.md` — Environmental assessment methodology
- `cert_advisor.md` — Certification recommendation logic
- `sustainability_coach.md` — Recommendation prioritization
- `esg_scorer.md` — ESG scoring framework

**To customize agents**, edit these markdown files. Prompts are loaded at runtime.

---

## 🔍 Real-time Status & Transparency

### Agent Status Tracking

The `agent_status` JSON in the database tracks each agent's state:

```json
{
  "input_parser": "completed",
  "impact_analyst": "running",
  "cert_advisor": "queued",
  "sustainability_coach": "queued",
  "esg_scorer": "pending"
}
```

### Agent Traces

The `agent_trace` JSON logs decision-making steps:

```json
{
  "input_parser": [
    {"step": "parse_input", "detail": "Extracted sector: agriculture"},
    {"step": "validate", "detail": "Scale: small ✓"},
    {"step": "clarification_check", "detail": "All fields complete"}
  ],
  "impact_analyst": [
    {"step": "tool_call", "detail": "Semantic search for 'agriculture'"},
    {"step": "tool_result", "detail": "Matched sector 'crop_production' (relevance: 0.87)"},
    ...
  ]
}
```

---

## 🧪 Testing

```bash
# Run unit tests
python manage.py test green_analysis

# Run with coverage
coverage run --source='green_analysis' manage.py test green_analysis
coverage report
```

---

## 📦 Project Structure

```
green_analysis/
├── __init__.py
├── admin.py                    # Django admin configuration
├── apps.py                     # App config
├── models.py                   # AnalysisSession model
├── views.py                    # Django views (deprecated)
├── tests.py                    # Unit tests
├── agents/                     # Agent implementations
│   ├── __init__.py
│   ├── state.py                # EnvironmentalState (Pydantic schema)
│   ├── graph.py                # LangGraph StateGraph builder
│   ├── input_parser.py         # Input Parser agent
│   ├── impact_analyst.py       # Impact Analyst agent
│   ├── cert_advisor.py         # Cert Advisor agent
│   ├── sustainability_coach.py # Sustainability Coach agent
│   └── esg_scorer.py           # ESG Scorer agent
├── api/                        # REST API
│   ├── __init__.py
│   ├── serializers.py          # DRF serializers
│   ├── views.py                # API views (endpoints)
│   └── urls.py                 # URL routing
├── tools/                      # Data integration tools
│   ├── __init__.py
│   ├── climate_watch.py        # Climate Watch API client
│   ├── world_bank.py           # World Bank API client
│   ├── knowledge_base.py       # Knowledge base wrapper
│   ├── vectorstore.py          # FAISS index manager
│   └── web_search.py           # Web search tool
├── knowledge/                  # Knowledge base assets
│   ├── __init__.py
│   ├── data/                   # JSON knowledge files
│   │   ├── certifications.json
│   │   ├── emission_factors.json
│   │   └── tunisian_programs.json
│   └── faiss_index/            # Pre-built FAISS index
│       └── index.faiss
├── prompts/                    # Agent prompts (markdown)
│   ├── __init__.py
│   ├── input_parser.md
│   ├── impact_analyst.md
│   ├── cert_advisor.md
│   ├── sustainability_coach.md
│   └── esg_scorer.md
├── services/                   # Shared business logic (optional)
├── migrations/                 # Django migrations
└── README.md                   # This file
```

---

## 🚦 Status Workflow

1. **PENDING**: Analysis queued, not yet started
2. **CLARIFICATION_NEEDED**: Input Parser found ambiguities; awaiting user responses
3. **PROCESSING**: Agents are running (impact_analyst, cert_advisor, etc.)
4. **COMPLETED**: All agents finished; results available
5. **FAILED**: An agent error occurred; check `errors` field

---

## 🔧 Troubleshooting

### "AZURE_GREEN_API_KEY is not set"

**Issue**: Warning logged; API calls fail.

**Solution**: Set `AZURE_GREEN_API_KEY` and `AZURE_GREEN_ENDPOINT` environment variables.

### "database is locked"

**Issue**: Parallel writes to SQLite cause contention.

**Solution**: Graph.py uses a Python-level `threading.Lock()` to serialize writes safely. No action needed.

### FAISS index not found

**Issue**: `semantic_sector_search` fails.

**Solution**: 
```bash
python manage.py build_faiss_index
# Or verify index path: knowledge/faiss_index/index.faiss
```

### Agent timeout

**Issue**: LLM call takes too long or hangs.

**Solution**: 
- Check Azure endpoint connectivity
- Verify API key is valid
- Review LLM rate limits
- Increase timeout in LangGraph config if needed

---

## 📚 References

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [Pydantic Documentation](https://docs.pydantic.dev/)
- [Django REST Framework](https://www.django-rest-framework.org/)
- [FAISS](https://github.com/facebookresearch/faiss)
- [Climate Watch API](https://www.climatewatchdata.org/data-api)
- [World Bank API](https://data.worldbank.org/developers)

---

## 📄 License

Part of the Startify platform. Internal use only.

---

## 🤝 Contributing

When adding new agents or tools:

1. Add state schema to `agents/state.py`
2. Implement agent logic in `agents/{agent_name}.py`
3. Update graph flow in `agents/graph.py`
4. Add API endpoint in `api/views.py` if needed
5. Create markdown prompt in `prompts/{agent_name}.md`
6. Update this README
7. Add tests to `tests.py`

---

**Last Updated**: May 2026  
**Maintainer**: Startify Engineering Team
