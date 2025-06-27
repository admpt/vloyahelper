// API базовый URL
const API_BASE = window.location.origin + '/api';

// Глобальные переменные
let userData = null;
let telegramUser = null;
let selectedWordsPerDay = null;

// Состояние изучения
let currentLearningSession = {
    allWords: [],
    currentBatch: [],
    batchIndex: 0,
    currentIndex: 0,
    phase: 'learning',
    isTranslationShown: false,
    learnedCount: 0,
    batchSize: 5,
    wrongAnswers: [],
    isReviewMode: false
};

// Инициализация Telegram Web App
function initTelegramWebApp() {
    console.log('🚀 Инициализация приложения...');

    if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();

        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            telegramUser = tg.initDataUnsafe.user;
            console.log('✅ Пользователь Telegram:', telegramUser);
        } else {
            telegramUser = {
                id: 123456789,
                first_name: 'Test',
                last_name: 'User',
                username: 'testuser'
            };
            console.log('⚠️ Используем тестовые данные');
        }

        if (tg.colorScheme === 'dark') {
            document.body.classList.add('dark-theme');
        }

        loadUserData();
    } else {
        console.log('⚠️ Telegram WebApp недоступен, используем тестовые данные');
        telegramUser = {
            id: 123456789,
            first_name: 'Test',
            last_name: 'User',
            username: 'testuser'
        };
        loadUserData();
    }
}

// API функции
async function apiRequest(endpoint, method = 'GET', data = null) {
    const url = `${API_BASE}${endpoint}`;
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        }
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    try {
        console.log(`🌐 API запрос: ${method} ${url}`);
        const response = await fetch(url, options);

        if (!response.ok) {
            console.error(`❌ HTTP ${response.status}: ${response.statusText}`);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('✅ API ответ получен:', result);
        return result;
    } catch (error) {
        console.error('❌ API request failed:', error);
        throw error;
    }
}

// Загрузка данных пользователя
async function loadUserData() {
    console.log('📥 Загружаем данные пользователя из БД...');

    try {
        userData = await apiRequest(`/users/${telegramUser.id}`);
        if (userData) {
            console.log('✅ Данные пользователя загружены из БД:', userData);
            updateUI();
            checkDayStatus();
        } else {
            throw new Error('Пользователь не найден');
        }
    } catch (error) {
        console.error('❌ Пользователь не найден в БД, создаем:', error);

        // Fallback - создаем пользователя если его нет
        try {
            userData = await apiRequest('/users', 'POST', {
                telegram_id: telegramUser.id,
                username: telegramUser.username || null,
                first_name: telegramUser.first_name || 'User',
                last_name: telegramUser.last_name || null
            });
            console.log('✅ Пользователь создан в БД:', userData);
            updateUI();
            checkDayStatus();
        } catch (createError) {
            console.error('❌ Критическая ошибка - не удалось создать пользователя:', createError);

            // Показываем ошибку но позволяем пользоваться приложением
            const progressMessage = document.getElementById('progress-message');
            if (progressMessage) {
                progressMessage.innerHTML = '⚠️ Ошибка загрузки. Попробуйте перезапустить приложение';
                progressMessage.style.color = '#FF9500';
            }

            // Создаем минимальные данные для работы
            userData = {
                telegram_id: telegramUser.id,
                first_name: telegramUser.first_name || 'User',
                exp: 0,
                words_per_day: null,
                eng_learned_words: [],
                eng_skipped_words: [],
                current_streak: 0,
                last_learning_date: null
            };
            updateUI();
            checkDayStatus();
        }
    }
}

// Сохранение данных пользователя
async function saveUserData() {
    if (!userData || !telegramUser) return;

    try {
        await apiRequest(`/users/${telegramUser.id}`, 'PUT', userData);
        console.log('✅ Данные пользователя сохранены в БД');
    } catch (error) {
        console.error('❌ Ошибка сохранения в БД:', error);
    }
}

// Получение случайных слов для изучения
async function getRandomWords(count, excludeIds = []) {
    try {
        console.log(`📚 Получаем ${count} случайных слов из БД, исключая:`, excludeIds);
        const excludeQuery = excludeIds.length > 0 ? `?exclude=${excludeIds.join(',')}` : '';
        const words = await apiRequest(`/words/random/${count}${excludeQuery}`);
        console.log('✅ Слова получены из БД:', words);
        return words || [];
    } catch (error) {
        console.error('❌ Ошибка получения слов из БД:', error);
        return [];
    }
}

// Получение слов по ID
async function getWordsByIds(ids) {
    try {
        console.log('📚 Получаем слова по ID из БД:', ids);
        const words = await apiRequest(`/words/by-ids`, 'POST', { ids });
        console.log('✅ Слова по ID получены из БД:', words);
        return words || [];
    } catch (error) {
        console.error('❌ Ошибка получения слов по ID из БД:', error);
        return [];
    }
}

// Проверка статуса дня
function checkDayStatus() {
    if (!userData) return;

    const today = new Date().toISOString().split('T')[0];
    const lastLearningDate = userData.last_learning_date;

    // Если начался новый день, обновляем streak
    if (lastLearningDate !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (lastLearningDate === yesterdayStr) {
            // Продолжаем streak
        } else if (lastLearningDate) {
            // Streak прерван, но не сбрасываем здесь - это делает сервер
        }
    }

    updateTodayProgress();
}

