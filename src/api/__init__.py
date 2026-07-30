import sys
from pathlib import Path

# lets api/* import sibling modules (document_loader, chunker, etc.) the same
# way the CLI scripts do, without touching those files or how they're run
_SRC_DIR = Path(__file__).resolve().parent.parent
if str(_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(_SRC_DIR))
