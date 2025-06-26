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

    updateTodayStatus();
}

// Обновление статуса изучения на сегодня
function updateTodayStatus() {
    if (!userData) return;

    const today = new Date().toISOString().split('T')[0];
    const learnedToday = userData.last_learning_date === today ? (userData.eng_learned_words?.length || 0) : 0;
    const targetCount = userData.words_per_day || 0;

    const reviewBtn = document.getElementById('review-btn');
    const progressMessage = document.getElementById('progress-message');

    if (!progressMessage || !reviewBtn) return;

    if (targetCount === 0) {
        progressMessage.innerHTML = 'Сначала выберите количество слов для изучения в день';
        progressMessage.style.color = '#666';
        reviewBtn.style.display = 'none';
    } else if (learnedToday >= targetCount) {
        reviewBtn.style.display = 'block';
        progressMessage.style.color = '#34C759';
        progressMessage.innerHTML = '🎉 Отлично! Все слова на сегодня изучены!<br>Можете повторить их для закрепления';
    } else {
        reviewBtn.style.display = learnedToday > 0 ? 'block' : 'none';
        progressMessage.style.color = '#666';
        progressMessage.innerHTML = `Изучено сегодня: ${learnedToday} из ${targetCount} слов`;
    }
}

// Функции навигации
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
        updateTodayStatus();

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

function displayCurrentWord() {
    const word = currentLearningSession.currentBatch[currentLearningSession.currentIndex];
    if (!word) {
        console.log('No word found');
        return;
    }

    console.log('📖 Показываем слово из БД:', word);

    // Обновляем UI
    document.getElementById('word-image').textContent = word.image_data || '📝';
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
    if (!optionBtn) return;

    const isCorrect = optionBtn.dataset.correct === 'true';

    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`option-${i}`);
        if (btn) {
            btn.style.pointerEvents = 'none';

            if (btn.dataset.correct === 'true') {
                btn.classList.add('correct');
            }
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
    if (!currentWord) return;

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
    if (!inputEl) return;

    const userAnswer = inputEl.value.toLowerCase().trim();
    const correctAnswer = inputEl.dataset.correct;

    if (userAnswer === correctAnswer) {
        inputEl.classList.add('correct');
        setTimeout(() => nextWord(), 1500);
    } else {
        inputEl.classList.add('wrong');

        const currentWord = currentLearningSession.currentBatch[currentLearningSession.currentIndex];
        if (currentWord && !currentLearningSession.wrongAnswers.includes(currentWord.id)) {
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
        updateTodayStatus();
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

function playSound() {
    const playBtn = document.querySelector('.play-button');
    if (playBtn) {
        playBtn.style.transform = 'scale(0.9)';
        setTimeout(() => {
            playBtn.style.transform = 'scale(1)';
        }, 150);
    }

    // Воспроизведение звука из базы данных
    const currentWord = currentLearningSession.currentBatch?.[currentLearningSession.currentIndex];
    if (currentWord && currentWord.sound_data && currentWord.sound_data.voice) {
        try {
            const audio = new Audio(`data:audio/mp3;base64,${currentWord.sound_data.voice}`);
            audio.play();
            console.log('🔊 Воспроизводим звук из БД для слова:', currentWord.eng);
        } catch (error) {
            console.log('❌ Не удалось воспроизвести звук из БД:', error);
        }
    } else {
        console.log('⚠️ Звуковые данные не найдены в БД для слова');
    }
}

function updateUI() {
    if (!userData) return;

    const streakEl = document.getElementById('streak-count');
    const wordsEl = document.getElementById('total-words');
    const trainingEl = document.getElementById('training-count');

    const totalLearnedWords = userData.eng_learned_words?.length || 0;
    const currentStreak = userData.current_streak || 0;
    const trainingCount = Math.floor(totalLearnedWords / 5);

    if (streakEl) streakEl.textContent = currentStreak;
    if (wordsEl) wordsEl.textContent = totalLearnedWords;
    if (trainingEl) trainingEl.textContent = trainingCount;

    console.log('📊 UI обновлен - Streak:', currentStreak, 'Слов изучено:', totalLearnedWords, 'Тренировок:', trainingCount);
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

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM загружен, инициализируем приложение...');
    initTelegramWebApp();
});

// Обработка закрытия приложения
window.addEventListener('beforeunload', function() {
    if (userData) {
        console.log('💾 Сохраняем данные перед закрытием...');
        saveUserData();
    }
});