// НОВАЯ функция обновления прогресса сегодня
function updateTodayProgress() {
    if (!userData) return;

    const today = new Date().toISOString().split('T')[0];
    const learnedToday = userData.last_learning_date === today ? (userData.eng_learned_words?.length || 0) : 0;
    const targetCount = userData.words_per_day || 5; // По умолчанию 5 слов

    // Предполагаем, что тренировки = 20% от изученных слов (или фиксированное число)
    const trainingTarget = Math.max(1, Math.floor(targetCount * 0.4)); // 40% от слов идет на тренировки
    const wordsTarget = targetCount - trainingTarget; // Остальное на изучение

    // Сегодняшние тренировки (пока захардкодим, потом можно добавить в userData)
    const trainingsToday = 0; // TODO: добавить трекинг тренировок

    const progressNumber = document.getElementById('progress-number');
    const progressTotal = document.getElementById('progress-total');
    const progressMessage = document.getElementById('progress-message');
    const progressBar = document.getElementById('progress-bar');
    const reviewBtn = document.getElementById('review-btn');

    // Общий прогресс (слова + тренировки)
    const totalCompleted = learnedToday + trainingsToday;
    const totalTarget = wordsTarget + trainingTarget;

    if (progressNumber) progressNumber.textContent = totalCompleted;
    if (progressTotal) progressTotal.textContent = `из ${totalTarget}`;

    // Рассчитываем процент выполнения для двух сегментов
    const wordsPercentage = totalTarget > 0 ? (learnedToday / totalTarget) * 100 : 0;
    const trainingsPercentage = totalTarget > 0 ? (trainingsToday / totalTarget) * 100 : 0;
    const totalPercentage = wordsPercentage + trainingsPercentage;

    const circumference = 2 * Math.PI * 60; // радиус 60
    const offset = circumference - (totalPercentage / 100) * circumference;

    // Обновляем круговой прогресс
    if (progressBar) {
        progressBar.style.strokeDashoffset = offset;

        // Создаем градиент для двух сегментов
        const gradientDefs = progressBar.parentElement.querySelector('defs');
        if (gradientDefs) {
            // Обновляем градиент в зависимости от выполнения
            const gradient = gradientDefs.querySelector('#progressGradient');
            if (gradient) {
                if (learnedToday >= wordsTarget && trainingsToday >= trainingTarget) {
                    // Все выполнено - зеленый
                    gradient.innerHTML = `
                        <stop offset="0%" style="stop-color:#34C759"/>
                        <stop offset="100%" style="stop-color:#30D158"/>
                    `;
                } else if (learnedToday >= wordsTarget) {
                    // Слова выполнены, тренировки нет - оранжевый/зеленый
                    gradient.innerHTML = `
                        <stop offset="0%" style="stop-color:#34C759"/>
                        <stop offset="50%" style="stop-color:#FF9500"/>
                        <stop offset="100%" style="stop-color:#FF9500"/>
                    `;
                } else {
                    // В процессе - синий/фиолетовый
                    gradient.innerHTML = `
                        <stop offset="0%" style="stop-color:#007AFF"/>
                        <stop offset="100%" style="stop-color:#5856D6"/>
                    `;
                }
            }
        }
    }

    // Обновляем сообщение и кнопки
    if (progressMessage) {
        if (targetCount === 0) {
            progressMessage.innerHTML = 'Сначала выберите количество заданий в день';
            progressMessage.style.color = '#666';
            if (reviewBtn) reviewBtn.style.display = 'none';
        } else if (learnedToday >= wordsTarget && trainingsToday >= trainingTarget) {
            if (reviewBtn) reviewBtn.style.display = 'flex';
            progressMessage.style.color = '#34C759';
            progressMessage.innerHTML = '🎉 Превосходно! Все задания на сегодня выполнены!<br>Можете повторить изученное';
        } else if (learnedToday >= wordsTarget) {
            if (reviewBtn) reviewBtn.style.display = 'flex';
            progressMessage.style.color = '#FF9500';
            progressMessage.innerHTML = `✅ Слова изучены (${learnedToday}/${wordsTarget})!<br>⏳ Осталось тренировок: ${trainingTarget - trainingsToday}`;
        } else {
            if (reviewBtn) reviewBtn.style.display = learnedToday > 0 ? 'flex' : 'none';
            progressMessage.style.color = '#666';

            const remainingWords = wordsTarget - learnedToday;
            const remainingTrainings = trainingTarget - trainingsToday;

            if (remainingWords === 1 && remainingTrainings === 0) {
                progressMessage.innerHTML = `Осталось изучить всего 1 слово!`;
            } else if (remainingWords === 0 && remainingTrainings === 1) {
                progressMessage.innerHTML = `Осталось выполнить 1 тренировку!`;
            } else {
                progressMessage.innerHTML = `📚 Слова: ${learnedToday}/${wordsTarget} • 🏋️ Тренировки: ${trainingsToday}/${trainingTarget}`;
            }
        }
    }
}

// НОВАЯ функция обновления сегодняшней даты
function updateTodayDate() {
    const todayDateEl = document.getElementById('today-date');
    if (todayDateEl) {
        const today = new Date();
        const options = { day: 'numeric', month: 'long' };
        const dateString = today.toLocaleDateString('ru-RU', options);
        todayDateEl.textContent = dateString;
    }
}

