#!/usr/bin/env python3
"""
Скрипт для запуска сервера разработки
"""
import uvicorn
import os
from pathlib import Path


def main():
    print("🚀 Запуск сервера для изучения языков...")

    # Проверяем наличие папки static
    static_dir = Path("static")
    if not static_dir.exists():
        print("📁 Создаем папку static...")
        static_dir.mkdir(exist_ok=True)
        print("⚠️  Поместите файлы index.html, styles.css, script.js в папку static/")

    # Проверяем файл .env
    if not Path(".env").exists():
        print("⚠️  Файл .env не найден!")
        print("📝 Создайте файл .env с содержимым:")
        print("DATABASE_URL=postgresql+asyncpg://username:password@localhost/database_name")
        return

    print("📱 Telegram Web App будет доступен по адресу: http://localhost:8000/static/")
    print("🔧 API документация: http://localhost:8000/docs")
    print("⏹️  Для остановки нажмите Ctrl+C")
    print()

    try:
        uvicorn.run(
            "ma:app",
            host="0.0.0.0",
            port=8000,
            reload=True,  # Автоперезагрузка при изменении кода
            log_level="info"
        )
    except KeyboardInterrupt:
        print("\n👋 Сервер остановлен")
    except Exception as e:
        print(f"❌ Ошибка запуска сервера: {e}")


if __name__ == "__main__":
    main()