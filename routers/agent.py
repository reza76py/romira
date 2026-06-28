from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
import anthropic
import os
from dotenv import load_dotenv
from dependencies import embedding_model, collection
import json

load_dotenv()

router = APIRouter(prefix="/agent", tags=["agent"])

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# --- Tool definitions ---

TOOLS = [
    {
        "name": "get_student_profile",
        "description": "Fetches a student's name, level, current book, and list of known grammar errors from the database.",
        "input_schema": {
            "type": "object",
            "properties": {
                "student_id": {
                    "type": "integer",
                    "description": "The ID of the student to fetch."
                }
            },
            "required": ["student_id"]
        }
    },
    {
        "name": "search_book",
        "description": "Searches the student's graded reader book for sentences relevant to a given query. Returns the most relevant sentences to use in exercises.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "A short search query describing what kind of sentences to find."
                },
                "n_results": {
                    "type": "integer",
                    "description": "How many sentences to return. Default is 5."
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "generate_exercise",
        "description": "Generates a grammar exercise for the student using provided book sentences and their known errors.",
        "input_schema": {
            "type": "object",
            "properties": {
                "student_name": {
                    "type": "string",
                    "description": "The student's name."
                },
                "student_level": {
                    "type": "string",
                    "description": "The student's English level e.g. A2-B1."
                },
                "errors": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of known errors in 'wrong → correct' format."
                },
                "sentences": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Real sentences from the book to base the exercise on."
                },
                "exercise_type": {
                    "type": "string",
                    "description": "Type of exercise e.g. 'warm-up', 'main grammar exercise'."
                }
            },
            "required": ["student_name", "student_level", "errors", "sentences", "exercise_type"]
        }
    }
]


# --- Tool executor functions ---

def run_get_student_profile(student_id: int, db: Session) -> dict:
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        return {"error": f"Student {student_id} not found"}
    errors = db.query(models.StudentError).filter(
        models.StudentError.student_id == student_id
    ).all()
    return {
        "id": student.id,
        "name": student.name,
        "level": student.level,
        "book": student.book,
        "errors": [f"{e.wrong} → {e.correct}" for e in errors]
    }


def run_search_book(query: str, n_results: int = 5) -> dict:
    query_embedding = embedding_model.encode(query).tolist()
    results = collection.query(query_embeddings=[query_embedding], n_results=n_results)
    return {"sentences": results["documents"][0]}


def run_generate_exercise(
    student_name: str,
    student_level: str,
    errors: list,
    sentences: list,
    exercise_type: str
) -> dict:
    error_list = "\n".join([f"- {e}" for e in errors])
    sentence_list = "\n".join(sentences)

    prompt = f"""You are an English teacher assistant helping a student named {student_name}.
Their level is {student_level}.

Their known errors are:
{error_list}

Here are real sentences from their graded reader book:
{sentence_list}

Create one {exercise_type} (3-5 sentences) using ONLY the sentences above.
Modify those sentences slightly to include the student's known errors as mistakes to correct.
Use simple vocabulary appropriate for their level.
"""
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )
    return {"exercise": message.content[0].text}


# --- Tool dispatcher ---

def dispatch_tool(tool_name: str, tool_input: dict, db: Session) -> str:
    if tool_name == "get_student_profile":
        result = run_get_student_profile(tool_input["student_id"], db)
    elif tool_name == "search_book":
        result = run_search_book(
            tool_input["query"],
            tool_input.get("n_results", 5)
        )
    elif tool_name == "generate_exercise":
        result = run_generate_exercise(
            tool_input["student_name"],
            tool_input["student_level"],
            tool_input["errors"],
            tool_input["sentences"],
            tool_input["exercise_type"]
        )
    else:
        result = {"error": f"Unknown tool: {tool_name}"}

    return json.dumps(result)


@router.post("/prepare-lesson")
def prepare_lesson(student_id: int, db: Session = Depends(get_db)):

    # Verify student exists before starting the loop
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Initial message — the agent's goal
    messages = [
        {
            "role": "user",
            "content": f"""You are Romira, an AI English teaching assistant.
Your goal is to prepare a complete lesson plan for student_id {student_id}.

Follow these steps in order:
1. Call get_student_profile to fetch the student's details and errors
2. Call search_book to find relevant sentences for a warm-up exercise
3. Call generate_exercise to create a warm-up exercise (short, easy)
4. Call search_book again to find sentences for the main grammar exercise
5. Call generate_exercise to create the main grammar exercise (targeting their errors)
6. Return a final structured lesson plan as JSON with these keys:
   - student_name
   - student_level
   - warm_up_exercise
   - main_exercise
   - errors_targeted (list)
   - suggested_next_topic (one grammar topic to work on next)

Only return the final JSON. No extra explanation."""
        }
    ]

    # --- Agentic loop ---
    tool_calls_log = []

    while True:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            tools=TOOLS,
            messages=messages
        )

        # Add Claude's response to the conversation
        messages.append({"role": "assistant", "content": response.content})

        # If Claude is done (no more tool calls), extract final answer
        if response.stop_reason == "end_turn":
            final_text = next(
                (block.text for block in response.content if hasattr(block, "text")),
                None
            )
            # Strip markdown code fences if present
            if final_text:
                final_text = final_text.strip()
                if final_text.startswith("```"):
                    final_text = final_text.split("\n", 1)[-1]
                    final_text = final_text.rsplit("```", 1)[0].strip()
            try:
                lesson_plan = json.loads(final_text)
            except Exception:
                lesson_plan = {"raw": final_text}

            return {
                "lesson_plan": lesson_plan,
                "tool_calls_log": tool_calls_log
            }

        # If Claude wants to use tools, execute each one
        if response.stop_reason == "tool_use":
            tool_results = []

            for block in response.content:
                if block.type == "tool_use":
                    tool_calls_log.append({
                        "tool": block.name,
                        "input": block.input
                    })
                    result = dispatch_tool(block.name, block.input, db)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result
                    })

            # Send all tool results back to Claude
            messages.append({"role": "user", "content": tool_results})