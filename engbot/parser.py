# import time
# import asyncio
# import aiohttp
# import base64
# from bs4 import BeautifulSoup
# from selenium import webdriver
# from selenium.webdriver.common.by import By
# from selenium.webdriver.chrome.options import Options
# from selenium.common.exceptions import TimeoutException, NoSuchElementException
# from selenium.webdriver.support.ui import WebDriverWait
# from selenium.webdriver.support import expected_conditions as EC
#
# from dotenv import load_dotenv
# import os
#
# from db import get_async_session
# from models.eng_words import Word
#
# from gtts import gTTS
# import tempfile
#
# # Загрузка .env
# load_dotenv()
#
# def get_page_source():
#     chrome_options = Options()
#     chrome_options.add_argument("--headless")
#     driver = webdriver.Chrome(options=chrome_options)
#     driver.get("https://kreekly.com/lists/10000-samyh-populyarnyh-angliyskih-slov/")
#
#     wait = WebDriverWait(driver, 10)
#
#     while True:
#         try:
#             button = wait.until(EC.element_to_be_clickable((By.CLASS_NAME, "load_more")))
#             driver.execute_script("arguments[0].click();", button)
#             time.sleep(1.5)
#         except (TimeoutException, NoSuchElementException):
#             break
#
#     time.sleep(2)
#     html = driver.page_source
#     driver.quit()
#     return html
#
#
# async def encode_base64(session: aiohttp.ClientSession, url: str) -> str | None:
#     try:
#         async with session.get(url) as response:
#             if response.status == 200:
#                 content = await response.read()
#                 return base64.b64encode(content).decode("utf-8")
#     except Exception as e:
#         print(f"⚠️ Не удалось скачать: {url}\nПричина: {e}")
#     return None
#
# def generate_gtts_audio(word: str) -> str | None:
#     try:
#         tts = gTTS(word, lang="en")
#         with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as fp:
#             tts.save(fp.name)
#             with open(fp.name, "rb") as f:
#                 return base64.b64encode(f.read()).decode("utf-8")
#     except Exception as e:
#         print(f"⚠️ Ошибка при генерации аудио для {word}: {e}")
#     return None
#
#
# async def parse_and_save():
#     html = get_page_source()
#     soup = BeautifulSoup(html, "html.parser")
#
#     count = 0
#     async with aiohttp.ClientSession() as http_session:
#         async with get_async_session() as db:
#             for item in soup.select("div.dict-word"):
#                 try:
#                     eng = item.select_one("span.eng").text.strip()
#                     rus = item.select_one("span.rus").text.strip()
#                     transcript = item.get("data-transcript", "").strip()
#                     image_name = item.get("data-image", "").strip()
#                     image_url = f"https://kreekly.com/img/words/{image_name}" if image_name else None
#                     image_b64 = await encode_base64(http_session, image_url) if image_url else None
#
#                     sound_b64 = generate_gtts_audio(eng)
#
#                     word = Word(
#                         eng=eng,
#                         rus=rus,
#                         transcript=transcript,
#                         image_data=image_b64,
#                         sound_data={"gtts": sound_b64} if sound_b64 else None
#                     )
#                     db.add(word)
#                     await db.commit()
#                     count += 1
#                     print(f"✅ {count}. {eng} — {rus} сохранено")
#                 except Exception as e:
#                     print(f"❌ Ошибка при обработке слова: {e}")
#                     continue
#
#     print(f"🎉 Всего сохранено: {count} слов в базу данных.")
#
#
# if __name__ == "__main__":
#     asyncio.run(parse_and_save())









