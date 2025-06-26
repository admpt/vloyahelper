import os
import random
from datetime import date
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from pydantic import BaseModel
from dotenv import load_dotenv
import mimetypes

from models import User, Word, Base

# Загрузка переменных окружения
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL not set in environment variables")

# Настройка асинхронного движка
async_engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    expire_on_commit=False,
)


# Pydantic модели
class UserCreate(BaseModel):
    telegram_id: int
    username: Optional[str] = None
    first_name: str
    last_name: Optional[str] = None


class UserUpdate(BaseModel):
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    words_per_day: Optional[int] = None
    eng_learned_words: Optional[List[int]] = None
    eng_skipped_words: Optional[List[int]] = None
    last_learning_date: Optional[date] = None
    current_streak: Optional[int] = None
    exp: Optional[int] = None


class UserResponse(BaseModel):
    telegram_id: int
    username: Optional[str]
    first_name: str
    last_name: Optional[str]
    exp: int
    words_per_day: Optional[int]
    eng_learned_words: List[int]
    eng_skipped_words: List[int]
    last_learning_date: Optional[date]
    current_streak: int

    class Config:
        from_attributes = True


class WordResponse(BaseModel):
    id: int
    eng: str
    rus: str
    transcript: Optional[str]
    image_data: Optional[str]
    sound_data: Optional[dict]

    class Config:
        from_attributes = True


class WordsByIdsRequest(BaseModel):
    ids: List[int]


# Dependency для получения асинхронной сессии БД
async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


# Контекстный менеджер для жизненного цикла приложения
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ База данных инициализирована")

    yield

    # Shutdown
    await async_engine.dispose()
    print("🔌 Соединение с базой данных закрыто")


