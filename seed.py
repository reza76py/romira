from database import SessionLocal, engine
import models

models.Base.metadata.create_all(bind=engine)

db = SessionLocal()
roya = models.Student(name="Roya", level="", book="Grace Darling")
samira = models.Student(name="Samira", level="", book="Grace Darling")
db.add(roya)
db.add(samira)
db.commit()
print("Seeded Roya and Samira with no errors and no passwords.")
db.close()
