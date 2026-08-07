import sys
from pathlib import Path

# lets api/* import its sibling top-level packages (core, ingestion, retrieval,
# generation, evaluation, models) as package-qualified imports regardless of
# whatever directory uvicorn happens to be launched from
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))
