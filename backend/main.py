
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import User, Task


# ---------- Configuration ----------

SECRET_KEY = os.environ.get("STUDYSYNC_SECRET_KEY")

if not SECRET_KEY:
    raise RuntimeError(
        "Set STUDYSYNC_SECRET_KEY before starting the backend."
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

password_hash = PasswordHash.recommended()
bearer_scheme = HTTPBearer()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="StudySync AI API")

# ---------- CORS ----------


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# ---------- Request schemas ----------

class SignupData(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginData(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=250)
    subject: Optional[str] = "AI/ML"
    deadline: Optional[str] = None
    reminder_minutes: int = Field(default=15, ge=0)


class TaskUpdate(BaseModel):
    completed: Optional[bool] = None
    title: Optional[str] = Field(default=None, max_length=250)
    subject: Optional[str] = None
    deadline: Optional[str] = None
    reminder_minutes: Optional[int] = Field(default=None, ge=0)


# ---------- Helper functions ----------

def create_access_token(user_id: int) -> str:
    expires = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": str(user_id), "exp": expires}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(
            credentials.credentials,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )
        user_id = int(payload["sub"])
    except (
        jwt.InvalidTokenError,
        ValueError,
        TypeError,
        KeyError,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def user_to_dict(user: User):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
    }


def task_to_dict(task: Task):
    return {
        "id": task.id,
        "title": task.title,
        "subject": task.subject,
        "deadline": task.deadline,
        "completed": task.completed,
        "reminderMinutes": task.reminder_minutes,
    }


# ---------- Basic routes ----------

@app.get("/")
def home():
    return {
        "message": "StudySync AI backend is running!",
        "status": "success",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


# ---------- Authentication ----------

@app.post("/auth/signup", status_code=status.HTTP_201_CREATED)
def signup(data: SignupData, db: Session = Depends(get_db)):
    name = data.name.strip()
    email = str(data.email).strip().lower()

    if not name:
        raise HTTPException(status_code=400, detail="Name is required.")

    existing_user = db.query(User).filter(User.email == email).first()

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists.",
        )

    user = User(
        name=name,
        email=email,
        hashed_password=password_hash.hash(data.password),
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "Account created successfully. Please log in.",
        "user": user_to_dict(user),
    }


@app.post("/auth/login")
def login(data: LoginData, db: Session = Depends(get_db)):
    email = str(data.email).strip().lower()
    user = db.query(User).filter(User.email == email).first()

    if user is None or not password_hash.verify(
        data.password,
        user.hashed_password,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
        "user": user_to_dict(user),
    }


@app.get("/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return user_to_dict(current_user)


# ---------- Protected task routes ----------

@app.get("/tasks")
def get_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return [
        task_to_dict(task)
        for task in (
            db.query(Task)
            .filter(Task.user_id == current_user.id)
            .order_by(Task.id.desc())
            .all()
        )
    ]


@app.post("/tasks")
def create_task(
    data: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    title = data.title.strip()

    if not title:
        raise HTTPException(
            status_code=400,
            detail="Task title is required.",
        )

    task = Task(
        title=title,
        subject=data.subject or "AI/ML",
        deadline=data.deadline,
        completed=False,
        reminder_minutes=data.reminder_minutes,
        user_id=current_user.id,
    )

    db.add(task)
    db.commit()
    db.refresh(task)

    return task_to_dict(task)


@app.patch("/tasks/{task_id}")
def update_task(
    task_id: int,
    data: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = (
        db.query(Task)
        .filter(
            Task.id == task_id,
            Task.user_id == current_user.id,
        )
        .first()
    )

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")

    changes = data.model_dump(exclude_unset=True)

    if "title" in changes and changes["title"] is not None:
        changes["title"] = changes["title"].strip()

        if not changes["title"]:
            raise HTTPException(
                status_code=400,
                detail="Title cannot be empty.",
            )

    for field, value in changes.items():
        setattr(task, field, value)

    db.commit()
    db.refresh(task)

    return task_to_dict(task)


@app.delete("/tasks/{task_id}")
def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = (
        db.query(Task)
        .filter(
            Task.id == task_id,
            Task.user_id == current_user.id,
        )
        .first()
    )

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")

    db.delete(task)
    db.commit()

    return {"message": "Task deleted successfully."}
from learning_agent import router as learning_router

app.include_router(learning_router)
