from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
import schemas
import anthropic
import os
import json
import re
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
    book_metadatas = results["metadatas"][0] if results.get("metadatas") else []

    # Format sentences with location
    book_sentences_with_location = []
    for i, sentence in enumerate(book_sentences):
        meta = book_metadatas[i] if i < len(book_metadatas) else {}
        chapter_name = meta.get("chapter_name", "")
        paragraph = meta.get("paragraph", "")
        physical_page = max(1, meta.get("page", 6) - 6)
        line = meta.get("line_on_page", "")
        if chapter_name and paragraph:
            location = f"(Ch: {chapter_name}, p.{physical_page})"
        else:
            location = ""
        book_sentences_with_location.append({
            "text": sentence,
            "location": location
        })

    # Step 3: Generate the full learning response in one call
    prompt = f"""You are Romira, an English learning assistant for a Persian-speaking student.

Student: {student.name}
Level: {student.level}
Book: "{student.book}"
Known grammar errors: {json.dumps(error_list, ensure_ascii=False)}

The student wrote in Persian: "{body.persian_input}"
English translation: "{english_for_search}"

Relevant sentences from their book:
{json.dumps(book_sentences_with_location, ensure_ascii=False)}

CRITICAL: Return ONLY a valid JSON object. No markdown, no backticks, no explanation before or after. The response must start with {{ and end with }}. Do not include any text outside the JSON object.
{{
  "english_translation": "natural English translation of what the student wrote",
  "book_sentences": {json.dumps(book_sentences_with_location, ensure_ascii=False)},
  "grammar_point": "یک یا دو جمله کوتاه فارسی درباره نکته گرامری. فقط فارسی. هیچ کلمه انگلیسی نباشد. هر جمله در یک خط جداگانه.",
  "practice_exercises": ["She ___ (want) to go. | wants", "sentence 2 with blank | answer", "sentence 3 with blank | answer"]
}}

Each practice exercise MUST follow this exact format: fill-in-the-blank sentence with ___ for the missing word, then a space, then a pipe character |, then a space, then the correct answer. Example: "She ___ (want) to go out. | wants". No other format is acceptable."""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = response.content[0].text.strip()

    # Strip markdown fences if present
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
        raw = raw.rsplit("```", 1)[0].strip()

    # Fix common JSON issues — trailing commas
    raw = re.sub(r',\s*}', '}', raw)
    raw = re.sub(r',\s*]', ']', raw)

    try:
        result = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}")
        print(f"Raw response: {raw[:500]}")
        raise HTTPException(status_code=500, detail=f"AI returned invalid JSON: {str(e)}")

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
    result["id"] = interaction.id

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
1. In Persian only, write ONE short simple sentence explaining why the answer is wrong and what the correct form is. Maximum 15 words in Persian. No English explanation at all.
2. Give ONE new fill-in-the-blank practice sentence testing the same grammar point.
   Format it exactly as: "The sentence with ___ | correct answer"
   Example: "She ___ (want) to go home. | wants"

Return ONLY valid JSON with these exact keys:
{{
  "simpler_explanation": "one short Persian sentence only",
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


@router.put("/interaction/{interaction_id}/close")
def close_interaction(interaction_id: int, body: schemas.CloseInteraction, db: Session = Depends(get_db)):
    interaction = db.query(models.StudentInteraction).filter(models.StudentInteraction.id == interaction_id).first()
    if not interaction:
        raise HTTPException(status_code=404, detail="Interaction not found")
    interaction.duration_seconds = body.duration_seconds
    interaction.total_retries = body.total_retries
    interaction.fully_correct = body.fully_correct
    db.commit()
    return {"success": True}


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


@router.post("/event", response_model=schemas.StudentEventResponse)
def create_event(body: schemas.StudentEventCreate, db: Session = Depends(get_db)):
    event = models.StudentEvent(
        student_id=body.student_id,
        event_type=body.event_type,
        interaction_id=body.interaction_id,
        event_metadata=body.metadata,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("/{student_id}/events", response_model=list[schemas.StudentEventResponse])
def get_events(student_id: int, limit: int = 100, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return (
        db.query(models.StudentEvent)
        .filter(models.StudentEvent.student_id == student_id)
        .order_by(models.StudentEvent.created_at.desc())
        .limit(limit)
        .all()
    )


@router.get("/{student_id}/interactions", response_model=list[schemas.StudentInteractionResponse])
def get_interactions(student_id: int, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    interactions = (
        db.query(models.StudentInteraction)
        .filter(models.StudentInteraction.student_id == student_id)
        .order_by(models.StudentInteraction.created_at.desc())
        .all()
    )

    for ix in interactions:
        try:
            bs = json.loads(ix.book_sentences) if ix.book_sentences else []
        except Exception:
            bs = []
        ix.book_sentences = bs

    return interactions
