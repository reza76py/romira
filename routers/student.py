from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
import schemas
import anthropic
import os
import json
from dotenv import load_dotenv
from dependencies import embedding_model, collection

load_dotenv()

router = APIRouter(prefix="/student", tags=["student"])

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


@router.post("/ask")
def ask(body: schemas.StudentInteractionCreate, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.id == body.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    errors = db.query(models.StudentError).filter(
        models.StudentError.student_id == body.student_id
    ).all()
    error_list = [f"{e.wrong} → {e.correct}" for e in errors]

    # Step 1: Translate Persian → English so we can query ChromaDB meaningfully
    translation_resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        messages=[{
            "role": "user",
            "content": (
                "Translate this Persian text to English. "
                "Return ONLY the English translation, nothing else:\n\n"
                f"{body.persian_input}"
            )
        }]
    )
    english_for_search = translation_resp.content[0].text.strip()

    # Step 2: Find 2 relevant sentences from the book
    query_embedding = embedding_model.encode(english_for_search).tolist()
    results = collection.query(query_embeddings=[query_embedding], n_results=2)
    book_sentences = results["documents"][0]

    # Step 3: Generate the full learning response in one call
    prompt = f"""You are Romira, an English learning assistant for a Persian-speaking student.

Student: {student.name}
Level: {student.level}
Book: "{student.book}"
Known grammar errors: {json.dumps(error_list, ensure_ascii=False)}

The student wrote in Persian: "{body.persian_input}"
English translation: "{english_for_search}"

Relevant sentences from their book:
{json.dumps(book_sentences, ensure_ascii=False)}

Return ONLY valid JSON — no markdown fences, no explanation — with exactly these keys:
{{
  "english_translation": "natural English translation of what the student wrote",
  "book_sentences": {json.dumps(book_sentences, ensure_ascii=False)},
  "grammar_point": "one grammar point relevant to the student's errors or the book sentences; explain in Persian first, then English; max 3 sentences; simple language for level {student.level}",
  "practice_exercises": ["fill-in-the-blank or error-correction sentence 1", "sentence 2", "sentence 3"]
}}"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
        raw = raw.rsplit("```", 1)[0].strip()

    result = json.loads(raw)

    # Save interaction
    interaction = models.StudentInteraction(
        student_id=body.student_id,
        persian_input=body.persian_input,
        english_translation=result["english_translation"],
        book_sentences=json.dumps(result["book_sentences"], ensure_ascii=False),
        grammar_point=result["grammar_point"],
        practice_exercises=json.dumps(result["practice_exercises"], ensure_ascii=False),
    )
    db.add(interaction)
    db.commit()

    return result


@router.get("/{student_id}/interactions", response_model=list[schemas.StudentInteractionResponse])
def get_interactions(student_id: int, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    return (
        db.query(models.StudentInteraction)
        .filter(models.StudentInteraction.student_id == student_id)
        .order_by(models.StudentInteraction.created_at.desc())
        .all()
    )
