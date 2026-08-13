from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from core.markdown_tables import split_prose_and_tables


def _trim_to_word_boundary(text, max_chars):
    tail = text[-max_chars:].strip()
    if not tail:
        return ""
    space_idx = tail.find(" ")
    return tail[space_idx + 1:] if space_idx != -1 else tail


# splits docs into ~1000 char pieces, 200 char overlap so context doesn't
# get cut off mid-thought at chunk boundaries
def chunking(documents, chunk_size=1000, chunk_overlap=200):
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size = chunk_size,
        chunk_overlap = chunk_overlap,
        length_function = len,
        separators=["\n\n", "\n", " ", ""]  # tries paragraph, then line, then word, then hard cut
    )

    split_docs = []
    for doc in documents:
        segments = split_prose_and_tables(doc.page_content)

        if len(segments) == 1:
            split_docs.extend(text_splitter.split_documents([doc]))
            continue

        prev_tail = ""
        for segment in segments:
            if segment["type"] == "table":
                lead_in = _trim_to_word_boundary(prev_tail, chunk_overlap)
                content = f"{lead_in}\n\n{segment['text']}" if lead_in else segment["text"]
                split_docs.append(Document(
                    page_content=content,
                    metadata={**doc.metadata, "content_type": "table"},
                ))
            else:
                prev_tail = segment["text"]
                if segment["text"].strip():
                    split_docs.extend(text_splitter.split_documents(
                        [Document(page_content=segment["text"], metadata=doc.metadata)]
                    ))

    print(f"Split {len(documents)} documents into {len(split_docs)} chunks")
    return split_docs
