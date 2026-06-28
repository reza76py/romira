import pytesseract
from pdf2image import convert_from_path
from sentence_transformers import SentenceTransformer
import chromadb
import re

# --- Configure paths ---
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
POPPLER_PATH = r"C:\Program Files\poppler-26.02.0\Library\bin"

# --- Known chapter titles in order ---
CHAPTERS = [
    "The Forfarshire",
    "The Lighthouse",
    "In the Engine Room",
    "Nothing to See",
    "The Shipwreck",
    "Out of the Window",
    "On Harker's Rock",
    "The Worst Sea this Year",
    "Angel in the Storm",
    "Too Many People",
]

# Normalize chapter titles for matching
CHAPTER_PATTERNS = [re.compile(r'\b' + re.escape(c) + r'\b', re.IGNORECASE) for c in CHAPTERS]

# --- Step 1: Extract text page by page ---
print("Converting PDF pages to images...")
pages = convert_from_path("graceDarlingBook.pdf", poppler_path=POPPLER_PATH)
print(f"Found {len(pages)} pages")

print("Running OCR on each page...")
page_texts = []
for i, page in enumerate(pages):
    page_text = pytesseract.image_to_string(page)
    page_texts.append((i + 1, page_text))
    print(f"OCR completed page {i+1}/{len(pages)}")

# --- Step 2: Parse sentences with chapter + paragraph + page + line tracking ---
print("Parsing sentences with location metadata...")

current_chapter = 0
current_chapter_name = CHAPTERS[0]
current_paragraph = 0

# Lines to skip: page headers/footers like "2 Grace Darling", "3", contents page
SKIP_PATTERNS = [
    re.compile(r'^\d+\s*Grace\s*Darling\s*$', re.IGNORECASE),
    re.compile(r'^\d+\s*$'),
    re.compile(r'^Grace\s*Darling\s*$', re.IGNORECASE),
    re.compile(r'^OXFORD', re.IGNORECASE),
    re.compile(r'^UNIVERSITY PRESS', re.IGNORECASE),
    re.compile(r'^CONTENTS', re.IGNORECASE),
    re.compile(r'^ACTIVITIES', re.IGNORECASE),
    re.compile(r'^acrivir', re.IGNORECASE),
    re.compile(r'^Series Editor', re.IGNORECASE),
    re.compile(r'^ISBN', re.IGNORECASE),
    re.compile(r'^TIM VICARY', re.IGNORECASE),
    re.compile(r'^Stage \d', re.IGNORECASE),
]

# Pages to skip entirely (copyright, title, contents)
SKIP_PAGES = {1, 3, 4, 5, 6}

sentences_with_metadata = []

for page_num, page_text in page_texts:
    if page_num in SKIP_PAGES:
        continue

    physical_page = max(1, page_num - 6)
    lines = page_text.split('\n')
    paragraph_buffer = []
    paragraph_start_line = 1  # line number where current paragraph started

    for line_idx, line in enumerate(lines):
        line_on_page = line_idx + 1
        clean_line = line.strip()

        if not clean_line:
            # Empty line = paragraph break
            if paragraph_buffer:
                current_paragraph += 1
                paragraph_text = ' '.join(paragraph_buffer)
                raw_sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', paragraph_text)
                for sent in raw_sentences:
                    sent = sent.strip()
                    if len(sent) > 20:
                        sentences_with_metadata.append({
                            "text": sent,
                            "chapter": current_chapter + 1,
                            "chapter_name": current_chapter_name,
                            "paragraph": current_paragraph,
                            "page": page_num,
                            "physical_page": physical_page,
                            "line_on_page": paragraph_start_line,
                        })
                paragraph_buffer = []
            continue

        # Check if should skip
        if any(p.match(clean_line) for p in SKIP_PATTERNS):
            continue

        # Check if this line is a chapter title
        chapter_found = False
        for idx, pattern in enumerate(CHAPTER_PATTERNS):
            if pattern.search(clean_line) and len(clean_line) < 50:
                if idx >= current_chapter:
                    current_chapter = idx
                    current_chapter_name = CHAPTERS[idx]
                    current_paragraph = 0
                    chapter_found = True
                    print(f"  -> Chapter {idx+1}: {CHAPTERS[idx]} (page {page_num})")
                    break

        if not chapter_found:
            if not paragraph_buffer:
                paragraph_start_line = line_on_page
            paragraph_buffer.append(clean_line)

    # Flush any remaining buffer at end of page
    if paragraph_buffer:
        current_paragraph += 1
        paragraph_text = ' '.join(paragraph_buffer)
        raw_sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', paragraph_text)
        for sent in raw_sentences:
            sent = sent.strip()
            if len(sent) > 20:
                sentences_with_metadata.append({
                    "text": sent,
                    "chapter": current_chapter + 1,
                    "chapter_name": current_chapter_name,
                    "paragraph": current_paragraph,
                    "page": page_num,
                    "physical_page": physical_page,
                    "line_on_page": paragraph_start_line,
                })

print(f"Found {len(sentences_with_metadata)} sentences with metadata")

# --- Step 3: Load embedding model ---
print("Loading embedding model...")
model = SentenceTransformer("all-MiniLM-L6-v2")

# --- Step 4: Store in ChromaDB with metadata ---
print("Storing in ChromaDB...")
client = chromadb.PersistentClient(path="./chroma_db")

try:
    client.delete_collection("grace_darling")
except:
    pass

collection = client.create_collection("grace_darling")

batch_size = 50
sentences = sentences_with_metadata

for i in range(0, len(sentences), batch_size):
    batch = sentences[i:i + batch_size]
    texts = [s["text"] for s in batch]
    embeddings = model.encode(texts).tolist()
    ids = [f"sentence_{i + j}" for j in range(len(batch))]
    metadatas = [{
        "chapter": s["chapter"],
        "chapter_name": s["chapter_name"],
        "paragraph": s["paragraph"],
        "page": s["page"],
        "physical_page": s["physical_page"],
        "line_on_page": s["line_on_page"],
    } for s in batch]
    collection.add(
        documents=texts,
        embeddings=embeddings,
        ids=ids,
        metadatas=metadatas
    )
    print(f"Stored {min(i + batch_size, len(sentences))}/{len(sentences)} sentences")

print("Ingestion complete!")

# --- Step 5: Verify a sample ---
print("\nSample sentences with metadata:")
for s in sentences_with_metadata[:5]:
    print(f"  Ch.{s['chapter']} ({s['chapter_name']}) Para.{s['paragraph']} p.{s['physical_page']} line {s['line_on_page']}: {s['text'][:60]}...")
