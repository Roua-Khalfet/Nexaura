# Nexaura — AI Compliance & Growth Platform for Tunisian Startups

Nexaura is an **integrated AI platform** that combines **legal compliance, market intelligence, and recruitment automation** for Tunisian startups. Built at **Esprit School of Engineering**, it merges **ComplianceGuard** (regulatory compliance + ESG analysis) and **TeamBuilder** (AI-powered hiring) into one Next.js + Django solution.

---

## Overview

Nexaura helps founders and HR teams with **regulatory compliance**, **market analysis**, **document generation**, **talent acquisition**, and **data-driven decision-making**. It leverages **RAG**, **Knowledge Graphs**, **LLMs**, **A2A orchestration**, and **MCP-ready tools** to deliver actionable insights.

---

## Why Nexaura stands out

- **Multi‑agent A2A** workflows that collaborate on complex market and legal tasks  
- **RLM‑powered compliance reasoning** for regulatory accuracy and speed  
- **MCP‑ready architecture** to plug in new tools and data sources fast  
- **End‑to‑end product**: legal + ESG + market + hiring in one platform  

---

## Features
![ComplianceGuard — Legal](screens/Capture%20d%27%C3%A9cran%202026-04-30%20195733.png)
### ComplianceGuard (Legal Compliance Agents)
- **GraphRAG + CRAG** hybrid retrieval (Qdrant + Neo4j) for legal Q&A  
- **RLM** for compliance reasoning and regulatory validation  
- **Regulatory compliance scoring** tailored to sector and company profile  
- **Document generation** (statuts, CGU, contracts, Startup Act label)  
- **Regulatory watch** (veille) on official Tunisian sources   


![TeamBuilder — Candidates](screens/Capture%20d%27%C3%A9cran%202026-04-30%20195829.png)

![ComplianceGuard — Documents](screens/Capture%20d%27%C3%A9cran%202026-04-30%20195742.png)

### Market Scout (Market Intelligence Agents)
- **Market analysis pipeline**: Recherche → Collecte des données → Génération  
- Competitive intelligence and market research from web + reviews  

![Market Scout](screens/Capture%20d%27%C3%A9cran%202026-04-30%20195749.png)

### Green Agent (ESG & Sustainability Agents)
- **Green/ESG analysis** with scoring and recommendations  
 

![Green Agent](screens/Capture%20d%27%C3%A9cran%202026-04-30%20195801.png)

### TeamBuilder (Recruitment & HR Automation)
- **CV parsing** (PDF/DOCX/images) with AI extraction  
- **Candidate pool management** and filtering  
- **AI team recommendations** based on project needs  
- **Email invitations** and outreach tracking  
- **Analytics dashboard** for HR KPIs    


![Tech Agent](screens/Capture%20d%27%C3%A9cran%202026-04-30%20195842.png)


### Tech Agent (Technical Advisory Agent)
- Technical guidance, workflow support, and decision assistance    

![TeamBuilder — Dashboard](screens/Capture%20d%27%C3%A9cran%202026-04-30%20195820.png)

---

## Tech Stack

### Frontend
- **Next.js 16**, **React 19**, **TailwindCSS 4**
- **Framer Motion**, **Radix UI**, **Recharts**

### Backend
- **Python 3.12**, **Django REST**
- **Neo4j**, **Qdrant**, **SQLite**, **PostgreSQL**, **Redis**
- **LangGraph**, **LLM providers (Groq/Azure/OpenRouter)**, **Ollama embeddings**

### Other Tools
- **Docker**, **Serper**, **Crawl4AI**, **Playwright**

---

## Directory Structure

```
AI project/
├── complianceguard/          # Core RAG/CRAG engine + legal agents
├── backend/                  # Django REST API (ComplianceGuard + services)
│   ├── green_analysis/        # Green Agent (ESG pipeline)
│   └── tech-agent/            # Tech Agent service
├── backend/teambuilder/      # TeamBuilder backend (HR + recruitment)
├── frontend/                 # Next.js UI (ComplianceGuard + TeamBuilder)
│   └── lib/marketscout/agents # Market Scout agents
├── Data/                     # Source legal documents (PDFs)
├── screens/                  # UI screenshots for documentation
```

---

## Installation

### Prerequisites
- **Python 3.12+**
- **Node.js 18+**
- **Docker Desktop**
- **Ollama** (embeddings)
- API keys: **Groq** or **Azure OpenAI**, **Serper**

### Quick Start
```bash
# 1) Start databases
.\scripts\start-local-stack.ps1
cd backend/teambuilder
docker compose up -d

# 2) Backend (ComplianceGuard)
cd ..\..
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cd backend
python manage.py migrate
python manage.py runserver 8000

# 3) Backend (TeamBuilder)
cd ..\backend\teambuilder
..\..\..\.venv\Scripts\python manage.py migrate
..\..\..\.venv\Scripts\python manage.py runserver 8001

# 4) Frontend
cd ..\..\frontend
npm install
npm run dev
```

---

## Usage

Open **http://localhost:3000** and navigate:
- **ComplianceGuard** for legal compliance, ESG analysis, and market intelligence  
- **TeamBuilder** for recruitment, CV parsing, and AI hiring workflows  

---

## Acknowledgments

This project was developed at **Esprit School of Engineering** with a focus on Tunisian startup compliance, AI-assisted market research, and HR automation.
