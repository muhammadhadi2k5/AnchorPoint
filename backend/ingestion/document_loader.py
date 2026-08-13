import hashlib
import json
from pathlib import Path

import fitz  # PyMuPDF
from bs4 import BeautifulSoup
from langchain_community.document_loaders import (
    CSVLoader,
    PyPDFLoader,
    TextLoader,
    UnstructuredExcelLoader,
    UnstructuredImageLoader,
    UnstructuredPDFLoader,
    UnstructuredWordDocumentLoader,
)
from langchain_core.documents import Document

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

# catches browser-rendered PDFs pypdf reads as "C o u r s e s" instead of "Courses" (space
# between every glyph, not just words), char-count alone doesn't catch that, this does
def _is_character_spaced(text, sample_len=2000):
    tokens = text[:sample_len].split(' ')
    if len(tokens) < 10:
        return False
    single_char = sum(1 for t in tokens if len(t) <= 1)
    return single_char / len(tokens) > 0.6


# only reached for PDFs that fail the character-spacing check above, pypdf stays default
# everywhere else since it just works there
def _load_with_pymupdf(file_path):
    pdf = fitz.open(file_path)
    documents = [
        Document(page_content=page.get_text(), metadata={"source": file_path, "page": i})
        for i, page in enumerate(pdf)
    ]
    pdf.close()
    return documents


# find_tables() catches the page border as a fake table too, filter it out
def _is_page_frame(table, page, max_area_fraction=0.15):
    bbox = table.bbox
    area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
    page_area = page.rect.width * page.rect.height
    return page_area > 0 and area / page_area > max_area_fraction


# <br> so stacked lines in a cell still show as separate lines once rendered
def _escape_cell(text):
    cleaned = (text or "").strip()
    return cleaned.replace("\n", "<br>").replace("|", "\\|")


# None = rowspan merge, fill down the column not sideways (to_markdown() gets this wrong)
def _table_grid_to_markdown(grid):
    if not grid or not grid[0]:
        return ""

    num_cols = len(grid[0])
    last_seen = [""] * num_cols
    filled_rows = []
    for row in grid:
        filled_row = []
        for col_idx in range(num_cols):
            cell = row[col_idx] if col_idx < len(row) else None
            if cell is None:
                cell = last_seen[col_idx]
            else:
                last_seen[col_idx] = cell
            filled_row.append(_escape_cell(cell))
        filled_rows.append(filled_row)

    header, *data_rows = filled_rows
    lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join(["---"] * num_cols) + " |",
    ]
    for row in data_rows:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


# gaps in x0 mark column gutters, works for any column count not just 2
def _detect_column_boundaries(x0_values, gap_threshold=35):
    if not x0_values:
        return [0]
    ordered = sorted(set(x0_values))
    boundaries = [ordered[0]]
    for prev, curr in zip(ordered, ordered[1:]):
        if curr - prev > gap_threshold:
            boundaries.append(curr)
    return boundaries


def _column_index(x0, boundaries):
    idx = 0
    for i, boundary in enumerate(boundaries):
        if x0 >= boundary:
            idx = i
    return idx


def _bbox_overlap_fraction(bbox, other):
    x0, y0, x1, y1 = bbox
    ox0, oy0, ox1, oy1 = other
    ix0, iy0 = max(x0, ox0), max(y0, oy0)
    ix1, iy1 = min(x1, ox1), min(y1, oy1)
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    intersection = (ix1 - ix0) * (iy1 - iy0)
    block_area = (x1 - x0) * (y1 - y0)
    return intersection / block_area if block_area > 0 else 0.0


# collect prose + tables together before sorting, so they interleave in real reading order
def _extract_page_with_tables(page, tables):
    table_bboxes = [t.bbox for t in tables]

    items = []
    for x0, y0, x1, y1, text, _block_no, block_type in page.get_text("blocks"):
        if block_type != 0 or not text.strip():
            continue
        if any(_bbox_overlap_fraction((x0, y0, x1, y1), tb) > 0.5 for tb in table_bboxes):
            continue
        items.append({"x0": x0, "y0": y0, "text": text.strip()})

    for table in tables:
        markdown = _table_grid_to_markdown(table.extract())
        if markdown:
            items.append({"x0": table.bbox[0], "y0": table.bbox[1], "text": markdown})

    boundaries = _detect_column_boundaries([item["x0"] for item in items])
    items.sort(key=lambda item: (_column_index(item["x0"], boundaries), item["y0"]))

    return "\n\n".join(item["text"] for item in items)


