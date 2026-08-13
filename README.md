# AnchorPoint

AnchorPoint is a full-stack RAG app for asking questions against your own documents, but the part
worth actually looking at is what happens after retrieval, not before it. Most RAG projects 
stop at "chunk it, embed it, stuff it in a prompt" and call it done. This one
tries to answer a harder question: how do you actually know if any of that is working?

Every real answer you get in the app gets scored automatically in the background right
after it streams in, no setup, no separate eval script to remember to run. You can also
build a small set of your own known-answer questions per dataset and re-run them on
demand, so if you go tweak retrieval settings you get an actual before/after instead of a
vibe. Citations aren't just a footnote either: click a source number under any answer and
a side panel shows you the exact chunk it came from, the file, the page, how well it
matched. Ask something that spans two documents at once ("compare X and Y") and retrieval
handles that as its own case instead of letting one document's better-scoring chunks
drown out the other's. Scanned or image-heavy PDFs get OCR'd automatically as a fallback,
you just drop the file in.

Each dataset is its own fully isolated workspace, own documents, own vector collection,
own conversation, so this isn't "one big pile of documents," it's more like a set of
separate notebooks you can spin up per project.

There's also a standalone Parse feature: drop in a document and get back clean, structured
markdown, JSON or Text file, exportable on its own.

## Setup

### 1. Install prerequisites

- **uv** (also manages Python 3.13 for you, no separate Python install needed)

  how to install:
  ```
  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
  ```

- **Node.js (npm)**

  how to install:
  ```
  winget install OpenJS.NodeJS.LTS
  ```
  (or the LTS installer from nodejs.org)

- **Docker Desktop**

  how to install: download from docker.com

Restart your terminal after installing uv or Node.js.

### 2. Clone the repo

```
git clone https://github.com/muhammadhadi2k5/AnchorPoint.git
cd AnchorPoint
```

### 3. Start Qdrant (Docker)

Make sure Docker Desktop is running first.

```
docker run -d --name qdrant -p 6333:6333 -p 6334:6334 -v qdrant_storage:/qdrant/storage qdrant/qdrant
```

### 4. Backend setup

```
cd backend
uv sync
```

Create `backend/.env`:

```
GEMINI_API_KEY=your_key_here
```

Get your free gemini api key form: https://aistudio.google.com/api-keys and paste it in the .env file

### 5. Start the backend

```
uv run uvicorn api.main:app --port 8000 --host 0.0.0.0
```

### 6. Frontend setup (new terminal, from project root)

```
cd frontend
npm install
npm run dev
```

### 7. Open the app

`http://localhost:5173`

### CLI (alternative to the web app)

Put your documents in the `data/` folder at the project root before running ingestion.

```
cd backend
uv run python cli/ingestion_pipeline.py
uv run python cli/retrieval_pipeline.py
```

## Project layout

```
backend/
├── api/          FastAPI routes and background jobs (ingest, chat, evaluations)
├── models/       SQLite persistence: datasets, messages, evaluation results
├── core/         shared infra: vector store client, embeddings, rate limiting
├── ingestion/    loads documents, OCR fallback for scanned pages, chunking
├── retrieval/    cosine similarity search, handles multi-document comparisons
├── generation/   turns retrieved chunks into an actual answer
├── evaluation/   scores answers automatically and on demand
├── cli/          the original terminal pipeline, still works standalone
└── tests/        empty for now

frontend/src/
├── components/   reusable pieces: sidebar, citation drawer, evaluation dashboard
├── views/        the four full screens: landing, home, ingestion loading, chat
├── lib/          API client and small shared data
├── styles/       design tokens and app shell CSS
└── assets/       logo and fonts
```

## Where to start reading

`backend/ingestion/` → `backend/retrieval/` → `backend/generation/`, in that order. That's
the actual path a document takes: it gets loaded and chunked in ingestion, found again in
retrieval, and turned into an answer in generation. Reading the code in any other order
means seeing the second half of a function before you know what it's holding.

<br>
<br>
<div align="center"> 
  <strong><em>Your anchor point for accurate, sourced answers.</em></strong> 
</div>
