import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, DateTime, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from db.database import Base


class SalaryRate(Base):
    __tablename__ = "salary_rates"
    __table_args__ = (UniqueConstraint("role_title", "seniority", "region"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role_title: Mapped[str] = mapped_column(String(100), nullable=False)
    seniority: Mapped[str] = mapped_column(String(20), nullable=False)
    region: Mapped[str] = mapped_column(String(10), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False)
    annual_min: Mapped[int] = mapped_column(Integer, nullable=False)
    annual_max: Mapped[int] = mapped_column(Integer, nullable=False)
    hourly_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    hourly_max: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SalaryHistory(Base):
    __tablename__ = "salary_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role_title: Mapped[str] = mapped_column(String(100))
    seniority: Mapped[str] = mapped_column(String(20))
    region: Mapped[str] = mapped_column(String(10))
    annual_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    annual_max: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scraped_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Session(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    raw_input: Mapped[str] = mapped_column(Text, nullable=False)
    region: Mapped[str] = mapped_column(String(10), default="TN")
    a2a_payload: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    full_result: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