# import time
# import asyncio
# import aiohttp
# import base64
# from bs4 import BeautifulSoup
# from selenium import webdriver
# from selenium.webdriver.common.by import By
# from selenium.webdriver.chrome.options import Options
# from selenium.common.exceptions import TimeoutException, NoSuchElementException
# from selenium.webdriver.support.ui import WebDriverWait
# from selenium.webdriver.support import expected_conditions as EC
#
# from dotenv import load_dotenv
# import os
#
# from db import get_async_session
# from models.eng_words import Word
#
# from sqlalchemy import select, desc, or_
#
# from gtts import gTTS
# import tempfile
#
# # Загрузка .env
# load_dotenv()
#
# def get_page_source():
#     chrome_options = Options()
#     chrome_options.add_argument("--headless")
#     driver = webdriver.Chrome(options=chrome_options)
#     driver.get("https://kreekly.com/lists/10000-samyh-populyarnyh-angliyskih-slov/")
#
#     wait = WebDriverWait(driver, 10)
#
#     while True:
#         try:
#             button = wait.until(EC.element_to_be_clickable((By.CLASS_NAME, "load_more")))
#             driver.execute_script("arguments[0].click();", button)
#             time.sleep(1.5)
#         except (TimeoutException, NoSuchElementException):
#             break
#
#     time.sleep(2)
#     html = driver.page_source
#     driver.quit()
#     return html
#
#
# async def encode_base64(session: aiohttp.ClientSession, url: str) -> str | None:
#     try:
#         async with session.get(url) as response:
#             if response.status == 200:
#                 content = await response.read()
#                 return base64.b64encode(content).decode("utf-8")
#     except Exception as e:
#         print(f"⚠️ Не удалось скачать: {url}\nПричина: {e}")
#     return None
#
# def generate_gtts_audio(word: str) -> str | None:
#     try:
#         tts = gTTS(word, lang="en")
#         with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as fp:
#             tts.save(fp.name)
#             with open(fp.name, "rb") as f:
#                 return base64.b64encode(f.read()).decode("utf-8")
#     except Exception as e:
#         print(f"⚠️ Ошибка при генерации аудио для {word}: {e}")
#     return None
#
#
# async def fill_missing_audio():
#     async with get_async_session() as db:
#         result = await db.execute(
#             select(Word).where(
#                 or_(
#                     Word.sound_data.is_(None),
#                     Word.sound_data["gtts"].astext.is_(None)
#                 )
#             )
#         )
#         words = result.scalars().all()
#
#         print(f"🔍 Найдено {len(words)} слов без озвучки")
#
#         for word in words:
#             try:
#                 sound_b64 = generate_gtts_audio(word.eng)
#                 if sound_b64:
#                     word.sound_data = {"gtts": sound_b64}
#                     await db.commit()
#                     print(f"🔊 Озвучка добавлена: {word.eng}")
#                     time.sleep(1.2)
#                 else:
#                     print(f"⚠️ Не удалось озвучить: {word.eng}")
#             except Exception as e:
#                 print(f"❌ Ошибка при озвучке {word.eng}: {e}")
#
#
# async def parse_and_save():
#     html = get_page_source()
#     soup = BeautifulSoup(html, "html.parser")
#
#     async with get_async_session() as db:
#         result = await db.execute(select(Word).order_by(desc(Word.id)).limit(1))
#         last_word = result.scalar()
#         last_eng = last_word.eng if last_word else None
#
#     start_parsing = not last_eng  # Если слов нет в базе, начинаем сразу
#     count = 0
#
#     async with aiohttp.ClientSession() as http_session:
#         async with get_async_session() as db:
#             for item in soup.select("div.dict-word"):
#                 try:
#                     eng = item.select_one("span.eng").text.strip()
#                     rus = item.select_one("span.rus").text.strip()
#
#                     if not start_parsing:
#                         if eng == last_eng:
#                             print(f"▶️ Продолжаем с: {eng}")
#                             start_parsing = True
#                         continue
#
#                     transcript = item.get("data-transcript", "").strip()
#                     image_name = item.get("data-image", "").strip()
#                     image_url = f"https://kreekly.com/img/words/{image_name}" if image_name else None
#                     image_b64 = await encode_base64(http_session, image_url) if image_url else None
#
#                     sound_b64 = generate_gtts_audio(eng)
#
#                     word = Word(
#                         eng=eng,
#                         rus=rus,
#                         transcript=transcript,
#                         image_data=image_b64,
#                         sound_data={"gtts": sound_b64} if sound_b64 else None
#                     )
#                     db.add(word)
#                     await db.commit()
#                     count += 1
#                     print(f"✅ {count}. {eng} — {rus} сохранено")
#                 except Exception as e:
#                     print(f"❌ Ошибка при обработке слова: {e}")
#                     continue
#
#     print(f"🎉 Всего сохранено: {count} слов в базу данных.")
#
#
# if __name__ == "__main__":
#     asyncio.run(fill_missing_audio())
#     asyncio.run(parse_and_save())


