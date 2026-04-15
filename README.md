# 🚀 MarketScout

> Axe **Analyse Concurrentielle & Marketing** du projet **Startify**

**MarketScout** est un système multi-agents intelligent dédié à l'analyse concurrentielle des startups d'un point de vue marketing. À partir d'une simple description de projet, il génère automatiquement une étude concurrentielle complète : SWOT, personas, actions prioritaires, présentation et pitch audio.

---

## 🎯 Objectifs

- 🔍 Identifier et analyser les concurrents directs et indirects
- 📊 Générer un SWOT individuel + un SWOT combiné multi-concurrents
- ⚡ Définir des stratégies dérivées et des actions prioritaires
- 🧠 Créer des personas clients complets avec image générée par IA
- 📑 Exporter l'étude en présentation PowerPoint ou PDF
- 🎤 Générer un pitch audio du projet

---

## 🧠 Architecture Multi-Agents

Le système repose sur un **pipeline séquentiel** d'agents intelligents orchestrés via LangChain, avec deux modules transversaux.

### 🔄 Pipeline séquentiel

```
[Utilisateur] ──► chatbot_agent
                      │
                      ▼
               sharedContext.js  ◄─── (stockage partagé de tous les agents)
                      │
                      ▼
               agent1_search
               Scraping des URLs concurrents via Serper API
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
   agent2_scraper          agent2b_reviews
   Contenu des pages       Avis, ratings, commentaires
   (LLM Groq)              (Jina / Groq / Serper)
   Maps, réseaux sociaux
          └───────────┬───────────┘
                      ▼
               agent3_swot
               SWOT individuel + SWOT combiné
               Stratégies dérivées + Actions prioritaires
               Affichage des concurrents directs
                      │
                      ▼
            Dashboard · PPT/PDF · Pitch audio
```

### 🔀 Modules indépendants

| Module | Rôle | Déclenchement |
|---|---|---|
| `agent4_persona.js` | Génère une fiche persona complète + image via Hugging Face API | Indépendant — depuis la description initiale uniquement |
| `llmRouter.js` | Bascule automatiquement entre LLaMA 3.1 et LLaMA 3.3 si une clé API atteint sa limite | Transversal — actif sur tous les agents |
| `sharedContext.js` | Base de données en mémoire partagée — stocke toutes les données extraites par les agents 1, 2, 2b et 3 | Persistant tout au long du pipeline |

---

## 🤖 Détail des agents

### `chatbot_agent.js`
Dialogue avec l'utilisateur pour collecter toutes les informations nécessaires à l'analyse : secteur, cible, différenciateurs, budget, zone géographique, etc.

### `agent1_search.js`
Utilise l'API **Serper** pour effectuer des recherches Google et extraire les URLs des concurrents potentiels. C'est le point d'entrée du pipeline de collecte de données.

### `agent2_scraper.js`
Scrape le contenu textuel des pages web identifiées par agent1. Utilise **LLM Groq** pour extraire et structurer les informations pertinentes (offre, positionnement, prix...).

### `agent2b_reviews.js`
En **parallèle** de agent2, il scrape les avis clients, notes et commentaires depuis les réseaux sociaux, Google Maps et autres plateformes. Utilise **Jina + Groq + Serper**.

### `agent3_swot.js`
Agrège toutes les données des agents précédents pour produire :
- Un **SWOT individuel** par concurrent
- Un **SWOT combiné** croisant le projet avec ses concurrents
- Des **stratégies dérivées** actionnables
- Un **plan d'actions prioritaires**
- Une **liste des concurrents directs** illustrée

### `agent4_persona.js`
Fonctionne **indépendamment** du pipeline principal. À partir de la description initiale du projet, génère :
- Une fiche persona complète (démographie, motivations, comportements, douleurs)
- Une **image du persona** générée via l'API **Hugging Face**

### `llmRouter.js`
Gère le routage intelligent entre les modèles LLM. Si une clé Groq atteint sa limite de débit, il bascule automatiquement vers une autre clé ou un autre modèle (LLaMA 3.1 ↔ LLaMA 3.3).

### `sharedContext.js`
Joue le rôle de **base de données en mémoire partagée** entre tous les agents. Stocke les URLs, le contenu scrappé, les avis et les analyses pour éviter les appels redondants.

---

## 🛠️ Stack Technologique

