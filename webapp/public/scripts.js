Telegram.WebApp.ready();
Telegram.WebApp.expand();

fetch(`/api/user?initData=${Telegram.WebApp.initData}`)
    .then(res => res.json())
    .then(data => {
        if (data.username) {
            document.getElementById("username").innerText = data.username;
        } else {
            document.getElementById("username").innerText = "Ошибка";
        }
    });
