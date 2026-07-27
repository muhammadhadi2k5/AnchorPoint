import os
from langchain_community.document_loaders import PyPDFLoader, PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pathlib import Path

#read the pdfs

def process_all_pdfs(pdf_directory):
    all_documents = []
    pdf_dir = Path(pdf_directory)

    #stores all the files with .pdf extension in a list called pdf_files
    pdf_files = list(pdf_dir.glob("**/*.pdf"))

    #measure the len of list and output how many files detected
    print(f"\nFound {len(pdf_files)} PDF files in {pdf_directory}")

    #loop thru each file to process it
    for pdf_file in pdf_files:
        print(f"\nProcessing PDF file: {pdf_file.name}")
        try:
            loader = PyPDFLoader(str(pdf_file))
            documents = loader.load()

            for doc in documents:
                doc.metadata['source_file'] = pdf_file.name
                doc.metadata['file_type'] = 'pdf'

            all_documents.extend(documents)
            print(f" Loaded {len(documents)} pages")

        except Exception as e:
            print(f"Error loading {pdf_file.name}: {e}")
    print(f"\nTotal Documents Loaded:  {len(all_documents)}")
    return all_documents
            
all_pdf_documents = process_all_pdfs("data\pdf")

def chunking(documents, chunk_size=1000, chunk_overlap=200):
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size = chunk_size,
        chunk_overlap = chunk_overlap,
        length_function = len,
        separators=["\n\n", "\n", " ", ""] #an array containing markers to chunk at
    )