import time
import asyncio
import aiohttp
import base64
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from dotenv import load_dotenv
import os

from db import get_async_session
from models.eng_words import Word

from sqlalchemy import select, desc, or_, cast, String

from gtts import gTTS
import tempfile

# Загрузка .env
load_dotenv()


def get_page_source():
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    driver = webdriver.Chrome(options=chrome_options)
    driver.get("https://kreekly.com/lists/10000-samyh-populyarnyh-angliyskih-slov/")

    wait = WebDriverWait(driver, 10)

    while True:
        try:
            button = wait.until(EC.element_to_be_clickable((By.CLASS_NAME, "load_more")))
            driver.execute_script("arguments[0].click();", button)
            time.sleep(1.5)
        except (TimeoutException, NoSuchElementException):
            break

    time.sleep(2)
    html = driver.page_source
    driver.quit()
    return html


async def encode_base64(session: aiohttp.ClientSession, url: str) -> str | None:
    try:
        async with session.get(url) as response:
            if response.status == 200:
                content = await response.read()
                return base64.b64encode(content).decode("utf-8")
    except Exception as e:
        print(f"⚠️ Не удалось скачать: {url}\nПричина: {e}")
    return None


def generate_gtts_audio(word: str) -> str | None:
    try:
        tts = gTTS(word, lang="en")
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as fp:
            tts.save(fp.name)
            with open(fp.name, "rb") as f:
                return base64.b64encode(f.read()).decode("utf-8")
    except Exception as e:
        print(f"⚠️ Ошибка при генерации аудио для {word}: {e}")
    return None


async def fill_missing_audio():
    async with get_async_session() as db:
        result = await db.execute(
            select(Word).where(
                or_(
                    Word.sound_data.is_(None),
                    cast(Word.sound_data["gtts"], String).is_(None)
                )
            )
        )
        words = result.scalars().all()

        print(f"🔍 Найдено {len(words)} слов без озвучки")

        for word in words:
            try:
                sound_b64 = generate_gtts_audio(word.eng)
                if sound_b64:
                    word.sound_data = {"gtts": sound_b64}
                    await db.commit()
                    print(f"🔊 Озвучка добавлена: {word.eng}")
                else:
                    print(f"⚠️ Не удалось озвучить: {word.eng}")
                await asyncio.sleep(1.5)
            except Exception as e:
                print(f"❌ Ошибка при озвучке {word.eng}: {e}")


async def parse_and_save():
    html = get_page_source()
    soup = BeautifulSoup(html, "html.parser")

    async with get_async_session() as db:
        result = await db.execute(select(Word).order_by(desc(Word.id)).limit(1))
        last_word = result.scalar()
        last_eng = last_word.eng if last_word else None

    start_parsing = not last_eng
    count = 0

    async with aiohttp.ClientSession() as http_session:
        async with get_async_session() as db:
            for item in soup.select("div.dict-word"):
                try:
                    eng = item.select_one("span.eng").text.strip()
                    rus = item.select_one("span.rus").text.strip()

                    if not start_parsing:
                        if eng == last_eng:
                            print(f"▶️ Продолжаем с: {eng}")
                            start_parsing = True
                        continue

                    transcript = item.get("data-transcript", "").strip()
                    image_name = item.get("data-image", "").strip()
                    image_url = f"https://kreekly.com/img/words/{image_name}" if image_name else None
                    image_b64 = await encode_base64(http_session, image_url) if image_url else None

                    sound_b64 = generate_gtts_audio(eng)

                    word = Word(
                        eng=eng,
                        rus=rus,
                        transcript=transcript,
                        image_data=image_b64,
                        sound_data={"gtts": sound_b64} if sound_b64 else None
                    )
                    db.add(word)
                    await db.commit()
                    count += 1
                    print(f"✅ {count}. {eng} — {rus} сохранено")
                    await asyncio.sleep(1.5)
                except Exception as e:
                    print(f"❌ Ошибка при обработке слова: {e}")
                    continue

    print(f"🎉 Всего сохранено: {count} слов в базу данных.")


async def main():
    await fill_missing_audio()
    await parse_and_save()


if __name__ == "__main__":
    asyncio.run(main())
