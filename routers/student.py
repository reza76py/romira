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
  "grammar_point": "Analyze the English translation. Format exactly like this — 3 lines only, nothing else:\n[one short Persian sentence about sentence type and count, no prefix]\nPurpose: [Statement/Question/Command/Exclamation] | Voice: [Active/Passive] | Structure: [Simple/Compound/Complex/Compound-Complex]\n[one short Persian sentence of additional insight, no prefix]",
  "sentence_parts": {{"subject": ["word or phrase"], "verb": ["word or phrase"], "object": ["word or phrase or empty list"], "other": ["any other notable parts or empty list"]}},
  "practice_exercises": ["She ___ (want) to go. | wants", "sentence 2 with blank | answer", "sentence 3 with blank | answer"]
}}

Each practice exercise MUST follow this exact format: fill-in-the-blank sentence with ___ for the missing word, then a space, then a pipe character |, then a space, then the correct answer. Example: "She ___ (want) to go out. | wants". No other format is acceptable.
For sentence_parts: identify the grammatical roles in the english_translation sentence. Each value is a list of strings (words or phrases). Use empty list [] if a role doesn't exist."""

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


@router.get("/{student_id}/progress")
def get_student_progress(student_id: int, db: Session = Depends(get_db)):
    from datetime import datetime, timedelta, timezone
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    interactions = db.query(models.StudentInteraction)\
        .filter(models.StudentInteraction.student_id == student_id)\
        .order_by(models.StudentInteraction.created_at.desc()).all()

    total_sessions = len(interactions)
    last_session = interactions[0].created_at.strftime("%B %d") if interactions else None

    streak = 0
    if interactions:
        today = datetime.now(timezone.utc).date()
        dates = sorted(set(i.created_at.date() for i in interactions), reverse=True)
        check = today
        for d in dates:
            if d == check or d == check - timedelta(days=1):
                streak += 1
                check = d
            else:
                break

    return {
        "total_sessions": total_sessions,
        "last_session": last_session,
        "streak": streak
    }


@router.post("/translate-sentence")
def translate_sentence(body: schemas.TranslateSentenceRequest):
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        messages=[{
            "role": "user",
            "content": (
                "Translate this English sentence to Persian (Farsi). "
                "Return ONLY the Persian translation, nothing else:\n\n"
                f"{body.sentence}"
            )
        }]
    )
    return {"translation": response.content[0].text.strip()}


def next_review_date(box: int):
    from datetime import datetime, timedelta
    intervals = {1: 1, 2: 2, 3: 4, 4: 7, 5: 14}
    return datetime.utcnow() + timedelta(days=intervals.get(box, 1))


@router.post("/vocabulary/meaning")
def get_word_meaning(body: dict):
    word = body.get("word", "").strip()
    if not word:
        raise HTTPException(status_code=400, detail="No word provided")
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=100,
        messages=[{"role": "user", "content": f"Translate this English word to Persian in one short phrase. Return ONLY the Persian translation, nothing else: {word}"}]
    )
    return {"translation": response.content[0].text.strip()}


@router.post("/vocabulary/save")
def save_vocabulary(body: schemas.VocabSaveRequest, db: Session = Depends(get_db)):
    existing = db.query(models.StudentVocabulary).filter(
        models.StudentVocabulary.student_id == body.student_id,
        models.StudentVocabulary.word == body.word.lower()
    ).first()
    if existing:
        return {"id": existing.id, "word": existing.word, "translation": existing.translation, "created_at": existing.created_at}
    vocab = models.StudentVocabulary(
        student_id=body.student_id,
        word=body.word.lower(),
        translation=body.translation
    )
    db.add(vocab)
    db.commit()
    db.refresh(vocab)
    return vocab


@router.get("/{student_id}/vocabulary")
def get_vocabulary(student_id: int, db: Session = Depends(get_db)):
    from datetime import datetime
    all_words = db.query(models.StudentVocabulary)\
        .filter(models.StudentVocabulary.student_id == student_id)\
        .order_by(models.StudentVocabulary.box, models.StudentVocabulary.next_review).all()

    now = datetime.utcnow()
    vocab_result = {}
    for box_num in range(1, 6):
        words_in_box = [w for w in all_words if w.box == box_num]
        due = [w for w in words_in_box if w.next_review <= now]
        vocab_result[f"box_{box_num}"] = {
            "total": len(words_in_box),
            "due": len(due),
            "words": [{"id": w.id, "word": w.word, "translation": w.translation, "box": w.box, "due": w.next_review <= now} for w in words_in_box]
        }
    return vocab_result


@router.delete("/vocabulary/{vocab_id}")
def delete_vocabulary(vocab_id: int, db: Session = Depends(get_db)):
    vocab = db.query(models.StudentVocabulary).filter(models.StudentVocabulary.id == vocab_id).first()
    if not vocab:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(vocab)
    db.commit()
    return {"ok": True}


@router.post("/vocabulary/{vocab_id}/correct")
def vocab_correct(vocab_id: int, db: Session = Depends(get_db)):
    vocab = db.query(models.StudentVocabulary).filter(models.StudentVocabulary.id == vocab_id).first()
    if not vocab:
        raise HTTPException(status_code=404, detail="Not found")
    vocab.box = min(vocab.box + 1, 5)
    vocab.next_review = next_review_date(vocab.box)
    db.commit()
    return {"box": vocab.box, "next_review": vocab.next_review}


@router.post("/vocabulary/{vocab_id}/forgot")
def vocab_forgot(vocab_id: int, db: Session = Depends(get_db)):
    vocab = db.query(models.StudentVocabulary).filter(models.StudentVocabulary.id == vocab_id).first()
    if not vocab:
        raise HTTPException(status_code=404, detail="Not found")
    vocab.box = 1
    vocab.next_review = next_review_date(1)
    db.commit()
    return {"box": vocab.box, "next_review": vocab.next_review}