# FastAPI приложение
app = FastAPI(
    title="Language Learning API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.mount("/static", StaticFiles(directory="static"), name="static")

from fastapi.responses import Response
@app.get("/static/{file_path:path}")
async def serve_static_file(file_path: str):
    file_location = f"static/{file_path}"

    if not os.path.exists(file_location):
        raise HTTPException(status_code=404, detail="File not found")

    # Читаем файл как bytes, не как text!
    with open(file_location, 'rb') as f:
        content = f.read()

    mime_type = 'application/javascript' if file_path.endswith('.js') else None

    return Response(
        content=content,  # bytes, не string!
        media_type=mime_type
    )

# Корневой маршрут для главной страницы
@app.get("/")
async def serve_index():
    """
    Отдает главную страницу приложения
    """
    return FileResponse("static/index.html", media_type="text/html")


# Альтернативный маршрут для главной страницы
@app.get("/static/")
async def serve_index_static():
    """
    Альтернативный маршрут для index.html
    """
    return FileResponse("static/index.html", media_type="text/html")


# API endpoints

@app.get("/health")
async def health_check():
    """Проверка работоспособности API"""
    return {"status": "healthy", "message": "Language Learning API is running"}


# Проверка статических файлов
@app.get("/check-static")
async def check_static():
    """Диагностика статических файлов"""
    static_files = []
    static_exists = os.path.exists("static")

    if static_exists:
        try:
            static_files = os.listdir("static")
        except Exception as e:
            return {
                "static_directory_exists": static_exists,
                "error": str(e),
                "files": []
            }

    return {
        "static_directory_exists": static_exists,
        "files": static_files,
        "required_files": {
            "index.html": os.path.exists("static/index.html"),
            "script.js": os.path.exists("static/script.js"),
            "styles.css": os.path.exists("static/styles.css")
        }
    }


# Пользователи
@app.get("/api/users/{telegram_id}", response_model=UserResponse)
async def get_user(telegram_id: int, db: AsyncSession = Depends(get_db)):
    """Получение данных пользователя по Telegram ID"""
    result = await db.execute(
        select(User).where(User.telegram_id == telegram_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        # Создаем нового пользователя с базовыми данными
        user = User(
            telegram_id=telegram_id,
            first_name="User",
            exp=0,
            words_per_day=None,
            eng_learned_words=[],
            eng_skipped_words=[],
            current_streak=0
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user


@app.post("/api/users", response_model=UserResponse)
async def create_user(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    """Создание нового пользователя"""
    # Проверяем, существует ли пользователь
    result = await db.execute(
        select(User).where(User.telegram_id == user_data.telegram_id)
    )
    existing_user = result.scalar_one_or_none()

    if existing_user:
        return existing_user

    user = User(
        telegram_id=user_data.telegram_id,
        username=user_data.username,
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        exp=0,
        eng_learned_words=[],
        eng_skipped_words=[],
        current_streak=0
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@app.put("/api/users/{telegram_id}", response_model=UserResponse)
async def update_user(telegram_id: int, user_data: UserUpdate, db: AsyncSession = Depends(get_db)):
    """Обновление данных пользователя"""
    result = await db.execute(
        select(User).where(User.telegram_id == telegram_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Обновляем только переданные поля
    for field, value in user_data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)
    return user


# Слова
@app.get("/api/words", response_model=List[WordResponse])
async def get_words(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    """Получение списка слов с пагинацией"""
    result = await db.execute(
        select(Word).offset(skip).limit(limit)
    )
    words = result.scalars().all()
    return words


@app.get("/api/words/{word_id}", response_model=WordResponse)
async def get_word(word_id: int, db: AsyncSession = Depends(get_db)):
    """Получение конкретного слова по ID"""
    result = await db.execute(
        select(Word).where(Word.id == word_id)
    )
    word = result.scalar_one_or_none()

    if not word:
        raise HTTPException(status_code=404, detail="Word not found")
    return word


@app.get("/api/words/random/{count}", response_model=List[WordResponse])
async def get_random_words(count: int, exclude: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """Получение случайных слов для изучения"""
    if count <= 0:
        raise HTTPException(status_code=400, detail="Count must be positive")

    if count > 100:
        count = 100  # Ограничиваем максимальное количество

    query = select(Word)

    # Исключаем указанные ID
    if exclude:
        try:
            exclude_ids = [int(x) for x in exclude.split(',') if x.strip()]
            if exclude_ids:
                query = query.where(~Word.id.in_(exclude_ids))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid exclude parameter")

    # Получаем случайные слова
    result = await db.execute(query.order_by(func.random()).limit(count))
    words = result.scalars().all()

    return words


@app.post("/api/words/by-ids", response_model=List[WordResponse])
async def get_words_by_ids(request: WordsByIdsRequest, db: AsyncSession = Depends(get_db)):
    """Получение слов по списку ID"""
    if not request.ids:
        return []

    if len(request.ids) > 100:
        raise HTTPException(status_code=400, detail="Too many IDs requested")

    result = await db.execute(
        select(Word).where(Word.id.in_(request.ids))
    )
    words = result.scalars().all()
    return words


# Статистика
@app.get("/api/users/{telegram_id}/stats")
async def get_user_stats(telegram_id: int, db: AsyncSession = Depends(get_db)):
    """Получение статистики пользователя"""
    result = await db.execute(
        select(User).where(User.telegram_id == telegram_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    total_words = len(user.eng_learned_words) if user.eng_learned_words else 0
    training_count = total_words // 5  # Примерно 5 слов за тренировку

    # Проверяем изучение на сегодня
    today = date.today()
    learned_today = 0
    if user.last_learning_date == today and user.eng_learned_words:
        # Для упрощения считаем количество слов, изученных сегодня
        learned_today = min(total_words, user.words_per_day or 0)

    return {
        "streak": user.current_streak,
        "total_words": total_words,
        "training_count": training_count,
        "learned_today": learned_today,
        "words_per_day": user.words_per_day or 0
    }


# Обновление прогресса изучения
@app.post("/api/users/{telegram_id}/learn-words")
async def learn_words(
        telegram_id: int,
        word_ids: List[int],
        db: AsyncSession = Depends(get_db)
):
    """Сохранение прогресса изучения слов"""
    if not word_ids:
        raise HTTPException(status_code=400, detail="No word IDs provided")

    if len(word_ids) > 50:
        raise HTTPException(status_code=400, detail="Too many words in one request")

    result = await db.execute(
        select(User).where(User.telegram_id == telegram_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    today = date.today()

    # Добавляем новые слова к изученным
    current_learned = set(user.eng_learned_words or [])
    new_words = set(word_ids)
    all_learned = list(current_learned | new_words)

    # Обновляем данные пользователя
    user.eng_learned_words = all_learned

    # Обновляем streak только если это первое изучение сегодня
    if user.last_learning_date != today:
        from datetime import timedelta
        yesterday = today - timedelta(days=1)

        if user.last_learning_date == yesterday:
            user.current_streak += 1
        else:
            user.current_streak = 1

        user.last_learning_date = today

    # Добавляем опыт за изученные слова
    new_words_count = len(new_words - current_learned)
    user.exp += new_words_count * 10  # 10 очков опыта за новое слово

    await db.commit()
    await db.refresh(user)

    return {
        "success": True,
        "learned_words": len(all_learned),
        "new_words": new_words_count,
        "exp_gained": new_words_count * 10,
        "current_streak": user.current_streak
    }


# Дополнительный эндпоинт для тестирования API
@app.get("/api/test")
async def test_api():
    """Тестовый эндпоинт для проверки API"""
    return {
        "message": "API работает корректно!",
        "timestamp": date.today().isoformat(),
        "endpoints": {
            "users": "/api/users/{telegram_id}",
            "words": "/api/words",
            "random_words": "/api/words/random/{count}",
            "stats": "/api/users/{telegram_id}/stats"
        }
    }


if __name__ == "__main__":
    import uvicorn

    print("🚀 Запускаем Language Learning API...")
    print("📁 Проверяем статические файлы...")

    # Проверяем статические файлы при запуске
    if not os.path.exists("static"):
        print("❌ Папка 'static' не найдена!")
    else:
        required_files = ["index.html", "script.js", "styles.css"]
        for file in required_files:
            if os.path.exists(f"static/{file}"):
                print(f"✅ {file} найден")
            else:
                print(f"❌ {file} НЕ найден!")

    uvicorn.run(app, host="0.0.0.0", port=8000)