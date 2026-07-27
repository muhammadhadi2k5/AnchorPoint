from langchain_core.documents import Document

# testing
# doc = Document(
#     page_content= "This is the main text content for RAG system.",
#     metadata={
#         "source": "example_source.txt", 
#         "author": "Hadi", 
#         "pages": 10,
#         "data_created": "2026-07-27"
#     }
# )
# print(doc)

# from langchain_community.document_loaders import TextLoader

# loader = TextLoader("data/text_files/python_intro.txt", encoding = "utf-8")
# document = loader.load()
# print(document)

# from langchain_community.document_loaders import DirectoryLoader, TextLoader, PyPDFLoader, PyMuPDFLoader

# dir_loader = DirectoryLoader(
#     "data/pdf",
#     glob="**/*.pdf", 
#     loader_cls= PyMuPDFLoader,
#     show_progress = False
# )

# pdf_documents = dir_loader.load()
# print(pdf_documents)