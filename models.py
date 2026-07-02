from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class Student(Base):
    __tablename__ = "students"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True)
    level = Column(String(50))
    book = Column(String(200))
    password = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    errors = relationship("StudentError", back_populates="student")
    interactions = relationship("StudentInteraction", back_populates="student")

class StudentError(Base):
    __tablename__ = "student_errors"
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    wrong = Column(String(255))
    correct = Column(String(255))
    noted_at = Column(DateTime, default=datetime.utcnow)
    student = relationship("Student", back_populates="errors")

class StudentInteraction(Base):
    __tablename__ = "student_interactions"
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    persian_input = Column(Text)
    english_translation = Column(Text)
    book_sentences = Column(Text)
    grammar_point = Column(Text)
    practice_exercises = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    duration_seconds = Column(Integer, nullable=True)
    total_retries = Column(Integer, default=0)
    fully_correct = Column(Boolean, nullable=True)
    student = relationship("Student", back_populates="interactions")

class StudentEvent(Base):
    __tablename__ = "student_events"
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    event_type = Column(String(50))
    interaction_id = Column(Integer, ForeignKey("student_interactions.id"), nullable=True)
    event_metadata = Column("metadata", Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    student = relationship("Student")

class StudentVocabulary(Base):
    __tablename__ = "student_vocabulary"
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    word = Column(String(100))
    translation = Column(String(255))
    box = Column(Integer, default=1)
    next_review = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    student = relationship("Student")
