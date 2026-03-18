# Python IDE

Browser-based Python workspace with a file explorer, multi-tab editor, web terminal, Python execution, and lightweight code intelligence.

This project is currently a local development environment for working with Python files inside the `workspace/` directory. It is not yet a full AI code editor or RAG system. The chat socket exists in the backend, but it still returns placeholder streamed text.

## What It Can Do Today

- Browse files and folders inside the configured workspace root
- Open multiple files in tabs
- Edit and save files from the browser
- Create folders and create new Python files
- Rename and delete files or folders
- Download a file or folder from the workspace
- Open an integrated terminal backed by the server machine
- Run the current editor contents with Python
- Show Python outline data for the active file
- Provide Python completions, signature help, go to definition/declaration, find references, and project-wide rename

## Current Scope And Limitations

- The editor is optimized for Python workflows. The runtime and code intelligence features are Python-specific.
- File operations are limited to the workspace root for safety.
- Python intelligence is implemented with a custom backend analysis script, not Pyright, Jedi, LSP, embeddings, or an LLM.
- The WebSocket chat endpoint is only a stub right now. There is no real AI assistant, model integration, retrieval pipeline, or streaming from an LLM yet.
- Docker support is currently aimed at local development with bind mounts and `npm run dev`, not a hardened production deployment.

## Stack

- Frontend: React 19, Vite, Ace Editor, xterm.js
- Backend: Node.js, Express, TypeScript, WebSocket, node-pty
- Runtime helpers: Python 3 for code execution and Python intelligence
- Containers: separate frontend and backend Docker images plus `docker-compose.yml`

## Project Structure

```text
frontend/    React UI
backend/     API, terminal socket, file system service, Python execution, Python intelligence
workspace/   Editable project files exposed in the browser
```

## Local Setup

### Prerequisites

- Node.js 20+
- npm
- Python 3

### 1. Install dependencies

Backend:

```bash
cd backend
npm install
```

Frontend:

```bash
cd frontend
npm install
```

### 2. Start the backend

```bash
cd backend
npm run dev
```

The backend starts on `http://localhost:4000`.

Useful environment variables:

- `PORT`: backend port, default `4000`
- `WORKSPACE_ROOT`: workspace directory path, default `../workspace`
- `PYTHON_BIN`: Python executable name or path, default `python`

### 3. Start the frontend

```bash
cd frontend
npm run dev
```

The frontend starts on `http://localhost:5173` and proxies `/api` and `/ws` traffic to the backend during development.

### 4. Open the app

Open `http://localhost:5173` in the browser.

## Docker Setup

The repository already includes:

- `backend/Dockerfile`
- `frontend/Dockerfile`
- `docker-compose.yml`

### Run with Docker Compose

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

Notes:

- The compose setup mounts local source code into the containers for development.
- The `workspace/` directory is mounted into the backend container so changes persist on the host.
- The backend container installs Python 3 so the run/intelligence features work inside Docker.