// СТАРАЯ функция (оставляем для совместимости)
function updateTodayStatus() {
    updateTodayProgress();
}

// ОБНОВЛЕННАЯ функция showScreen для новых экранов
function showScreen(screenName) {
    console.log('📱 Переход на экран:', screenName);

    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    const targetScreen = document.getElementById(screenName + '-screen');
    if (targetScreen) {
        targetScreen.classList.add('active');
        targetScreen.classList.add('fade-in');
    }

    document.querySelectorAll('.footer-item').forEach(item => {
        item.classList.remove('active');
    });

    if (screenName === 'home') {
        const homeItem = document.querySelectorAll('.footer-item')[1];
        if (homeItem) homeItem.classList.add('active');
    } else if (screenName === 'learning') {
        const learningItem = document.querySelectorAll('.footer-item')[0];
        if (learningItem) learningItem.classList.add('active');
    } else if (screenName === 'settings') {
        const settingsItem = document.querySelectorAll('.footer-item')[2];
        if (settingsItem) settingsItem.classList.add('active');

        // Показываем текущие настройки
        if (userData && userData.words_per_day) {
            selectWordsPerDay(userData.words_per_day);
        }
    } else if (screenName === 'statistics') {
        // Обновляем статистику при открытии экрана
        updateUI();
    }
}

// Настройки
function selectWordsPerDay(count) {
    selectedWordsPerDay = count;

    document.querySelectorAll('.option-card').forEach(btn => {
        btn.classList.remove('selected');
    });

    const selectedCard = document.querySelector(`[data-value="${count}"]`);
    if (selectedCard) selectedCard.classList.add('selected');

    const saveBtn = document.getElementById('save-settings');
    if (saveBtn) saveBtn.disabled = false;
}

async function saveSettings() {
    if (!selectedWordsPerDay || !userData) return;

    console.log('💾 Сохраняем настройки в БД...');

    const saveBtn = document.getElementById('save-settings');
    if (saveBtn) {
        saveBtn.textContent = 'Сохранение...';
        saveBtn.disabled = true;
    }

    try {
        userData.words_per_day = selectedWordsPerDay;
        await saveUserData();
        updateUI();
        updateTodayProgress();

        if (saveBtn) {
            saveBtn.textContent = 'Сохранено ✓';
        }

        setTimeout(() => {
            startLearning();
        }, 1000);

    } catch (error) {
        console.error('❌ Ошибка сохранения настроек:', error);
        if (saveBtn) {
            saveBtn.textContent = 'Ошибка';
            saveBtn.disabled = false;
        }
    }
}

