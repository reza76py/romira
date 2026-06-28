from pydantic import BaseModel, field_validator
from datetime import datetime
import json


class StudentErrorBase(BaseModel):
    wrong: str
    correct: str


class StudentErrorCreate(StudentErrorBase):
    pass


class StudentErrorResponse(StudentErrorBase):
    id: int
    student_id: int
    noted_at: datetime

    class Config:
        from_attributes = True


class StudentBase(BaseModel):
    name: str
    level: str
    book: str


class StudentCreate(StudentBase):
    pass


class StudentResponse(StudentBase):
    id: int
    created_at: datetime
    password: str | None = None
    errors: list[StudentErrorResponse] = []

    class Config:
        from_attributes = True


class StudentLogin(BaseModel):
    password: str


class SetPassword(BaseModel):
    password: str


class CloseInteraction(BaseModel):
    duration_seconds: int
    total_retries: int
    fully_correct: bool


class StudentEventCreate(BaseModel):
    student_id: int
    event_type: str
    interaction_id: int | None = None
    metadata: str | None = None


class StudentEventResponse(BaseModel):
    id: int
    student_id: int
    event_type: str
    interaction_id: int | None
    event_metadata: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class StudentInteractionCreate(BaseModel):
    student_id: int
    persian_input: str


class StudentRetryCreate(BaseModel):
    student_id: int
    wrong_answer: str
    correct_answer: str
    grammar_point: str


class StudentInteractionResponse(BaseModel):
    id: int
    student_id: int
    persian_input: str
    english_translation: str
    book_sentences: list[dict] | list[str] = []
    grammar_point: str
    practice_exercises: list[str]
    created_at: datetime
    duration_seconds: int | None = None
    total_retries: int | None = None
    fully_correct: bool | None = None

    @field_validator('book_sentences', 'practice_exercises', mode='before')
    @classmethod
    def parse_json_field(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v

    class Config:
        from_attributes = True