| Couche | Technologie |
|---|---|
| Frontend | React.js + Vite |
| Backend | Django + Django REST Framework |
| Orchestration IA | LangChain |
| LLM | LLaMA 3.1 Instruct + LLaMA 3.3 Versatile via Groq API |
| Recherche web | Serper API |
| Scraping enrichi | Jina AI |
| Génération d'images | Hugging Face API |
| Export présentation | pptxgenjs |
| Export PDF | jsPDF + html2canvas |

---

## 📁 Structure du projet

```
startup-analyzer/
│
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── config/
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── api/
│   │   ├── views.py
│   │   ├── urls.py
│   │   └── models.py
│   └── shared_contexts/
│
├── src/
│   ├── agents/
│   │   ├── agent1_search.js       # Recherche URLs via Serper
│   │   ├── agent2_scraper.js      # Scraping contenu pages (Groq)
│   │   ├── agent2b_reviews.js     # Scraping avis (Jina + Groq + Serper)
│   │   ├── agent3_swot.js         # SWOT + stratégies + actions
│   │   ├── agent4_persona.js      # Persona + image (Hugging Face)
│   │   ├── chatbot_agent.js       # Dialogue utilisateur
│   │   ├── llmRouter.js           # Routage LLaMA 3.1 ↔ 3.3
│   │   └── sharedContext.js       # Contexte partagé
│   ├── components/
│   ├── hooks/
│   └── utils/
│
├── .env
├── .gitignore
├── package.json
├── requirements.txt
└── README.md
```

---

## ⚙️ Installation

### Prérequis

- Python 3.10+
- Node.js 18+
- Clé API Groq
- Clé API Serper
- Token Hugging Face

---

### 1. Cloner le projet

```bash
git clone https://github.com/Roua-Khalfet/Startify.git
cd Startify
git checkout MarketScout
```

---

### 2. Backend (Django)

```bash
cd backend

# Créer et activer l'environnement virtuel
python -m venv venv

# Windows :
venv\Scripts\activate
# Mac/Linux :
source venv/bin/activate

# Installer les dépendances
pip install -r requirements.txt

# Générer une clé Django secrète
python -c "import secrets; print(secrets.token_urlsafe(50))"

# Appliquer les migrations et lancer
python manage.py migrate
python manage.py runserver 8000
```

---

### 3. Frontend (React)

```bash
# Depuis la racine du projet
npm install
npm install pptxgenjs jspdf html2canvas
npm run dev
```

---

## 🔐 Variables d'environnement

Créer un fichier `.env` à la racine :

```env
VITE_GROQ_API_KEY=your_groq_api_key_here
VITE_SERPER_API_KEY=your_serper_api_key_here
VITE_VLLM_API_KEY=your_vllm_api_key_here
HF_TOKEN=your_hugging_face_token_here

DJANGO_SECRET_KEY=your_django_secret_key
DJANGO_PORT=8000
```

---

## 💡 Exemple de prompt

> Je souhaite ouvrir une salle de sport moderne dans le Grand Tunis, dans le secteur du fitness et du bien-être physique. Ma cible principale sont les jeunes de 18-35 ans et les actifs qui cherchent un accompagnement sérieux. Je propose des abonnements mensuels entre 80 et 150 TND incluant du coaching personnalisé et des cours collectifs variés. Mon différenciateur principal est la combinaison d'un suivi digital via application mobile avec un coaching sur mesure. Nous sommes en phase d'idée avec un budget de démarrage de 200 000 TND.

---

## 🚀 Fonctionnalités

**Analyse concurrentielle automatique** — identification des concurrents via recherche web intelligente avec filtrage par marché cible.

**SWOT & Stratégies** — analyse des Forces, Faiblesses, Opportunités et Menaces, SWOT combiné inter-concurrents, et plan d'actions prioritaires classées par impact.

**Personas clients** — fiche persona détaillée (démographie, motivations, comportements, douleurs) avec portrait généré par IA.

**Export & Pitch** — présentation PowerPoint ou PDF générée automatiquement, et synthèse vocale du pitch projet.

---

## 👨‍💻 Auteurs

Projet réalisé dans le cadre d'un projet académique en Intelligence Artificielle — 4ème année IA.

---

## 💡 Améliorations futures

- Intégration de plus de sources de données (LinkedIn, TripAdvisor...)
- Dashboard interactif avancé avec comparaison en temps réel
- Déploiement cloud

---

## 📜 Licence

Ce projet est à usage éducatif.
