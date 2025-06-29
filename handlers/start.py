from datetime import timedelta, datetime, date

from aiogram import Router, F
from aiogram.fsm.context import FSMContext
from aiogram.types import Message, CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from aiogram.filters import Command
from aiogram.enums.chat_member_status import ChatMemberStatus
from aiogram.utils.keyboard import InlineKeyboardBuilder
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.users_tasks import User
from states import TimeZoneSetup

router = Router()

GROUP_ID = -1002808343764
INVITE_LINK = "https://t.me/+DyydsMuO8vA5ZTJi"

# URL вашего мини-приложения - измените на свой
WEBAPP_URL = "https://f260-82-215-100-140.ngrok-free.app/static/index.html"


def get_invite_keyboard():
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔗 Вступить в группу", url=INVITE_LINK)],
            [InlineKeyboardButton(text="🔄 Проверить подписку", callback_data="check_subscription")]
        ]
    )


def get_start_keyboard():
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Я готов", callback_data="ready_start")],
            [InlineKeyboardButton(text="Меня устраивает нынешняя жизнь", callback_data="not_ready")],
        ]
    )


def parse_timezone_offset(time_line: str) -> int:
    """Парсит часовой пояс и возвращает смещение в минутах"""
    import re
    match = re.match(r'UTC([+-])(\d{1,2}):?(\d{0,2})', time_line)
    if not match:
        return 180  # UTC+3 по умолчанию

    sign = 1 if match.group(1) == '+' else -1
    hours = int(match.group(2))
    minutes = int(match.group(3)) if match.group(3) else 0

    return sign * (hours * 60 + minutes)


def get_user_local_date(user: User) -> date:
    """Получает локальную дату пользователя"""
    offset_minutes = parse_timezone_offset(user.time_line)
    utc_now = datetime.utcnow()
    user_time = utc_now + timedelta(minutes=offset_minutes)
    return user_time.date()


def is_new_day(user: User) -> bool:
    """Проверяет, начался ли новый день для пользователя"""
    today = get_user_local_date(user)
    return user.last_learning_date != today


async def get_leaderboard_text(session: AsyncSession, user_id: int) -> str:
    top_result = await session.execute(
        select(User).order_by(User.exp.desc()).limit(15)
    )
    top_users = top_result.scalars().all()

    def format_name(user: User) -> str:
        first = user.first_name or ""
        last = user.last_name or ""
        full = (first + " " + last).strip()
        return full if full else "Без имени"

    leaderboard_lines = [
        f"{i + 1}. {format_name(user)} — {user.exp} XP"
        for i, user in enumerate(top_users)
    ]

    leaderboard_block = (
            "<blockquote>"
            "<b>🏆 Топ-15 пользователей:</b>\n"
            + "\n".join(leaderboard_lines) +
            "</blockquote>"
    )

    all_result = await session.execute(select(User).order_by(User.exp.desc()))
    all_users = all_result.scalars().all()
    user_place = next((i + 1 for i, u in enumerate(all_users) if u.telegram_id == user_id), None)
    user_place_block = (
        f"<blockquote>🔎 Твоё место в рейтинге: <b>#{user_place}</b></blockquote>"
        if user_place else
        "<blockquote>❓ Ты пока не в рейтинге</blockquote>"
    )

    return f"{leaderboard_block}\n{user_place_block}"


def get_main_menu_keyboard():
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Планы на день", callback_data="my_tasks")],
            [InlineKeyboardButton(
                text="🌟 Изучение языков",
                web_app=WebAppInfo(url=WEBAPP_URL)
            )]
        ]
    )


def get_user_stats_text(user: User) -> str:
    """Формирует текст со статистикой пользователя"""
    total_learned = len(user.eng_learned_words or [])
    streak = user.current_streak or 0
    exp = user.exp or 0

    # Проверяем, изучал ли пользователь что-то сегодня
    today_progress = ""
    if user.words_per_day and user.last_learning_date == get_user_local_date(user):
        if is_new_day(user):
            learned_today = 0
        else:
            # Здесь можно добавить более точный подсчет слов, изученных сегодня
            learned_today = min(user.words_per_day, total_learned)

        today_progress = f"\n📚 Сегодня изучено: {learned_today}/{user.words_per_day} слов"

    stats_text = (
        f"<b>📊 Ваша статистика:</b>\n"
        f"🔥 Дней подряд: {streak}\n"
        f"📖 Слов изучено: {total_learned}\n"
        f"⭐ Опыт: {exp} XP"
        f"{today_progress}"
    )

    return stats_text


@router.message(Command("start"))
async def cmd_start(message: Message, bot, state: FSMContext, session: AsyncSession):
    user_id = message.from_user.id

    try:
        member = await bot.get_chat_member(GROUP_ID, user_id)
        if member.status in [ChatMemberStatus.LEFT, ChatMemberStatus.KICKED]:
            raise Exception("Not in group")
    except Exception:
        await message.answer(
            "🚪 Чтобы пользоваться ботом, вступи в закрытую группу:",
            reply_markup=get_invite_keyboard()
        )
        return

    existing_user = await session.get(User, user_id)
    if existing_user:
        # Показываем статистику и главное меню
        stats_text = get_user_stats_text(existing_user)
        leaderboard_text = await get_leaderboard_text(session, user_id)

        full_text = f"{stats_text}\n\n{leaderboard_text}"

        await message.answer(
            full_text,
            parse_mode="HTML",
            reply_markup=get_main_menu_keyboard()
        )
        await state.clear()
        return

    await message.answer(
        "Прежде чем мы начнём, ответь на один вопрос:\n\n<b>Готов ли ты начать?</b>",
        parse_mode="HTML",
        reply_markup=get_start_keyboard()
    )


