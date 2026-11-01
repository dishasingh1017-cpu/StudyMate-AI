
import os
import jwt
import json
import secrets
import hashlib
import urllib.request
import urllib.error

from datetime import datetime, timedelta, timezone
from typing import Optional
from html import escape

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from pydantic import BaseModel, EmailStr, Field
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import User, Task, PasswordResetToken


# ---------- Configuration ----------

SECRET_KEY = os.environ.get("STUDYSYNC_SECRET_KEY")

if not SECRET_KEY:
    raise RuntimeError(
        "Set STUDYSYNC_SECRET_KEY before starting the backend."
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

RESEND_API_KEY = os.getenv("RESEND_API_KEY")

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "https://study-mate-ai-nu-one.vercel.app"
)

RESET_TOKEN_EXPIRE_MINUTES = 20

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
        "https://study-mate-ai-nu-one.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Request Schemas ----------

class SignupData(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginData(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordData(BaseModel):
    email: EmailStr


class ResetPasswordData(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(min_length=8, max_length=128)


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


# ---------- Helper Functions ----------

def create_access_token(user_id: int) -> str:
    expires = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user_id),
        "exp": expires,
    }

    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )


def hash_reset_token(token: str) -> str:
    return hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()


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

    user = db.query(User).filter(
        User.id == user_id
    ).first()

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


# ---------- Resend Email Function ----------

def send_reset_email(email: str, name: str, reset_link: str):

    if not RESEND_API_KEY:
        raise RuntimeError(
            "RESEND_API_KEY is not configured."
        )

    payload = {
        "from": "StudySync AI <onboarding@resend.dev>",
        "to": [email],
        "subject": "Reset your StudySync AI password",

        "html": f"""
        <div style="font-family:Arial,sans-serif;
                    max-width:550px;margin:auto">

            <h2>StudySync AI Password Reset</h2>

            <p>Hello {escape(name)},</p>

            <p>
                We received a request to reset your
                StudySync AI account password.
            </p>

            <p>
                <a href="{escape(reset_link, quote=True)}"
                   style="background:#4f46e5;
                   color:white;
                   padding:12px 20px;
                   text-decoration:none;
                   border-radius:6px;
                   display:inline-block">

                   Reset Password

                </a>
            </p>

            <p>
                This link expires in 20 minutes
                and can only be used once.
            </p>

            <p>
                If you did not request this,
                please ignore this email.
            </p>

            <p>StudySync AI Team</p>

        </div>
        """
    }

    request = urllib.request.Request(
        "https://api.resend.com/emails",

        data=json.dumps(payload).encode("utf-8"),

        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        },

        method="POST",
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=20
        ) as response:

            return json.loads(
                response.read().decode("utf-8")
            )

    except urllib.error.HTTPError as error:

        error_body = error.read().decode(
            "utf-8",
            errors="replace"
        )

        print(
            "Resend email error:",
            error.code,
            error_body
        )

        raise RuntimeError(
            "Email provider rejected the request."
        ) from error

    except urllib.error.URLError as error:

        print(
            "Resend connection error:",
            str(error.reason)
        )

        raise RuntimeError(
            "Could not connect to email provider."
        ) from error


# ---------- Basic Routes ----------

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

@app.post(
    "/auth/signup",
    status_code=status.HTTP_201_CREATED
)
def signup(
    data: SignupData,
    db: Session = Depends(get_db)
):

    name = data.name.strip()
    email = str(data.email).strip().lower()

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Name is required."
        )

    existing_user = db.query(User).filter(
        User.email == email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists."
        )

    user = User(
        name=name,
        email=email,
        hashed_password=password_hash.hash(
            data.password
        ),
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "Account created successfully. Please log in.",
        "user": user_to_dict(user),
    }


@app.post("/auth/login")
def login(
    data: LoginData,
    db: Session = Depends(get_db)
):

    email = str(data.email).strip().lower()

    user = db.query(User).filter(
        User.email == email
    ).first()

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


# ---------- Forgot Password ----------

@app.post("/auth/forgot-password")
def forgot_password(
    data: ForgotPasswordData,
    db: Session = Depends(get_db),
):

    email = str(data.email).strip().lower()

    generic_response = {
        "message": (
            "If an account exists with this email, "
            "a password reset link will be sent."
        )
    }

    user = db.query(User).filter(
        User.email == email
    ).first()

    if user is None:
        return generic_response

    if not RESEND_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Password reset email service is not configured."
        )

    raw_token = secrets.token_urlsafe(32)

    token_hash = hash_reset_token(raw_token)

    now = datetime.now(timezone.utc).replace(
        tzinfo=None
    )

    try:

        # Invalidate older unused reset links.

        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        ).update(
            {"used_at": now},
            synchronize_session=False,
        )

        reset_record = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=now + timedelta(
                minutes=RESET_TOKEN_EXPIRE_MINUTES
            ),
        )

        db.add(reset_record)
        db.commit()

        reset_link = (
            f"{FRONTEND_URL.rstrip('/')}"
            f"/?reset_token={raw_token}"
        )

        send_reset_email(
            user.email,
            user.name,
            reset_link
        )

    except Exception as error:

        db.rollback()

        print(
            "Forgot password error:",
            str(error)
        )

        raise HTTPException(
            status_code=503,
            detail="Unable to send the reset email right now. Please try again later."
        )

    return generic_response


# ---------- Reset Password ----------

@app.post("/auth/reset-password")
def reset_password(
    data: ResetPasswordData,
    db: Session = Depends(get_db),
):

    token_hash = hash_reset_token(data.token)

    now = datetime.now(timezone.utc).replace(
        tzinfo=None
    )

    reset_record = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .first()
    )

    if reset_record is None:
        raise HTTPException(
            status_code=400,
            detail="This reset link is invalid or expired. Please request a new one.",
        )

    user = db.query(User).filter(
        User.id == reset_record.user_id
    ).first()

    if user is None:
        raise HTTPException(
            status_code=400,
            detail="This reset link is invalid or expired."
        )

    user.hashed_password = password_hash.hash(
        data.new_password
    )

    reset_record.used_at = now

    # Invalidate every other outstanding reset link.

    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.id != reset_record.id,
        PasswordResetToken.used_at.is_(None),
    ).update(
        {"used_at": now},
        synchronize_session=False,
    )

    db.commit()

    return {
        "message": (
            "Password reset successful. "
            "Please log in with your new password."
        )
    }


# ---------- Current User ----------

@app.get("/auth/me")
def get_me(
    current_user: User = Depends(get_current_user)
):
    return user_to_dict(current_user)


# ---------- Protected Task Routes ----------

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
            detail="Task title is required."
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
        raise HTTPException(
            status_code=404,
            detail="Task not found."
        )

    changes = data.model_dump(
        exclude_unset=True
    )

    if "title" in changes and changes["title"] is not None:

        changes["title"] = changes["title"].strip()

        if not changes["title"]:
            raise HTTPException(
                status_code=400,
                detail="Title cannot be empty."
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
        raise HTTPException(
            status_code=404,
            detail="Task not found."
        )

    db.delete(task)
    db.commit()

    return {
        "message": "Task deleted successfully."
    }


# ---------- Learning Agent ----------

from learning_agent import router as learning_router

app.include_router(learning_router)
