
from sqlalchemy import Boolean, Column, Integer, String, ForeignKey
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    subject = Column(String, default="AI/ML")
    deadline = Column(String, nullable=True)
    completed = Column(Boolean, default=False)
    reminder_minutes = Column(Integer, default=15)

    # Each task belongs to a user
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