@router.callback_query(F.data == "ready_start")
async def user_ready(callback: CallbackQuery, state: FSMContext):
    await callback.message.edit_text(
        "🚪 Чтобы пользоваться ботом, вступи в закрытую группу:",
        reply_markup=get_invite_keyboard()
    )
    await callback.answer()


@router.callback_query(F.data == "not_ready")
async def user_not_ready(callback: CallbackQuery):
    await callback.message.edit_text("Хорошо! Возвращайся, когда будешь готов ✨")
    await callback.answer()


@router.callback_query(F.data == "check_subscription")
async def check_subscription(callback: CallbackQuery, bot, state: FSMContext):
    user_id = callback.from_user.id

    try:
        member = await bot.get_chat_member(GROUP_ID, user_id)
        if member.status in [ChatMemberStatus.LEFT, ChatMemberStatus.KICKED]:
            raise Exception("Not in group")
    except Exception:
        await callback.answer("❌ Ты всё ещё не в группе.", show_alert=True)
        return

    await callback.message.edit_text("Вижу ты наконец зашел...")
    await callback.message.answer(
        "🕒 Итак, первый шаг. Который у тебя сейчас час? Напиши в формате `чч:мм`, например `14:30`.",
        parse_mode="Markdown"
    )
    await callback.answer()
    await state.set_state(TimeZoneSetup.waiting_for_local_time)


@router.message(TimeZoneSetup.waiting_for_local_time)
async def handle_user_local_time(message: Message, state: FSMContext, session: AsyncSession):
    try:
        text = message.text.strip()
        dt = datetime.strptime(text, "%H:%M")

        now_utc = datetime.utcnow()
        user_time = timedelta(hours=dt.hour, minutes=dt.minute)
        utc_time = timedelta(hours=now_utc.hour, minutes=now_utc.minute)
        offset = user_time - utc_time

        offset_hours = int(offset.total_seconds() // 3600)
        offset_minutes = int((offset.total_seconds() % 3600) // 60)
        if offset_hours > 12:
            offset_hours -= 24
        elif offset_hours < -12:
            offset_hours += 24

        sign = "+" if offset_hours >= 0 else "-"
        tz_string = f"UTC{sign}{abs(offset_hours):02d}:{abs(offset_minutes):02d}"

        telegram_id = message.from_user.id
        username = message.from_user.username
        first_name = message.from_user.first_name or ""
        last_name = message.from_user.last_name or ""

        existing_user = await session.get(User, telegram_id)
        if not existing_user:
            user = User(
                telegram_id=telegram_id,
                username=username,
                first_name=first_name,
                last_name=last_name,
                time_line=tz_string,
                exp=0,
                awards="",
                words_per_day=None,
                eng_learned_words=[],
                eng_skipped_words=[],
                last_learning_date=None,
                current_streak=0
            )
            session.add(user)
        else:
            existing_user.time_line = tz_string

        await session.commit()
        await state.clear()

        await message.answer(
            f"✅ Регистрация завершена! Твой часовой пояс установлен как: `{tz_string}`.\n"
            "Теперь бот будет работать по твоему локальному времени 🕒\n\n"
            "🌟 Используй кнопку <b>Изучение языков</b> в меню, чтобы начать изучать новые слова!",
            parse_mode="HTML"
        )

        # Показываем главное меню
        user = existing_user if existing_user else await session.get(User, telegram_id)
        stats_text = get_user_stats_text(user)
        leaderboard_text = await get_leaderboard_text(session, telegram_id)

        full_text = f"{stats_text}\n\n{leaderboard_text}"

        await message.answer(
            full_text,
            parse_mode="HTML",
            reply_markup=get_main_menu_keyboard()
        )

    except ValueError:
        await message.answer(
            "Введи корректное время в формате, например 08:30.",
            parse_mode="Markdown"
        )


@router.message()
async def show_main_menu(message: Message, session: AsyncSession):
    user_id = message.from_user.id
    existing_user = await session.get(User, user_id)

    if not existing_user:
        await message.answer(
            "Прежде чем мы начнём, ответь на один вопрос:\n\n<b>Готов ли ты начать?</b>",
            parse_mode="HTML",
            reply_markup=get_start_keyboard()
        )
        return

    # Показываем статистику и главное меню
    stats_text = get_user_stats_text(existing_user)
    leaderboard_text = await get_leaderboard_text(session, user_id)

    full_text = f"{stats_text}\n\n{leaderboard_text}"

    await message.answer(
        full_text,
        parse_mode="HTML",
        reply_markup=get_main_menu_keyboard()
    )


COMMON_TASKS = [
    {"id": "wake_up", "text": "⏰ Подъём до 7:00"},
    {"id": "learn_words", "text": "📘 Учить 5 слов"},
    {"id": "workout", "text": "🏋️ Тренировка"},
]


@router.callback_query(F.data == "my_tasks")
async def show_common_tasks(callback: CallbackQuery):
    builder = InlineKeyboardBuilder()

    for task in COMMON_TASKS:
        builder.button(
            text=task["text"],
            callback_data=f"task_{task['id']}"
        )

    builder.button(text="+ Добавить задачу", callback_data="add_task")
    builder.adjust(1)  # каждая задача на отдельной строке

    await callback.message.edit_text(
        "<b>Задачи, которые ты должен выполнить за день:</b>",
        parse_mode="HTML",
        reply_markup=builder.as_markup()
    )
    await callback.answer()