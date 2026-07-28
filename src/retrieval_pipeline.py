import os
import sys
import json
sys.stdout.reconfigure(encoding="utf-8")
from langchain_core.documents import Document
import numpy as np
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings
from typing import List, Dict, Any, Tuple
from sklearn.metrics.pairwise import cosine_similarity