// Изучение новых слов
async function startLearning() {
    console.log('📚 Начинаем изучение новых слов...');

    if (!userData || !userData.words_per_day) {
        showScreen('settings');
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    const learnedToday = userData.last_learning_date === today ? (userData.eng_learned_words?.length || 0) : 0;
    const remainingToLearn = userData.words_per_day - learnedToday;

    if (remainingToLearn <= 0) {
        alert('Все слова на сегодня уже изучены! Попробуйте повторение.');
        return;
    }

    // Получаем новые слова (исключая уже изученные)
    const excludeIds = (userData.eng_learned_words || []).concat(userData.eng_skipped_words || []);
    const newWords = await getRandomWords(remainingToLearn, excludeIds);

    if (newWords.length === 0) {
        alert('Нет доступных слов для изучения!');
        return;
    }

    currentLearningSession.allWords = newWords;
    currentLearningSession.isReviewMode = false;

    startLearningSession();
}

// Повторение изученных слов
async function startReview() {
    console.log('🔄 Начинаем повторение изученных слов...');

    if (!userData || !userData.eng_learned_words || userData.eng_learned_words.length === 0) {
        alert('Нет изученных слов для повторения!');
        return;
    }

    // Берем последние изученные слова для повторения
    const lastWords = userData.eng_learned_words.slice(-10); // последние 10 слов
    const learnedWords = await getWordsByIds(lastWords);

    if (learnedWords.length === 0) {
        alert('Не удалось загрузить слова для повторения!');
        return;
    }

    currentLearningSession.allWords = learnedWords;
    currentLearningSession.isReviewMode = true;

    startLearningSession();
}

// Общая функция запуска сессии обучения
function startLearningSession() {
    currentLearningSession.batchIndex = 0;
    currentLearningSession.currentIndex = 0;
    currentLearningSession.phase = 'learning';
    currentLearningSession.isTranslationShown = false;
    currentLearningSession.learnedCount = 0;
    currentLearningSession.wrongAnswers = [];

    loadCurrentBatch();
    showScreen('learning');
    displayCurrentWord();
}

function loadCurrentBatch() {
    const startIndex = currentLearningSession.batchIndex * currentLearningSession.batchSize;
    const endIndex = Math.min(startIndex + currentLearningSession.batchSize, currentLearningSession.allWords.length);
    currentLearningSession.currentBatch = currentLearningSession.allWords.slice(startIndex, endIndex);
    currentLearningSession.currentIndex = 0;
}

// ОБНОВЛЕННАЯ функция displayCurrentWord
function displayCurrentWord() {
    const word = currentLearningSession.currentBatch[currentLearningSession.currentIndex];
    if (!word) {
        console.log('No word found');
        return;
    }

    console.log('📖 Показываем слово из БД:', word);

    // Получаем элемент для картинки/эмодзи
    const imageEl = document.getElementById('word-image');

    if (imageEl) {
        // Проверяем, есть ли image_data и что это не заблокированная картинка
        const blockedImageData = "iVBORw0KGgoAAAANSUhEUgAAAH8AAAB/CAIAAABJ34pEAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyJpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMC1jMDYxIDY0LjE0MDk0OSwgMjAxMC8xMi8wNy0xMDo1NzowMSAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNS4xIFdpbmRvd3MiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6NEJFNkNFQUExNUYxMTFFQTlGOEI4RTJGRUNBQTUwOTEiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6NEJFNkNFQUIxNUYxMTFFQTlGOEI4RTJGRUNBQTUwOTEiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDo0QkU2Q0VBODE1RjExMUVBOUY4QjhFMkZFQ0FBNTA5MSIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDo0QkU2Q0VBOTE1RjExMUVBOUY4QjhFMkZFQ0FBNTA5MSIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/Pm22FE0AABq1SURBVHja7J2HduNKjoYZJFE5B4fuuTPz/k+0e3b23HvbbmXJClQm9wNKouXQQU7t9rK6nRQo1l8o4AcKhbLDMLTi9ouaHaMfox+jH7cY/Rj9uMXox+jHLUY/Rj9uMfox+nGL0Y/Rj1uMfox+3GL0Y/TjFqMfox+33x793W632Wy3uy1f0ra7IAj44rZDvluW3r/tOrbruo7rOI78TNBcl2/JZNK2Y/Sf1NabzWKxnM3mq9VquVit1ht+YSQ2m81uFzAWOgqBbdmJZCKVSiX5nkzySzrteV4qm83msplMJm2/1xF4X+gj4MC9BGf9pz83/ET81zIFttuNCD9TANwDMwOM7B/k3U3sRT6ZSKQ8GREGgiHx5AfjIcMSo/9IQ6Kn09l4PLmZ8HPu+wsekVu8K7jfv9+7L7YZIQaDMSgU8vlctlop80sul30ns+HXo79colt81Iu/WIA4km+kH+jBjjt0HFvA0n8GNfvhmOwNwNH3UL4zQ3gLU8KTlkQP8SOv+qhQyDEMPPX/EX0+F8UNysPReDgcD4ajw7f9WW+2u+Vqbhj9GAI+vz5EvNRJjOLpeDoeDwajkb/wt1sPpwAQ8tufJ1/qPjIZr1gs1Br1UjHfqNcw0B8cfWWJAdRxPL7p9Qbd7gD019st1tKx7e/L+34sDmOyh1X0S/SK/V/aox90y8w8Xs08qJRLrVajXqvCjhwhrfbHRB+RH41uRqPxYDhGuS+wq9stNwBLN+jvJT209nxeiM1O6byTTEElk17KY6RgNOhrXqCewA7MHVuuwRvWsNK1NJ4RMiqP69dhOkUzCa+BN6pJSIE7VrlWq9SqFYzBR0PfqHi0TbvT6/UHk8nMdZ0DKEc0xvymjzrOflAACNUMZYTFZ9JpKGXKE0LJCIE1JJRBctXJ4lOWqzVmHNpqGKrxycw4milxb4YZbcYQ4jFUq5WLs2alWoYVoZ3ewBIk3maQgbvb7Y0nU+gkw2CUu3WsM0Q1izbge8JxUQi5bBZ2mM1mspm00PdkQiF2jSzzHSRVjweH8bKNPtnqF9AzvWBPk+nMny9QcYyGubgY9sOoG8vBI7wX4eBqvB4thE1+A8/g1dFHPGHviHy73YXDA4qrPlH0Ao0XCHxJVQLAjJhDCuHnpRIWMZtOp5+s6KCw4j1Mse1T4bGrtfrIxkm2IiKLpPPnuje3Ww003UMQ6NRQ9e9KSV9Xc3DxQH96rqNQC38Jd1G1d+gd2Jp4DZINwoXA1gul/CHGABMsXqsoqGe4zxv8I83O1xm0Mfa482Ndf4x2XCKHeeWWR3kwELF4RE0Mfa882Nfw=";

        if (word.image_data && word.image_data !== blockedImageData && !word.image_data.startsWith(blockedImageData.substring(0, 100))) {
            // Если это картинка (base64) и не заблокированная
            imageEl.innerHTML = `<img src="data:image/png;base64,${word.image_data}" alt="Word Image" style="max-width: 100%; max-height: 120px; border-radius: 10px;">`;
            console.log('🖼️ Показываем картинку из БД для слова:', word.eng);
        } else if (word.image_data && typeof word.image_data === 'string' && word.image_data.length <= 10 && !/^[A-Za-z0-9+/]/.test(word.image_data)) {
            // Если это эмодзи (короткая строка, не base64)
            imageEl.innerHTML = word.image_data;
            console.log('😊 Показываем эмодзи из БД для слова:', word.eng);
        } else {
            // Показываем дефолтную картинку
            imageEl.innerHTML = `<img src="/static/gb.png" alt="British Flag" style="max-width: 100%; max-height: 120px; border-radius: 10px;">`;
            console.log('🇬🇧 Показываем дефолтный флаг для слова:', word.eng);
        }

        // Добавляем анимацию появления
        imageEl.style.opacity = '0';
        imageEl.style.transform = 'scale(0.8)';

        // Плавно показываем с анимацией
        setTimeout(() => {
            imageEl.style.opacity = '1';
            imageEl.style.transform = 'scale(1)';
        }, 100);
    }

    // Обновляем остальные элементы
    document.getElementById('word-english').textContent = word.eng;
    document.getElementById('word-transcript').textContent = word.transcript || '';
    document.getElementById('word-russian').textContent = word.rus;

    updateProgressAndPhase();
    setupPhaseInterface();
}

function updateProgressAndPhase() {
    if (!currentLearningSession.currentBatch || currentLearningSession.currentBatch.length === 0) {
        return;
    }

    const totalBatches = Math.ceil(currentLearningSession.allWords.length / currentLearningSession.batchSize);
    const currentBatchNum = currentLearningSession.batchIndex + 1;

    let phaseText = '';
    let phaseColor = '';
    let progressPercent = 0;

    const batchProgress = (currentLearningSession.batchIndex * 4);
    const currentPhaseProgress = (currentLearningSession.currentIndex + 1) / currentLearningSession.currentBatch.length;

    // Добавляем префикс для режима повторения
    const modePrefix = currentLearningSession.isReviewMode ? '🔄 Повторение: ' : '';

    switch(currentLearningSession.phase) {
        case 'learning':
            phaseText = `${modePrefix}📚 Запоминаем слова ${currentBatchNum}/${totalBatches}`;
            phaseColor = currentLearningSession.isReviewMode ?
                'linear-gradient(135deg, #FF9500 0%, #FF6B35 100%)' :
                'linear-gradient(135deg, #A8E6CF 0%, #7FCDCD 100%)';
            progressPercent = (batchProgress + currentPhaseProgress) / (totalBatches * 4) * 100;
            break;
        case 'quiz_rus_to_eng':
            phaseText = `${modePrefix}🧩 Викторина: Русский → Английский`;
            phaseColor = 'linear-gradient(135deg, #FFB6C1 0%, #FFA07A 100%)';
            progressPercent = (batchProgress + 1 + currentPhaseProgress) / (totalBatches * 4) * 100;
            break;
        case 'quiz_eng_to_rus':
            phaseText = `${modePrefix}🧩 Викторина: Английский → Русский`;
            phaseColor = 'linear-gradient(135deg, #87CEEB 0%, #98FB98 100%)';
            progressPercent = (batchProgress + 2 + currentPhaseProgress) / (totalBatches * 4) * 100;
            break;
        case 'text_input':
            phaseText = `${modePrefix}✍️ Письменный тест`;
            phaseColor = 'linear-gradient(135deg, #DDA0DD 0%, #F0E68C 100%)';
            progressPercent = (batchProgress + 3 + currentPhaseProgress) / (totalBatches * 4) * 100;
            break;
    }

    const progressEl = document.getElementById('word-progress');
    const phaseEl = document.getElementById('learning-phase');
    const progressFillEl = document.getElementById('learning-progress-fill');

    if (progressEl) progressEl.textContent = `${currentLearningSession.currentIndex + 1} / ${currentLearningSession.currentBatch.length}`;
    if (phaseEl) {
        phaseEl.textContent = phaseText;
        phaseEl.style.background = phaseColor;
    }
    if (progressFillEl) progressFillEl.style.width = progressPercent + '%';
}

function setupPhaseInterface() {
    const memoryAction = document.getElementById('memory-action');
    const quizOptions = document.getElementById('quiz-options');
    const textInputSection = document.getElementById('text-input-section');
    const wordEnglish = document.getElementById('word-english');
    const wordRussian = document.getElementById('word-russian');
    const wordTranscript = document.getElementById('word-transcript');

    // Скрываем все элементы
    if (memoryAction) memoryAction.style.display = 'none';
    if (quizOptions) quizOptions.style.display = 'none';
    if (textInputSection) textInputSection.style.display = 'none';

    // Сбрасываем состояние кнопок викторины
    resetQuiz();

    switch(currentLearningSession.phase) {
        case 'learning':
            if (wordEnglish) wordEnglish.style.display = 'block';
            if (wordRussian) {
                wordRussian.style.display = 'block';
                wordRussian.classList.add('revealed');
            }
            if (wordTranscript) wordTranscript.style.display = 'block';
            if (memoryAction) memoryAction.style.display = 'block';
            break;

        case 'quiz_rus_to_eng':
            if (wordEnglish) wordEnglish.style.display = 'none';
            if (wordRussian) {
                wordRussian.style.display = 'block';
                wordRussian.classList.add('revealed');
            }
            if (wordTranscript) wordTranscript.style.display = 'none';
            if (quizOptions) {
                quizOptions.style.display = 'block';
                setupQuiz('rus_to_eng');
            }
            break;

        case 'quiz_eng_to_rus':
            if (wordEnglish) wordEnglish.style.display = 'block';
            if (wordRussian) wordRussian.style.display = 'none';
            if (wordTranscript) wordTranscript.style.display = 'block';
            if (quizOptions) {
                quizOptions.style.display = 'block';
                setupQuiz('eng_to_rus');
            }
            break;

        case 'text_input':
            if (wordEnglish) wordEnglish.style.display = 'none';
            if (wordRussian) wordRussian.style.display = 'none';
            if (wordTranscript) wordTranscript.style.display = 'none';
            if (textInputSection) {
                textInputSection.style.display = 'block';
                setupTextInput();
            }
            break;
    }
}

function setupQuiz(direction) {
    const currentWord = currentLearningSession.currentBatch[currentLearningSession.currentIndex];
    const questionEl = document.getElementById('quiz-question');

    let correctAnswer, wrongAnswers, question;

    if (direction === 'rus_to_eng') {
        correctAnswer = currentWord.eng;
        wrongAnswers = getRandomWordsFromBatch(currentLearningSession.currentBatch, currentWord.id, 3, 'eng');
        question = 'Как это слово на английском?';
    } else {
        correctAnswer = currentWord.rus;
        wrongAnswers = getRandomWordsFromBatch(currentLearningSession.currentBatch, currentWord.id, 3, 'rus');
        question = 'Как это слово на русском?';
    }

    if (questionEl) questionEl.textContent = question;

    const allOptions = [correctAnswer, ...wrongAnswers];
    const shuffledOptions = shuffleArray(allOptions);
    const correctIndex = shuffledOptions.indexOf(correctAnswer);

    for (let i = 0; i < 4; i++) {
        const optionBtn = document.getElementById(`option-${i}`);
        if (optionBtn) {
            optionBtn.textContent = shuffledOptions[i];
            optionBtn.className = 'option-btn';
            optionBtn.dataset.correct = (i === correctIndex) ? 'true' : 'false';
        }
    }
}

function getRandomWordsFromBatch(batch, excludeId, count, field) {
    const otherWords = batch.filter(word => word.id !== excludeId);
    if (otherWords.length < count) {
        // Если недостаточно слов в батче, добавляем случайные варианты
        const fallbackWords = ['cat', 'dog', 'house', 'car', 'book', 'water', 'sun', 'tree'];
        const fallbackRus = ['кот', 'собака', 'дом', 'машина', 'книга', 'вода', 'солнце', 'дерево'];
        const fallback = field === 'eng' ? fallbackWords : fallbackRus;
        const shuffled = shuffleArray([...otherWords.map(w => w[field]), ...fallback]);
        return shuffled.slice(0, count);
    }
    const shuffled = shuffleArray([...otherWords]);
    return shuffled.slice(0, count).map(word => word[field]);
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function selectAnswer(optionIndex) {
    const optionBtn = document.getElementById(`option-${optionIndex}`);
    const isCorrect = optionBtn.dataset.correct === 'true';

    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`option-${i}`);
        btn.style.pointerEvents = 'none';

        if (btn.dataset.correct === 'true') {
            btn.classList.add('correct');
        }
    }

    if (isCorrect) {
        setTimeout(() => nextWord(), 1500);
    } else {
        optionBtn.classList.add('wrong');

        const currentWord = currentLearningSession.currentBatch[currentLearningSession.currentIndex];
        if (!currentLearningSession.wrongAnswers.includes(currentWord.id)) {
            currentLearningSession.wrongAnswers.push(currentWord.id);
        }

        setTimeout(() => {
            resetQuiz();
            setupPhaseInterface();
        }, 2000);
    }
}

