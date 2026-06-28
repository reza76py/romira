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
  "grammar_point": "one grammar point relevant to the student's errors or the book sentences. Format as alternating lines: first line is the English explanation, second line is the Persian translation of that explanation, then repeat for each sentence. Max 3 pairs. Simple language for level {student.level}. No blank lines between pairs.",
  "practice_exercises": ["She ___ (want) to go. | wants", "sentence 2 with blank | answer", "sentence 3 with blank | answer"]
}}

Each practice exercise MUST follow this exact format: fill-in-the-blank sentence with ___ for the missing word, then a space, then a pipe character |, then a space, then the correct answer. Example: "She ___ (want) to go out. | wants". No other format is acceptable."""

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


@router.post("/retry")
def retry(body: schemas.StudentRetryCreate, db: Session = Depends(get_db)):
    # Log the mistake to StudentError table
    db.add(models.StudentError(
        student_id=body.student_id,
        wrong=body.wrong_answer,
        correct=body.correct_answer,
    ))
    db.commit()

    prompt = f"""A student made this mistake:
Wrong: {body.wrong_answer}
Correct: {body.correct_answer}

The grammar point being practiced was:
{body.grammar_point}

Do two things:
1. Explain in very simple terms WHY this is wrong and what the correct rule is.
   Format: one English sentence, then its Persian translation on the next line. Repeat for up to 2 points.
2. Give ONE new fill-in-the-blank practice sentence testing the same grammar point.
   Format it exactly as: "The sentence with ___ | correct answer"
   Example: "She ___ (want) to go home. | wants"

Return ONLY valid JSON with these exact keys:
{{
  "simpler_explanation": "English line\\nفارسی\\nEnglish line 2\\nفارسی 2",
  "new_practice": "She ___ (want) to go home. | wants"
}}

No markdown, no extra text, only JSON."""

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1]
            raw = raw.rsplit("```", 1)[0].strip()
        result = json.loads(raw)
    except Exception:
        result = {"simpler_explanation": "Please review the correct answer.", "new_practice": ""}

    return result


@router.get("/{student_id}/errors", response_model=list[schemas.StudentErrorResponse])
def get_errors(student_id: int, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return (
        db.query(models.StudentError)
        .filter(models.StudentError.student_id == student_id)
        .order_by(models.StudentError.noted_at.desc())
        .all()
    )


@router.get("/{student_id}/password")
def get_password(student_id: int, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return {"password": student.password or ""}


@router.post("/login")
def login(body: schemas.StudentLogin, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.password == body.password).first()
    if not student:
        raise HTTPException(status_code=401, detail="Invalid code")
    return {"id": student.id, "name": student.name}


@router.put("/{student_id}/password")
def set_password(student_id: int, body: schemas.SetPassword, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    student.password = body.password
    db.commit()
    return {"success": True}


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
