import json
import hashlib
from pathlib import Path
from langchain_core.documents import Document
from langchain_community.document_loaders import (
    PyPDFLoader,
    CSVLoader,
    UnstructuredExcelLoader,
    UnstructuredWordDocumentLoader,
    UnstructuredImageLoader,
    UnstructuredPDFLoader,
    TextLoader,
)


# extension -> (loader class, kwargs). add new filetypes here
LOADER_REGISTRY = {
    ".pdf": (PyPDFLoader, {}),
    ".txt": (TextLoader, {"encoding": "utf-8"}),
    ".csv": (CSVLoader, {"encoding": "utf-8"}),
    ".xlsx": (UnstructuredExcelLoader, {"mode": "elements"}),
    ".xls": (UnstructuredExcelLoader, {"mode": "elements"}),
    ".docx": (UnstructuredWordDocumentLoader, {}),
    ".png": (UnstructuredImageLoader, {}),
    ".jpg": (UnstructuredImageLoader, {}),
    ".jpeg": (UnstructuredImageLoader, {}),
}

# try normal text extraction first, way faster than OCR.
# if barely anything came out it's probably a scanned pdf, fall back to OCR
def load_pdf(file_path, min_chars_per_page=20, on_progress=None):
    documents = PyPDFLoader(file_path).load()
    avg_chars = sum(len(d.page_content) for d in documents) / max(len(documents), 1)

    if avg_chars < min_chars_per_page:
        print(f" Low text yield ({avg_chars:.0f} chars/page) — retrying with OCR")
        if on_progress:
            on_progress("ocr_fallback", filename=Path(file_path).name)
        # hi_res = does layout detection before OCR, so it reads column by
        # column instead of jumbling left/right text together on 2-col pages
        documents = UnstructuredPDFLoader(file_path, strategy="hi_res", languages=["eng"]).load()

    return documents

# cache so it doesnt re-OCR the same pdf every single run. anchored to the
# project root via this file's location rather than a bare relative path, so
# it lands in the same place regardless of the caller's working directory
CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / ".doc_cache"

def get_file_hash(file_path):
    return hashlib.md5(Path(file_path).read_bytes()).hexdigest()

def load_from_cache(file_hash):
    cache_file = CACHE_DIR / f"{file_hash}.json"
    if not cache_file.exists():
        return None
    with open(cache_file, "r", encoding="utf-8") as f:
        cached = json.load(f)
    return [Document(page_content=d["page_content"], metadata=d["metadata"]) for d in cached]

def save_to_cache(file_hash, documents):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{file_hash}.json"
    serializable = [{"page_content": d.page_content, "metadata": d.metadata} for d in documents]
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump(serializable, f)

# walks data/, loads whatever it can, skips the rest
def process_all_documents(data_directory, on_progress=None):
    all_documents = []
    data_dir = Path(data_directory)

    if on_progress:
        on_progress("reading")

    # only grab files we actually have a loader for
    supported_files = [
        f for f in data_dir.glob("**/*")
        if f.is_file() and f.suffix.lower() in LOADER_REGISTRY
    ]

    print(f"\nFound {len(supported_files)} supported files in {data_directory}")

    for file in supported_files:
        file_type = file.suffix.lower().lstrip(".")
        print(f"\nProcessing {file_type.upper()} file: {file.name}")
        try:
            file_hash = get_file_hash(file)
            documents = load_from_cache(file_hash)

            if documents is not None:
                print(f" Loaded {len(documents)} document(s) from cache")
            else:
                if file.suffix.lower() == ".pdf":
                    documents = load_pdf(str(file), on_progress=on_progress)
                else:
                    loader_cls, loader_kwargs = LOADER_REGISTRY[file.suffix.lower()]
                    loader = loader_cls(str(file), **loader_kwargs)
                    documents = loader.load()

                # stamp source + type on every doc so downstream code
                # (chunking, retrieval) knows where it came from
                for doc in documents:
                    doc.metadata['source_file'] = file.name
                    doc.metadata['file_type'] = file_type

                save_to_cache(file_hash, documents)
                print(f" Loaded {len(documents)} document(s)")

            all_documents.extend(documents)

        except Exception as e:
            # one bad file shouldn't kill the whole ingestion run
            print(f"Error loading {file.name}: {e}")
    print(f"\nTotal Documents Loaded:  {len(all_documents)}")
    return all_documents
