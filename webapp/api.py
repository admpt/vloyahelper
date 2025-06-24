from fastapi import APIRouter, Request
from models import User  # путь поправь под свой проект
from db import get_async_session
from sqlalchemy import select
from aiogram.utils.web_app import check_webapp_signature
import os

router = APIRouter(prefix="/api")

BOT_TOKEN = os.getenv("BOT_TOKEN")

@router.get("/user")
async def get_user(request: Request):
    init_data = request.query_params.get("initData")
    if not init_data:
        return {"error": "Missing initData"}

    try:
        init_data_dict = check_webapp_signature(BOT_TOKEN, init_data)
        telegram_id = int(init_data_dict["user"]["id"])
    except Exception as e:
        return {"error": f"Invalid initData: {e}"}

    async with get_async_session() as session:
        result = await session.execute(select(User).where(User.telegram_id == telegram_id))
        user = result.scalar()

    if not user:
        return {"error": "User not found"}

    return {"username": user.username or user.first_name}