function resetQuiz() {
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`option-${i}`);
        if (btn) {
            btn.className = 'option-btn';
            btn.style.pointerEvents = 'auto';
        }
    }
}

function setupTextInput() {
    const currentWord = currentLearningSession.currentBatch[currentLearningSession.currentIndex];
    const direction = Math.random() > 0.5 ? 'rus_to_eng' : 'eng_to_rus';
    const questionEl = document.getElementById('input-question');
    const inputEl = document.getElementById('text-input');

    if (direction === 'rus_to_eng') {
        if (questionEl) questionEl.textContent = `Переведите на английский: "${currentWord.rus}"`;
        if (inputEl) {
            inputEl.placeholder = 'Введите английское слово';
            inputEl.dataset.correct = currentWord.eng.toLowerCase();
        }
    } else {
        if (questionEl) questionEl.textContent = `Переведите на русский: "${currentWord.eng}"`;
        if (inputEl) {
            inputEl.placeholder = 'Введите русское слово';
            inputEl.dataset.correct = currentWord.rus.toLowerCase();
        }
    }

    if (inputEl) {
        inputEl.value = '';
        inputEl.className = 'text-input';
        inputEl.focus();
    }
}

function checkTextAnswer() {
    const inputEl = document.getElementById('text-input');
    const userAnswer = inputEl.value.toLowerCase().trim();
    const correctAnswer = inputEl.dataset.correct;

    if (userAnswer === correctAnswer) {
        inputEl.classList.add('correct');
        setTimeout(() => nextWord(), 1500);
    } else {
        inputEl.classList.add('wrong');

        const currentWord = currentLearningSession.currentBatch[currentLearningSession.currentIndex];
        if (!currentLearningSession.wrongAnswers.includes(currentWord.id)) {
            currentLearningSession.wrongAnswers.push(currentWord.id);
        }

        setTimeout(() => {
            alert(`Правильный ответ: ${correctAnswer}`);
            inputEl.className = 'text-input';
            inputEl.value = '';
            inputEl.focus();
        }, 1000);
    }
}

