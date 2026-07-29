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


# Maps a file extension to the loader class that knows how to read it,
# plus any extra settings that loader needs.
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

# Loads a PDF the normal (fast) way first. If barely any text came out,
# assume it's a scanned/image-based PDF and retry using OCR instead.
def load_pdf(file_path, min_chars_per_page=20):
    documents = PyPDFLoader(file_path).load()
    avg_chars = sum(len(d.page_content) for d in documents) / max(len(documents), 1)

    if avg_chars < min_chars_per_page:
        print(f" Low text yield ({avg_chars:.0f} chars/page) — retrying with OCR")
        documents = UnstructuredPDFLoader(file_path, strategy="hi_res", languages=["eng"]).load()

    return documents

# Cache of already-loaded documents, so unchanged files (especially slow OCR'd
# PDFs) don't get reprocessed on every run.
CACHE_DIR = Path("data/.doc_cache")

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

# Read every supported document type in a directory
def process_all_documents(data_directory):
    all_documents = []
    data_dir = Path(data_directory)

    #find every file whose extension we have a loader for
    supported_files = [
        f for f in data_dir.glob("**/*")
        if f.is_file() and f.suffix.lower() in LOADER_REGISTRY
    ]

    #measure the len of list and output how many files detected
    print(f"\nFound {len(supported_files)} supported files in {data_directory}")

    #loop thru each file to process it
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
                    documents = load_pdf(str(file))
                else:
                    loader_cls, loader_kwargs = LOADER_REGISTRY[file.suffix.lower()]
                    loader = loader_cls(str(file), **loader_kwargs)
                    documents = loader.load()

                for doc in documents:
                    doc.metadata['source_file'] = file.name
                    doc.metadata['file_type'] = file_type

                save_to_cache(file_hash, documents)
                print(f" Loaded {len(documents)} document(s)")

            all_documents.extend(documents)

        except Exception as e:
            print(f"Error loading {file.name}: {e}")
    print(f"\nTotal Documents Loaded:  {len(all_documents)}")
    return all_documents
