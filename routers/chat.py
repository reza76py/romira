from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
import anthropic
import os
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
import chromadb

load_dotenv()

router = APIRouter(prefix="/chat", tags=["chat"])

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# Load embedding model and ChromaDB once at startup
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_collection("grace_darling")


@router.post("/generate-exercise")
def generate_exercise(student_id: int, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    errors = (
        db.query(models.StudentError)
        .filter(models.StudentError.student_id == student_id)
        .all()
    )

    error_list = "\n".join([f"- {e.wrong} → {e.correct}" for e in errors])

    # RAG: search for relevant sentences from the book
    query = f"errors: {' '.join([e.wrong for e in errors])}"
    query_embedding = embedding_model.encode(query).tolist()
    results = collection.query(query_embeddings=[query_embedding], n_results=5)
    book_sentences = "\n".join(results["documents"][0])

    prompt = f"""You are an English teacher assistant helping a student named {student.name}.
Their level is {student.level} and they are currently reading "{student.book}".

This student has made the following errors before:
{error_list}

Here are some real sentences from the book they are reading:
{book_sentences}

Create one short grammar exercise (3-5 sentences) using ONLY the sentences from the book above.
Modify those sentences slightly to include the student's known errors as mistakes to correct.
Use simple vocabulary appropriate for their level.
"""

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    return {
        "exercise": message.content[0].text,
        "source_sentences": results["documents"][0],
    }
