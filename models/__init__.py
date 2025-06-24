from sqlalchemy.orm import declarative_base

Base = declarative_base()

from .users_tasks import User, Task
from .eng_words import Word