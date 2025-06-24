from aiogram import Bot, Dispatcher
from config import BOT_TOKEN
import asyncio

from db import DbSessionMiddleware, AsyncSessionLocal

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
dp.message.middleware(DbSessionMiddleware(AsyncSessionLocal))
dp.callback_query.middleware(DbSessionMiddleware(AsyncSessionLocal))
from handlers import start
dp.include_router(start.router)

async def main():
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
