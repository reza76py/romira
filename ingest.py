import pytesseract
from pdf2image import convert_from_path
from sentence_transformers import SentenceTransformer
import chromadb
import re

# --- Configure paths ---
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
POPPLER_PATH = r"C:\Program Files\poppler-26.02.0\Library\bin"

# --- Step 1: Extract text from PDF using OCR ---
print("Converting PDF pages to images...")
pages = convert_from_path("graceDarlingBook.pdf", poppler_path=POPPLER_PATH)
print(f"Found {len(pages)} pages")

print("Running OCR on each page...")
text = ""
for i, page in enumerate(pages):
    page_text = pytesseract.image_to_string(page)
    text += page_text + " "
    print(f"OCR completed page {i+1}/{len(pages)}")

print(f"Total characters extracted: {len(text)}")

# --- Step 2: Split into sentences ---
print("Splitting into sentences...")
text = re.sub(r'\s+', ' ', text)
sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
sentences = [s.strip() for s in sentences if len(s.strip()) > 20]
print(f"Found {len(sentences)} sentences")

# --- Step 3: Load embedding model ---
print("Loading embedding model...")
model = SentenceTransformer("all-MiniLM-L6-v2")

# --- Step 4: Store in ChromaDB ---
print("Storing in ChromaDB...")
client = chromadb.PersistentClient(path="./chroma_db")

try:
    client.delete_collection("grace_darling")
except:
    pass

collection = client.create_collection("grace_darling")

batch_size = 50
for i in range(0, len(sentences), batch_size):
    batch = sentences[i:i + batch_size]
    embeddings = model.encode(batch).tolist()
    ids = [f"sentence_{i + j}" for j in range(len(batch))]
    collection.add(documents=batch, embeddings=embeddings, ids=ids)
    print(f"Stored {min(i + batch_size, len(sentences))}/{len(sentences)} sentences")

print("Ingestion complete!")