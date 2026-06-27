from pydantic import BaseModel
from datetime import datetime


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
    errors: list[StudentErrorResponse] = []

    class Config:
        from_attributes = True