from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    level = Column(String)
    book = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    errors = relationship("StudentError", back_populates="student")


class StudentError(Base):
    __tablename__ = "student_errors"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    wrong = Column(String)
    correct = Column(String)
    noted_at = Column(DateTime, default=datetime.utcnow)

    student = relationship("Student", back_populates="errors")