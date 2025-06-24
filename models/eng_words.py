from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.ext.declarative import declarative_base
import json
from sqlalchemy.dialects.postgresql import JSON

from models import Base

class Word(Base):
    __tablename__ = "eng_words"

    id = Column(Integer, primary_key=True, autoincrement=True)
    eng = Column(String(100), nullable=False)
    rus = Column(String(255), nullable=False)
    transcript = Column(String(100))
    image_data = Column(Text, nullable=True)  # base64
    sound_data = Column(JSON, nullable=True)  # JSON { voice: base64 }