# only touches pages with a real table, everything else stays exactly as pypdf gave it
def _apply_table_extraction(file_path, documents):
    pdf = fitz.open(file_path)
    for i, page in enumerate(pdf):
        tables = [t for t in page.find_tables().tables if not _is_page_frame(t, page)]
        if tables:
            documents[i] = Document(
                page_content=_extract_page_with_tables(page, tables),
                metadata=documents[i].metadata,
            )
    pdf.close()
    return documents


def _html_table_to_grid(html):
    soup = BeautifulSoup(html, "html.parser")
    table_tag = soup.find("table")
    if table_tag is None:
        return []

    # tracks cells still "occupied" by an active rowspan from an earlier row, per column
    pending_rowspans = {}
    grid = []
    for row_tag in table_tag.find_all("tr"):
        row = []
        col_idx = 0
        for cell_tag in row_tag.find_all(["th", "td"]):
            while col_idx in pending_rowspans and pending_rowspans[col_idx]["rows_left"] > 0:
                row.append(None)
                pending_rowspans[col_idx]["rows_left"] -= 1
                col_idx += 1

            colspan = int(cell_tag.get("colspan", 1))
            rowspan = int(cell_tag.get("rowspan", 1))
            text = cell_tag.get_text()
            for _ in range(colspan):
                row.append(text)
                if rowspan > 1:
                    pending_rowspans[col_idx] = {"rows_left": rowspan - 1}
                col_idx += 1

        while col_idx in pending_rowspans and pending_rowspans[col_idx]["rows_left"] > 0:
            row.append(None)
            pending_rowspans[col_idx]["rows_left"] -= 1
            col_idx += 1

        grid.append(row)
    return grid


def _regroup_ocr_elements(elements):
    pages = {}
    for element in elements:
        page_number = element.metadata.get("page_number", 1)
        pages.setdefault(page_number, []).append(element)

    documents = []
    for page_number in sorted(pages):
        parts = []
        for element in pages[page_number]:
            if element.metadata.get("category") == "Table":
                html = element.metadata.get("text_as_html")
                markdown = _table_grid_to_markdown(_html_table_to_grid(html)) if html else None
                parts.append(markdown or element.page_content)
            else:
                parts.append(element.page_content)
        metadata = dict(pages[page_number][0].metadata)
        metadata["page"] = page_number - 1
        documents.append(Document(page_content="\n\n".join(parts), metadata=metadata))
    return documents


# try normal text extraction first, way faster than OCR.
# if barely anything came out it's probably a scanned pdf, fall back to OCR
def load_pdf(file_path, min_chars_per_page=20, on_progress=None):
    documents = PyPDFLoader(file_path).load()
    avg_chars = sum(len(d.page_content) for d in documents) / max(len(documents), 1)

    if avg_chars < min_chars_per_page:
        print(f" Low text yield ({avg_chars:.0f} chars/page) — retrying with OCR")
        if on_progress:
            on_progress("ocr_fallback", filename=Path(file_path).name)
        # hi_res reads column by column, mode=elements keeps tables as real grids not a blob
        elements = UnstructuredPDFLoader(
            file_path, strategy="hi_res", languages=["eng"],
            infer_table_structure=True, mode="elements",
        ).load()
        documents = _regroup_ocr_elements(elements)
    elif any(_is_character_spaced(d.page_content) for d in documents):
        print(" Detected per-character spacing - retrying with PyMuPDF")
        documents = _load_with_pymupdf(file_path)
    else:
        documents = _apply_table_extraction(file_path, documents)

    return documents

# avoids re-OCRing the same pdf every run. anchored to this file's own location, not a bare
# relative path, so it lands in the same place no matter the caller's cwd
CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / ".doc_cache"

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

    for i, file in enumerate(supported_files, start=1):
        file_type = file.suffix.lower().lstrip(".")
        print(f"\nProcessing {file_type.upper()} file: {file.name}")
        if on_progress:
            on_progress("reading_file", filename=file.name, index=i, total=len(supported_files))
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
