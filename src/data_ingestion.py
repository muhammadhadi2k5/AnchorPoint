import os
from langchain_community.document_loaders import PyPDFLoader, PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pathlib import Path

#read the pdfs

def process_all_pdfs(pdf_directory):
    all_documents = []
    pdf_dir = Path(pdf_directory)

    pdf_files = list(pdf_dir.glob("**/*.pdf"))

    print(f"Found {len(pdf_files)} PDF files in {pdf_directory}")

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
    