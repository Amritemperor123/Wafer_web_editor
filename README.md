# Python IDE

Browser-based Python workspace with a file explorer, multi-tab editor, web terminal, Python execution, lightweight code intelligence, and a local LM Studio chat sidebar.

This project is currently a local development environment for working with Python files inside the `workspace/` directory. It includes a streamed LM Studio chat bridge, but it is not yet a full project-aware AI editor or RAG system.

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
- Chat with a local LM Studio model from the right sidebar
- Collapse the left explorer, right chat sidebar, and intelligence panel to keep the editor focused
- Use a fixed-height app layout where panels fit inside the browser window and scroll internally when needed

## Current Scope And Limitations

- The editor is optimized for Python workflows. The runtime and code intelligence features are Python-specific.
- File operations are limited to the workspace root for safety.
- Python intelligence is implemented with a custom backend analysis script, not Pyright, Jedi, LSP, embeddings, or an LLM.
- The chat endpoint streams from LM Studio's OpenAI-compatible API, but it does not yet automatically inject workspace context or retrieval results.
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
- `LM_STUDIO_BASE_URL`: OpenAI-compatible LM Studio API base URL, default `http://localhost:1234/v1`
- `LM_STUDIO_MODEL`: model name sent to LM Studio, default `local-model`

For Docker Compose, the backend defaults `LM_STUDIO_BASE_URL` to `http://host.docker.internal:1234/v1` so it can reach LM Studio running on the host machine. Start the LM Studio local server first, load a model, and set `LM_STUDIO_MODEL` if your server requires the exact loaded model id.

### 3. Start the frontend

```bash
cd frontend
npm run dev
```

The frontend starts on `http://localhost:5173` and proxies `/api` and `/ws` traffic to the backend during development.

### 4. Open the app

Open `http://localhost:5173` in the browser.

## UI Notes

- The left explorer and right LM Studio chat sidebar are collapsible with smooth width transitions.
- The intelligence panel is collapsed by default; expand it when you need outline or reference results.
- The app frame is fixed to the browser viewport. Long file lists, chat history, terminal output, and intelligence results scroll inside their own panels.
- In chat, press `Enter` to send and `Shift + Enter` for a newline. A typing indicator appears while the assistant response is pending.

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

## Building Images For Docker Hub

If you want to publish images, use explicit tags for frontend and backend. Replace `yourdockerhubname` with your Docker Hub username or org.

Build:

```bash
docker build -t yourdockerhubname/python-ide-backend:latest ./backend
docker build -t yourdockerhubname/python-ide-frontend:latest ./frontend
```

Login:

```bash
docker login
```

Push:

```bash
docker push yourdockerhubname/python-ide-backend:latest
docker push yourdockerhubname/python-ide-frontend:latest
```

Recommended tagging:

- `latest` for the newest stable image you want people to pull by default
- version tags such as `0.1.0`
- optional commit-based tags for traceability

Example:

```bash
docker tag yourdockerhubname/python-ide-backend:latest yourdockerhubname/python-ide-backend:0.1.0
docker tag yourdockerhubname/python-ide-frontend:latest yourdockerhubname/python-ide-frontend:0.1.0
docker push yourdockerhubname/python-ide-backend:0.1.0
docker push yourdockerhubname/python-ide-frontend:0.1.0
```

## API Summary

REST endpoints:

- `GET /api/health`
- `GET /api/files`
- `GET /api/files/content?path=...`
- `PUT /api/files/content`
- `POST /api/files/folder`
- `PATCH /api/files/rename`
- `DELETE /api/files?path=...`
- `GET /api/files/download?path=...`
- `POST /api/python/run`
- `POST /api/python/intel`

WebSocket endpoints:

- `/ws/terminal` for the integrated terminal
- `/ws/chat` for streamed LM Studio chat responses

## Keyboard Shortcuts

- `Ctrl/Cmd + S`: save current file
- `Ctrl/Cmd + Enter`: run current file contents with Python
- `Enter` in chat: send message
- `Shift + Enter` in chat: insert newline
- `F12`: go to definition
- `Alt + F12`: go to declaration
- `Shift + F12`: find references
- `Ctrl/Cmd + Shift + R`: rename symbol project-wide

## Roadmap

Planned work that is not implemented yet:

- Project-aware AI chat
- Retrieval over workspace files
- Better production containerization and deployment story
- Broader language support beyond Python
