from fastapi import FastAPI
from database import engine
import models
from routers import students
from routers import chat
from routers import agent
from routers import student

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Romira",
    description="AI English Teaching Assistant for Roya and Samira",
    version="1.0.0"
)

app.include_router(students.router)
app.include_router(chat.router)
app.include_router(agent.router)
app.include_router(student.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to Romira"}