function nextWord() {
    currentLearningSession.currentIndex++;

    if (currentLearningSession.currentIndex >= currentLearningSession.currentBatch.length) {
        switchToNextPhase();
        return;
    }

    displayCurrentWord();
}

function switchToNextPhase() {
    currentLearningSession.currentIndex = 0;

    switch(currentLearningSession.phase) {
        case 'learning':
            currentLearningSession.phase = 'quiz_rus_to_eng';
            displayCurrentWord();
            break;
        case 'quiz_rus_to_eng':
            currentLearningSession.phase = 'quiz_eng_to_rus';
            displayCurrentWord();
            break;
        case 'quiz_eng_to_rus':
            currentLearningSession.phase = 'text_input';
            displayCurrentWord();
            break;
        case 'text_input':
            completeBatch();
            break;
    }
}

async function completeBatch() {
    console.log('🎯 Завершаем партию слов...');

    // Если это не режим повторения, сохраняем слова как изученные В БД
    if (!currentLearningSession.isReviewMode && userData) {
        const batchWords = currentLearningSession.currentBatch;
        const wordIds = batchWords.map(word => word.id);

        console.log('💾 Сохраняем изученные слова в БД:', wordIds);

        try {
            // Отправляем на сервер информацию об изученных словах
            await apiRequest(`/users/${telegramUser.id}/learn-words`, 'POST', wordIds);

            // Обновляем локальные данные
            userData.eng_learned_words = [...new Set([...(userData.eng_learned_words || []), ...wordIds])];
            userData.last_learning_date = new Date().toISOString().split('T')[0];

            console.log('✅ Слова успешно сохранены в БД как изученные');

        } catch (error) {
            console.error('❌ Ошибка сохранения изученных слов в БД:', error);
        }
    }

    currentLearningSession.batchIndex++;

    const totalBatches = Math.ceil(currentLearningSession.allWords.length / currentLearningSession.batchSize);

    if (currentLearningSession.batchIndex >= totalBatches) {
        updateUI();
        updateTodayProgress();
        showCompletionScreen();
    } else {
        showNextBatchButton();
    }
}

