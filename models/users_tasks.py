from sqlalchemy import Column, BigInteger, String, Integer, Text, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from datetime import date
from sqlalchemy import Column, Integer, BigInteger, Text, Date, Boolean, DateTime, ForeignKey, func

from models import Base


class User(Base):
    __tablename__ = "users"

    telegram_id = Column(BigInteger, primary_key=True)
    username = Column(String(32), nullable=True)
    first_name = Column(String(64), nullable=False)
    last_name = Column(String(64), nullable=True)

    exp = Column(Integer, default=0)
    awards = Column(Text, default="")
    time_line = Column(String(16), nullable=False, default="UTC+3:00")

    # Новые поля для изучения языков
    words_per_day = Column(Integer, nullable=True)  # 5, 10 или 15
    eng_learned_words = Column(JSON, default=lambda: [])  # список ID изученных слов
    eng_skipped_words = Column(JSON, default=lambda: [])  # список ID пропущенных слов
    last_learning_date = Column(Date, nullable=True)  # дата последнего изучения
    current_streak = Column(Integer, default=0)  # количество дней подряд

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    telegram_id = Column(BigInteger, ForeignKey("users.telegram_id"), nullable=True)  # None для общих задач
    text = Column(Text, nullable=False)
    date = Column(Date, default=date.today)
    is_done = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
