import requests
from bs4 import BeautifulSoup
import json
import time

BASE = "https://musclewiki.com"
genders = ["Male", "Female"]
muscle_groups = ["Abs", "Biceps", "Chest", "Back", "Quads", "Hamstrings", "Shoulder", "Triceps", "Calves", "Forearms",
                 "Glutes", "Obliques"]  # можно расширить

exercises = []

for gender in genders:
    for mg in muscle_groups:
        url = f"{BASE}/Exercises/{gender}/{mg}/"
        resp = requests.get(url)
        soup = BeautifulSoup(resp.text, "html.parser")

        # собираем упражнения
        for a in soup.select("a[href*='/Exercises/']"):
            ex_url = BASE + a['href']
            ex_name = a.text.strip()
            # заходим в карточку упражнения
            er = requests.get(ex_url)
            es = BeautifulSoup(er.text, "html.parser")
            img = es.find("img", {"src": lambda x: x and x.endswith(".gif")})
            if not img:
                continue
            gif = img["src"]
            desc = es.find("div", class_="content").get_text(" ", strip=True)[:200]
            exercises.append({
                "name": ex_name,
                "gender": gender.lower(),
                "muscle_group": mg.lower(),
                "gif_url": gif,
                "description": desc,
                "url": ex_url
            })
            print("✅", ex_name)
            time.sleep(0.2)

print(f"Всего упражнений: {len(exercises)}")
with open("musclewiki_exercises.json", "w", encoding="utf-8") as f:
    json.dump(exercises, f, ensure_ascii=False, indent=2)