function showNextBatchButton() {
    alert('Партия завершена! Переходим к следующим словам.');

    loadCurrentBatch();
    currentLearningSession.phase = 'learning';
    currentLearningSession.wrongAnswers = [];

    displayCurrentWord();
}

function showCompletionScreen() {
    const completionTitle = document.querySelector('.completion-title');
    const completionSubtitle = document.querySelector('.completion-subtitle');

    if (completionTitle && completionSubtitle) {
        if (currentLearningSession.isReviewMode) {
            completionTitle.textContent = 'Отличное повторение!';
            completionSubtitle.textContent = 'Вы успешно повторили изученные слова и закрепили знания';
        } else {
            completionTitle.textContent = 'Потрясающе!';
            completionSubtitle.textContent = 'Вы выучили новые слова и проверили свои знания';
        }
    }

    showScreen('completion');
}

// ОБНОВЛЕННАЯ функция playSound
function playSound() {
    const playBtn = document.querySelector('.play-button');
    if (playBtn) {
        playBtn.style.transform = 'scale(0.9)';
        setTimeout(() => {
            playBtn.style.transform = 'scale(1)';
        }, 150);
    }

    // Получаем текущее слово
    const currentWord = currentLearningSession.currentBatch?.[currentLearningSession.currentIndex];

    if (!currentWord) {
        console.log('⚠️ Нет текущего слова для воспроизведения');
        return;
    }

    console.log('🔊 Попытка воспроизвести звук для слова:', currentWord.eng);
    console.log('🔍 Данные sound_data:', currentWord.sound_data);

    // Проверяем разные варианты структуры sound_data
    let audioBase64 = null;

    if (currentWord.sound_data) {
        if (typeof currentWord.sound_data === 'string') {
            // sound_data это строка base64
            audioBase64 = currentWord.sound_data;
            console.log('🎵 Найден звук как строка');
        } else if (currentWord.sound_data.gtts) {
            // sound_data это объект с полем gtts (Google Text-to-Speech)
            audioBase64 = currentWord.sound_data.gtts;
            console.log('🎵 Найден звук в sound_data.gtts');
        } else if (currentWord.sound_data.voice) {
            // sound_data это объект с полем voice
            audioBase64 = currentWord.sound_data.voice;
            console.log('🎵 Найден звук в sound_data.voice');
        } else if (currentWord.sound_data.audio) {
            // Возможно звук в поле audio
            audioBase64 = currentWord.sound_data.audio;
            console.log('🎵 Найден звук в sound_data.audio');
        }
    }

    if (audioBase64) {
        try {
            // Убираем префикс data:audio если он есть
            const cleanBase64 = audioBase64.replace(/^data:audio\/[^;]+;base64,/, '');

            // Создаем аудио элемент (GTTS обычно в формате MP3)
            const audio = new Audio(`data:audio/mp3;base64,${cleanBase64}`);

            // Устанавливаем громкость
            audio.volume = 0.8;

            // Обработчики событий
            audio.onloadstart = () => console.log('🔄 Загружаем аудио...');
            audio.oncanplay = () => console.log('▶️ Аудио готово к воспроизведению');
            audio.onended = () => console.log('✅ Воспроизведение завершено');
            audio.onerror = (e) => {
                console.error('❌ Ошибка воспроизведения:', e);
                // Показываем ошибку на кнопке
                showPlayError();
            };

            // Воспроизводим
            audio.play().then(() => {
                console.log('🔊 Звук GTTS успешно воспроизведен для слова:', currentWord.eng);
            }).catch(error => {
                console.error('❌ Ошибка при воспроизведении GTTS:', error);

                // Пробуем альтернативные форматы
                tryAlternativeAudio(cleanBase64, currentWord.eng);
            });

        } catch (error) {
            console.error('❌ Ошибка создания аудио элемента:', error);
            tryAlternativeAudio(audioBase64, currentWord.eng);
        }
    } else {
        console.log('⚠️ Звуковые данные не найдены для слова:', currentWord.eng);

        // Альтернатива - синтез речи браузера
        tryTextToSpeech(currentWord.eng);
    }
}

