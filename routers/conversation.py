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

REPLY_MODES = [
    "React briefly in one sentence, then share a short related experience or opinion of your own. Do NOT ask a question this turn.",
    "Ask one curious follow-up question about something specific the student just said.",
    "Respond in a single short sentence. No question. Just react like a friend would.",
    "Offer your own opinion on the topic, even if it differs slightly from the student's. Do not ask a question.",
    "Pick something small the student mentioned in passing and ask them to tell you more about that specific thing.",
    "Share something about your own life related to the topic, then ask what they think.",
]

OPENER_STYLES = [
    "Open with a small observation about your own day, then ask something light.",
    "Open by asking about one specific thing — a meal, the weather, their weekend — not a general 'how are you'.",
    "Open with an opinion or a small confession about yourself, then invite them to respond.",
    "Open by asking what they'd like to talk about today, phrased very casually.",
]


def _build_reply_system_prompt(student, errors, lesson_type, topic, scenario, turn_mode: str):
    error_lines = "\n".join(f"- {e.wrong} → {e.correct}" for e in errors) or "None recorded yet."
    context_lines = []
    if topic:
        context_lines.append(f"Topic: {topic}")
    if scenario:
        context_lines.append(f"Scenario: {scenario}")
    context = "\n".join(context_lines) if context_lines else ""

    return f"""You are Sara — a friendly adult native English speaker in your early 30s. You work as a graphic designer, love hiking, cooking Persian food (your mum is Iranian), and have strong opinions about bad coffee. You are chatting with {student.name} as a friend, not as a student. You are NOT a teacher and must never sound like one.

{context}

How to react naturally (model your tone on these):
- Student: "I work in a hospital." → You: "Oh, a hospital — my cousin's a paramedic, so I've heard the stories."
- Student: "I don't cook." → You: "Fair enough. I only cook because takeaway got expensive."
- Student: "We were very busy." → You: "Yeah, that sounds like one of those weeks where time just disappears."

Never comment on the student's English, grammar, or language ability.

THIS TURN — follow this instruction exactly:
{turn_mode}

Student's known grammar weak points (do not reproduce these mistakes yourself):
{error_lines}

Return ONLY the plain reply text. No JSON, no labels, no quotation marks around the reply."""


