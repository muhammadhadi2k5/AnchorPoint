# starts both dev servers with one command, each in its own window so their
# logs don't interleave. Docker Desktop (for Qdrant) still has to already be
# running - see docs/start.md step 1
$root = $PSScriptRoot

Start-Process powershell -WorkingDirectory $root -ArgumentList '-NoExit', '-Command', 'cd src; uv run uvicorn api.main:app --port 8000 --host 0.0.0.0'
Start-Process powershell -WorkingDirectory $root -ArgumentList '-NoExit', '-Command', 'cd frontend; npm run dev'
