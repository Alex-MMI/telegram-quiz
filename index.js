require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Telegraf } = require('telegraf');
const Filter = require('bad-words');
const { nanoid } = require('nanoid');

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);
const filter = new Filter();

app.use(cors());
app.use(express.json());

// Твой код для API и бота здесь
// Например:

app.post('/api/submit', (req, res) => {
  const { task, answer, name } = req.body;

  // Проверка плохих слов в имени
  if (name && filter.isProfane(name)) {
    return res.status(400).json({ ok: false, message: 'Имя содержит запрещённые слова' });
  }

  // Проверка ответа (пример)
  const correctAnswers = {
    task1: 'время',
    task2: 'снег',
  };

  const correct = correctAnswers[task];
  if (!correct) {
    return res.status(400).json({ ok: false, message: 'Задание не найдено' });
  }

  if (answer.toLowerCase().trim() === correct.toLowerCase()) {
    return res.json({ ok: true, correct: true, message: '✅ Правильно!' });
  } else {
    return res.json({ ok: true, correct: false, message: '❌ Неправильно, попробуйте ещё' });
  }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  bot.launch();
  console.log('Бот запущен');
});