def _check_correction(student_message: str, prev_ai_msg: str = "", prev_student_msg: str = "") -> dict | None:
    """Isolated grammar check with minimal tense context from the previous exchange."""
    context_block = ""
    if prev_ai_msg or prev_student_msg:
        context_block = f"""
Previous exchange (use ONLY to determine the appropriate tense for the student's current message — do not evaluate or comment on it):
AI: {prev_ai_msg}
Student: {prev_student_msg}
"""

    prompt = f"""You are an English grammar checker for a Persian ESL student.
{context_block}
Student's current message: {json.dumps(student_message)}

Check EVERY sentence for real grammatical errors: wrong tense, missing or wrong article, subject-verb disagreement, wrong verb form, missing preposition, article used with an uncountable noun.

Use the context messages to determine tense. They tell you WHEN the events happened. If the student is describing a past event, past tense is correct — read the context before deciding.
Example: context shows yesterday's dinner → "She make it alone" → "She made it alone" (NOT "She makes").

Uncountable noun errors to catch — these ARE errors:
- "She cooked a very delicious food." → "She cooked very delicious food." ('food' is uncountable — remove 'a')
- "I have a good news." → "I have good news." ('news' is uncountable — remove 'a')
- "She gave me an advice." → "She gave me advice." ('advice' is uncountable — remove 'an')

Examples of what NOT to change:
- "No I dont cook." — fix only the apostrophe: "No I don't cook." Do NOT add a comma after 'No'.

In `corrected`, copy the student's message exactly — same words, same word order, same punctuation — except for genuine grammar fixes.
In `note`, list only the fixes you actually made. Never mention a change you did not make.

Rule: every sentence in `corrected` must be natural English that a native speaker would actually say. If fixing an error would produce an unnatural sentence, leave that part unchanged and correct only what you can fix cleanly.
"I work in emergency." → leave unchanged. Do NOT write "the emergency" or "emergency room".

If you find ANY real grammar error:
Return a JSON object:
{{"corrected": "<student's full message with only grammar errors fixed>", "note": "<one English line listing every fix, matching exactly what changed in corrected>", "note_fa": "<same explanation in Persian>"}}

If there are genuinely zero real grammar errors:
Return exactly: null

Return ONLY the JSON object or null. No other text, no markdown."""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}]
    )
    raw = response.content[0].text.strip()
    if raw.lower() == "null" or not raw:
        return None
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        return json.loads(raw)
    except Exception:
        return None


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

    # Count previous sessions (not including the one just created) for opener style rotation
    prev_session_count = (
        db.query(models.ConversationSession)
        .filter(models.ConversationSession.student_id == body.student_id)
        .count()
    )
    opener_style = OPENER_STYLES[max(0, prev_session_count - 1) % 4]

    # Fetch last 5 topics for this student to avoid repetition
    recent_sessions = (
        db.query(models.ConversationSession)
        .filter(
            models.ConversationSession.student_id == body.student_id,
            models.ConversationSession.topic.isnot(None),
            models.ConversationSession.id != session.id,
        )
        .order_by(models.ConversationSession.started_at.desc())
        .limit(5)
        .all()
    )
    recent_topics = [s.topic for s in recent_sessions if s.topic]
    avoid_topics_block = ""
    if recent_topics:
        avoid_topics_block = f"\nRecent topics already covered (do NOT use these): {', '.join(recent_topics)}.\n"

    context_hint = ""
    if body.topic:
        context_hint = f"\nThe suggested topic is: {body.topic}."
    if body.scenario:
        context_hint += f"\nScenario: {body.scenario}."

    opening_prompt = (
        f"You are Sara — a friendly adult native English speaker chatting with {student.name} as a friend.\n"
        f"{avoid_topics_block}"
        f"{context_hint}\n"
        f"THIS TURN: {opener_style}\n"
        f"FORBIDDEN phrases (never use these): 'How are you doing today', 'What have you been up to', 'How are you today'.\n"
        f"Casual spoken English only. 1–2 sentences max. Return ONLY the opening line as plain text."
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

    # Keep context focused — send at most the last 20 turns
    if len(prior_turns) > 20:
        prior_turns = prior_turns[-20:]

    messages = []
    for turn in prior_turns:
        claude_role = "user" if turn.role == "student" else "assistant"
        messages.append({"role": claude_role, "content": turn.content})
    messages.append({"role": "user", "content": body.message})

    turn_mode = REPLY_MODES[session.turn_count % 6]
    reply_system = _build_reply_system_prompt(
        student, errors,
        session.lesson_type, session.topic, session.scenario,
        turn_mode=turn_mode
    )

    # Call 1: conversational reply (uses full history context)
    reply_response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        system=reply_system,
        messages=messages,
    )
    reply_text = reply_response.content[0].text.strip()

    # Call 2: isolated grammar correction — pass last AI + student turn for tense context only
    prev_ai_msg = ""
    prev_student_msg = ""
    for turn in reversed(prior_turns):
        if not prev_ai_msg and turn.role == "ai":
            prev_ai_msg = turn.content
        elif not prev_student_msg and turn.role == "student":
            prev_student_msg = turn.content
        if prev_ai_msg and prev_student_msg:
            break
    correction = _check_correction(body.message, prev_ai_msg=prev_ai_msg, prev_student_msg=prev_student_msg)
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
        content=reply_text,
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
        "reply": reply_text,
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
        max_tokens=1500,
        messages=[{"role": "user", "content": summary_prompt}]
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        report = json.loads(raw)
    except Exception:
        report = {
            "error": "Summary generation failed to produce valid JSON",
            "raw": raw[:500],
            "summary": "", "summary_fa": "", "strengths": [], "focus_areas": [], "new_words": [],
        }

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
