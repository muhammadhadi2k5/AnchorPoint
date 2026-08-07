from langchain_text_splitters import RecursiveCharacterTextSplitter


# splits docs into ~1000 char pieces, 200 char overlap so context doesn't
# get cut off mid-thought at chunk boundaries
def chunking(documents, chunk_size=1000, chunk_overlap=200):
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size = chunk_size,
        chunk_overlap = chunk_overlap,
        length_function = len,
        separators=["\n\n", "\n", " ", ""]  # tries paragraph, then line, then word, then hard cut
    )

    split_docs = text_splitter.split_documents(documents)
    print(f"Split {len(documents)} documents into {len(split_docs)} chunks")

    return split_docs
