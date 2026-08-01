from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
import schemas
import anthropic
import os
import json
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/conversation", tags=["conversation"])

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


def _build_system_prompt(student, errors, lesson_type, topic, scenario):
    error_lines = "\n".join(f"- {e.wrong} → {e.correct}" for e in errors) or "None recorded yet."
    context_lines = []
    if topic:
        context_lines.append(f"Topic: {topic}")
    if scenario:
        context_lines.append(f"Scenario: {scenario}")
    context = "\n".join(context_lines) if context_lines else ""

    return f"""You are an English conversation partner helping a Persian-speaking student practice spoken English.

Student: {student.name}
Level: {student.level}
Lesson type: {lesson_type}
{context}

The student's known grammar weak points (do not repeat these mistakes yourself):
{error_lines}

Your job every turn:
1. Reply naturally as a conversation partner — 1 to 3 sentences, spoken-English register, almost always end with a question to keep the conversation going.
2. If the student made a real grammatical error, include a correction. Only correct real errors — never nitpick style, word choice, or informal speech. Never mention the correction inside your reply; the reply must flow as if the mistake did not happen.

You MUST return ONLY raw JSON — no markdown, no backticks, no explanation before or after. The response must start with {{ and end with }}.

When there is no error:
{{"reply": "<your conversational response>", "correction": null}}

When there is a real error:
{{"reply": "<your conversational response>", "correction": {{"corrected": "<student sentence, fixed>", "note": "<one short English line explaining the fix>", "note_fa": "<same explanation in Persian>"}}}}"""


@router.post("/start")
def start_conversation(body: schemas.ConversationStartRequest, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.id == body.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if body.lesson_type not in ("daily", "roleplay", "read_talk"):
        raise HTTPException(status_code=400, detail="lesson_type must be daily, roleplay, or read_talk")

    session = models.ConversationSession(
        student_id=body.student_id,
        lesson_type=body.lesson_type,
        topic=body.topic,
        scenario=body.scenario,
        status="active",
        turn_count=0,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    context_hint = ""
    if body.topic:
        context_hint = f" The topic is: {body.topic}."
    if body.scenario:
        context_hint += f" Scenario: {body.scenario}."

    opening_prompt = (
        f"You are starting an English conversation with {student.name}, a {student.level} English learner."
        f"{context_hint} Write a warm, natural 1–2 sentence opening that sets the scene and ends with a question."
        f" Spoken English only. No correction JSON needed — just the opening line as plain text."
    )

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=150,
        messages=[{"role": "user", "content": opening_prompt}]
    )
    opening = response.content[0].text.strip()

    db.add(models.ConversationTurn(
        session_id=session.id,
        role="ai",
        content=opening,
    ))
    db.commit()

    return {
        "session_id": session.id,
        "opening": opening,
        "lesson_type": session.lesson_type,
        "topic": session.topic,
    }


@router.post("/reply")
def reply_to_conversation(body: schemas.ConversationReplyRequest, db: Session = Depends(get_db)):
    session = db.query(models.ConversationSession).filter(models.ConversationSession.id == body.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "active":
        raise HTTPException(status_code=400, detail="Session is not active")

    student = db.query(models.Student).filter(models.Student.id == session.student_id).first()
    errors = (
        db.query(models.StudentError)
        .filter(models.StudentError.student_id == session.student_id)
        .order_by(models.StudentError.noted_at.desc())
        .limit(10)
        .all()
    )

    prior_turns = (
        db.query(models.ConversationTurn)
        .filter(models.ConversationTurn.session_id == body.session_id)
        .order_by(models.ConversationTurn.id)
        .all()
    )

    messages = []
    for turn in prior_turns:
        claude_role = "user" if turn.role == "student" else "assistant"
        messages.append({"role": claude_role, "content": turn.content})
    messages.append({"role": "user", "content": body.message})

    system_prompt = _build_system_prompt(
        student, errors,
        session.lesson_type, session.topic, session.scenario
    )

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=600,
        system=system_prompt,
        messages=messages,
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        result = json.loads(raw)
    except Exception:
        result = {"reply": raw, "correction": None}

    correction = result.get("correction")
    correction_str = json.dumps(correction, ensure_ascii=False) if correction else None

    db.add(models.ConversationTurn(
        session_id=body.session_id,
        role="student",
        content=body.message,
        correction=correction_str,
    ))
    db.add(models.ConversationTurn(
        session_id=body.session_id,
        role="ai",
        content=result["reply"],
    ))

    if correction:
        try:
            db.add(models.StudentError(
                student_id=session.student_id,
                wrong=body.message[:255],
                correct=correction["corrected"][:255],
            ))
        except Exception:
            pass

    session.turn_count += 1
    db.commit()

    return {
        "reply": result["reply"],
        "correction": correction,
        "turn_count": session.turn_count,
        "should_wrap": session.turn_count >= 12,
    }


@router.post("/end")
def end_conversation(body: schemas.ConversationEndRequest, db: Session = Depends(get_db)):
    session = db.query(models.ConversationSession).filter(models.ConversationSession.id == body.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    turns = (
        db.query(models.ConversationTurn)
        .filter(models.ConversationTurn.session_id == body.session_id)
        .order_by(models.ConversationTurn.id)
        .all()
    )

    transcript = "\n".join(f"{t.role.upper()}: {t.content}" for t in turns)

    summary_prompt = f"""Review this English conversation session and return ONLY raw JSON — no markdown, no backticks, no explanation.

Transcript:
{transcript}

Return this exact shape:
{{
  "summary": "<2-3 sentences in English about how the conversation went>",
  "summary_fa": "<same summary in Persian>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "focus_areas": ["<area to improve 1>"],
  "new_words": [{{"word": "<english word or phrase>", "translation": "<persian meaning>"}}]
}}"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=600,
        messages=[{"role": "user", "content": summary_prompt}]
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        report = json.loads(raw)
    except Exception:
        report = {"summary": raw, "summary_fa": "", "strengths": [], "focus_areas": [], "new_words": []}

    session.summary = json.dumps(report, ensure_ascii=False)
    session.status = "closed"
    session.ended_at = datetime.utcnow()
    db.commit()

    return report


@router.get("/{student_id}/sessions")
def get_sessions(student_id: int, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    sessions = (
        db.query(models.ConversationSession)
        .filter(models.ConversationSession.student_id == student_id)
        .order_by(models.ConversationSession.started_at.desc())
        .all()
    )

    result = []
    for s in sessions:
        parsed_summary = None
        if s.summary:
            try:
                parsed_summary = json.loads(s.summary)
            except Exception:
                parsed_summary = None
        result.append({
            "id": s.id,
            "lesson_type": s.lesson_type,
            "topic": s.topic,
            "status": s.status,
            "turn_count": s.turn_count,
            "started_at": s.started_at,
            "ended_at": s.ended_at,
            "summary": parsed_summary,
        })

    return result
