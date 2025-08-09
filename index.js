// index.js
const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Telegraf } = require('telegraf');
const Filter = require('bad-words');
const { nanoid } = require('nanoid');
require('dotenv').config();

const DB_PATH = path.join(__dirname, 'db.json');
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const WEBAPP_URL = process.env.WEBAPP_URL;

// --- простая файловая БД (чтение/запись) ---
async function readDB() {
  try {
    const txt = await fs.readFile(DB_PATH, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    return { users: {}, tasks: {}, answers: [], banned: [] };
  }
}
async function writeDB(db) {
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

// нормализация ответа
function normalizeAnswer(s) {
  return (s||'').toLowerCase().replace(/\s+/g,'').replace(/[^a-zа-я0-9ё]/gi,'');
}

// --- EXPRESS API ---
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'webapp'))); // отдаём webapp для локальной проверки

// Проверить существование задания
app.get('/api/task/:id', async (req, res) => {
  const id = req.params.id;
  const db = await readDB();
  const task = db.tasks[id];
  if (!task) return res.json({ ok: true, exists: false });
  return res.json({ ok: true, exists: true, points: task.points || 0 });
});

// Подать ответ
app.post('/api/submit', async (req, res) => {
  const { task, answer, userId, name, showInRating, initData } = req.body;
  if (!task || !answer) return res.status(400).json({ ok:false, message:'Нет task или answer' });

  const db = await readDB();
  const taskObj = db.tasks[task];
  if (!taskObj) return res.status(400).json({ ok:false, message:'Задание не найдено' });

  // Определяем userKey: если initData содержит telegram user -> 'tg_<id>', иначе 'local_<userId>' (userId может быть сгенерирован на клиенте)
  let userKey = null;
  if (initData && initData.user && initData.user.id) {
    userKey = 'tg_' + initData.user.id;
  } else if (userId) {
    userKey = 'local_' + userId;
  } else {
    // создаём временный локальный id
    const gen = nanoid(8);
    userKey = 'local_' + gen;
  }

  // Зарегистрировать пользователя, если нет
  db.users[userKey] = db.users[userKey] || { id: userKey, name: null, username: null, score: 0, showInRating: false };
  // Если пользователь передал имя и хочет быть в рейтинге — проверяем плохие слова
  const filter = new Filter();
  const bannedList = db.banned || [];
  // добавить кастомные плохие слова в фильтр
  bannedList.forEach(b => filter.add(b));
  if (showInRating && name) {
    if (filter.isProfane(name)) {
      return res.status(400).json({ ok:false, message:'Имя содержит запрещённые слова' });
    }
    db.users[userKey].name = name;
    db.users[userKey].showInRating = true;
  } else if (showInRating && !name) {
    return res.status(400).json({ ok:false, message:'Чтобы показываться в рейтинге, нужно ввести имя' });
  }

  const normalized = normalizeAnswer(answer);
  const correctNorm = normalizeAnswer(taskObj.answer);

  // Проверка: уже давал ли пользователь правильный ответ на это задание
  const alreadyCorrect = db.answers.find(a => a.userId === userKey && a.task === task && a.correct);

  const isCorrect = normalized === correctNorm;

  db.answers.push({ userId: userKey, task, correct: !!isCorrect, answer: answer, ts: Date.now() });

  if (isCorrect && !alreadyCorrect) {
    db.users[userKey].score = (db.users[userKey].score || 0) + (taskObj.points || 1);
  }

  await writeDB(db);

  return res.json({
    ok: true,
    correct: !!isCorrect,
    message: isCorrect ? `✅ Правильно! +${taskObj.points||1} бал.` : '❌ Неправильно',
    userId: userKey,
    score: db.users[userKey].score
  });
});

// Рейтинг (top N)
app.get('/api/rating', async (req, res) => {
  const limit = parseInt(req.query.limit || '10', 10);
  const db = await readDB();
  const arr = Object.values(db.users)
    .filter(u => u.showInRating && u.name)
    .sort((a,b) => (b.score||0) - (a.score||0))
    .slice(0, limit)
    .map((u, i) => ({ rank: i+1, name: u.name, score: u.score || 0 }));
  res.json({ ok:true, items: arr });
});

app.listen(PORT, () => console.log(`API/Static running on http://localhost:${PORT}`));

// --- Telegram Bot (только кнопка на старт)
if (!BOT_TOKEN) {
  console.log('BOT_TOKEN пустой — бот не будет запущен');
  process.exit(0);
}

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
  // даём простую кнопку — открывает WebApp по WEBAPP_URL
  // в канале/чатах лучше использовать url (web_app кнопка для личного чата), но для простоты даём ссылку и web_app
  const webUrl = WEBAPP_URL || `${process.env.WEBAPP_URL}`;
  ctx.reply('Нажмите кнопку, чтобы открыть приложение ответов.', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Открыть приложение', url: webUrl }] // прямо в канале/чате кликается и открывается
      ]
    }
  });
});

// (опционально) команда админская для отправки поста в канал — оставляю в комментарии
// bot.command('post', async (ctx) => { /* реализуем, если нужно */ });

bot.launch();
console.log('Бот запущен');
