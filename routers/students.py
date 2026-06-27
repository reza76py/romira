from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
import schemas

router = APIRouter(
    prefix="/students",
    tags=["students"]
)


@router.get("/", response_model=list[schemas.StudentResponse])
def get_students(db: Session = Depends(get_db)):
    students = db.query(models.Student).all()
    return students


@router.post("/", response_model=schemas.StudentResponse)
def create_student(student: schemas.StudentCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Student).filter(
        models.Student.name == student.name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Student already exists")

    db_student = models.Student(
        name=student.name,
        level=student.level,
        book=student.book
    )
    db.add(db_student)
    db.commit()
    db.refresh(db_student)
    return db_student

@router.post("/{student_id}/errors", response_model=schemas.StudentErrorResponse)
def add_student_error(student_id: int, error: schemas.StudentErrorCreate, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    db_error = models.StudentError(
        student_id=student_id,
        wrong=error.wrong,
        correct=error.correct
    )
    db.add(db_error)
    db.commit()
    db.refresh(db_error)
    return db_error


@router.get("/{student_id}/errors", response_model=list[schemas.StudentErrorResponse])
def get_student_errors(student_id: int, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    return student.errors