// Функция показа ошибки на кнопке воспроизведения
function showPlayError() {
    const playBtn = document.querySelector('.play-button');
    if (playBtn) {
        const originalHTML = playBtn.innerHTML;
        const originalStyle = playBtn.style.background;

        playBtn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 9v2m0 4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" stroke="white" stroke-width="2"/></svg>';
        playBtn.style.background = '#FF3B30';

        setTimeout(() => {
            playBtn.innerHTML = originalHTML;
            playBtn.style.background = originalStyle;
        }, 2000);
    }
}

// Альтернативная функция для других форматов аудио
function tryAlternativeAudio(base64Data, word) {
    console.log('🔄 Пробуем альтернативные форматы аудио...');

    const formats = ['wav', 'ogg', 'webm'];

    for (const format of formats) {
        try {
            const audio = new Audio(`data:audio/${format};base64,${base64Data}`);
            audio.volume = 0.8;

            audio.play().then(() => {
                console.log(`🔊 Звук воспроизведен в формате ${format} для слова:`, word);
                return; // Выходим если успешно
            }).catch(() => {
                console.log(`❌ Формат ${format} не подошел`);
            });

        } catch (error) {
            console.log(`❌ Ошибка формата ${format}:`, error);
        }
    }

    // Если ничего не сработало, пробуем синтез речи
    setTimeout(() => tryTextToSpeech(word), 1000);
}

// Функция синтеза речи как запасной вариант
function tryTextToSpeech(text) {
    if ('speechSynthesis' in window) {
        console.log('🗣️ Используем синтез речи браузера для:', text);

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.8;
        utterance.pitch = 1;
        utterance.volume = 0.8;

        utterance.onstart = () => console.log('🗣️ Начинаем синтез речи');
        utterance.onend = () => console.log('✅ Синтез речи завершен');
        utterance.onerror = (e) => console.error('❌ Ошибка синтеза речи:', e);

        speechSynthesis.speak(utterance);
    } else {
        console.log('❌ Синтез речи не поддерживается браузером');

        // Показываем ошибку на кнопке
        showPlayError();
    }
}

// ОБНОВЛЕННАЯ функция updateUI
function updateUI() {
    if (!userData) return;

    const totalLearnedWords = userData.eng_learned_words?.length || 0;
    const currentStreak = userData.current_streak || 0;
    const trainingCount = Math.floor(totalLearnedWords / 5);

    // Обновляем компактную статистику
    const streakEl = document.getElementById('streak-count');
    const wordsEl = document.getElementById('total-words');
    const trainingEl = document.getElementById('training-count');

    if (streakEl) streakEl.textContent = currentStreak;
    if (wordsEl) wordsEl.textContent = totalLearnedWords;
    if (trainingEl) trainingEl.textContent = trainingCount;

    // Обновляем детальную статистику (для экрана статистики)
    const streakDetail = document.getElementById('streak-count-detail');
    const wordsDetail = document.getElementById('total-words-detail');
    const trainingDetail = document.getElementById('training-count-detail');

    if (streakDetail) streakDetail.textContent = currentStreak;
    if (wordsDetail) wordsDetail.textContent = totalLearnedWords;
    if (trainingDetail) trainingDetail.textContent = trainingCount;

    updateTodayProgress();
    updateTodayDate();

    console.log('📊 UI обновлен - Streak:', currentStreak, 'Слов изучено:', totalLearnedWords, 'Тренировок:', trainingCount);
}

// Функция анимации прогресса при загрузке
function animateProgressCircle() {
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) {
        // Сначала прячем прогресс
        progressBar.style.strokeDashoffset = '377';

        // Затем показываем с анимацией
        setTimeout(() => {
            updateTodayProgress();
        }, 500);
    }
}

// Обработчики событий
document.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        const textInput = document.getElementById('text-input');
        if (textInput && textInput === document.activeElement) {
            checkTextAnswer();
        }
    }
});

// ОБНОВЛЕННАЯ инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM загружен, инициализируем приложение...');
    initTelegramWebApp();

    // Анимируем прогресс при загрузке
    setTimeout(animateProgressCircle, 1000);
});

// Обработка закрытия приложения
window.addEventListener('beforeunload', function() {
    if (userData) {
        console.log('💾 Сохраняем данные перед закрытием...');
        saveUserData();
    }
});