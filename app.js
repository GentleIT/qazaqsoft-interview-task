// ========== Константы и ключи хранилища ==========
const STORAGE_KEYS = {
  STATE: "quiz.state.v1",
};
const DATA_URL = "./data/questions.json";

// ========== Модели ==========
/**
 * @typedef {{ id: string; text: string; options: string[]; correctIndex: number; topic?: string }} QuestionDTO
 * @typedef {{ title: string; timeLimitSec: number; passThreshold: number; questions: QuestionDTO[] }} QuizDTO
 */

class Question {
  /** @param {QuestionDTO} dto */
  constructor(dto) {
    this.id = dto.id;
    this.text = dto.text;
    this.options = dto.options;
    this.correctIndex = dto.correctIndex;
    this.topic = dto.topic ?? null;
  }
}

// ========== Сервисы ==========
class StorageService {
  static saveState(state) {
    // TODO: сериализовать state и сохранить в localStorage
    localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(state))
  }

  static loadState(state) {
    // TODO: прочитать и распарсить состояние, вернуть объект или null
    try {
      const rawString = localStorage.getItem(STORAGE_KEYS.STATE);
      
      if (rawString === null) {
        return null;
      }
      
      const parsedState = JSON.parse(rawString);
      return parsedState;
    } catch (error) {
      console.error("Ошибка чтения состояния, начинаем заново:", error);
      return null;
    }
  }

  static clear() {
    // TODO: очистить сохранённое состояние
    localStorage.removeItem(STORAGE_KEYS.STATE);
  }
}

// ========== Движок теста ==========
class QuizEngine {
  /** @param {QuizDTO} quiz */
  constructor(quiz) {
    this.title = quiz.title;
    this.timeLimitSec = quiz.timeLimitSec;
    this.passThreshold = quiz.passThreshold;
    this.questions = quiz.questions.map((q) => new Question(q));

    this.currentIndex = 0;
    /** @type {Record<string, number|undefined>} */
    this.answers = {}; // questionId -> selectedIndex
    this.remainingSec = quiz.timeLimitSec;
    this.isFinished = false;
  }

  get length() {
    return this.questions.length;
  }
  get currentQuestion() {
    return this.questions[this.currentIndex];
  }

  /** @param {number} index */
  goTo(index) {
    // TODO: валидировать границы и сменить текущий индекс
    if (index >= 0 && index < this.length) {
      this.currentIndex = index
    }
  }

  next() {
    // TODO: перейти к следующему вопросу, если возможно
    if (this.currentIndex < this.length - 1) {
      this.currentIndex = this.currentIndex + 1;
    }
  }

  prev() {
    // TODO: перейти к предыдущему вопросу, если возможно
    if (this.currentIndex > 0) {
      this.currentIndex = this.currentIndex - 1;
    }
  }

  /** @param {number} optionIndex */
  select(optionIndex) {
    // TODO: сохранить выбор пользователя для текущего вопроса
    const currentQuestion = this.currentQuestion;
    if (currentQuestion !== undefined) {
      this.answers[currentQuestion.id] = optionIndex;
    }
  }

  getSelectedIndex() {
    // TODO: вернуть выбранный индекс для текущего вопроса (или undefined)
    const currentQuestion = this.currentQuestion;
    if (currentQuestion !== undefined) {
      return this.answers[currentQuestion.id]
    }

    return undefined
  }

  tick() {
    // TODO: декремент таймера; если 0 — завершить тест
    if (this.remainingSec > 0) {
      this.remainingSec = this.remainingSec - 1;
    }

    // if time is up, but test is not finished yet
    if (this.remainingSec === 0 && this.isFinished === false) {
      this.isFinished = true;

      const summary = this.finish();
      stopTimer(); // thx for keeping it
      renderResult(summary);
      persist();
    }
  }

  finish() {
    // TODO: зафиксировать завершение и вернуть сводку результата
    // return { correct: number, total: number, percent: number, passed: boolean }
    this.isFinished = true;
    let correctCount = 0;

    // Классический цикл вместо методов массива
    for (const question of this.questions) {
      const userAnswer = this.answers[question.id];
      
      if (userAnswer === question.correctIndex) {
        correctCount = correctCount + 1;
      }
    }

    const totalCount = this.length;
    let percent = 0;
    
    // Защита от деления на ноль, если массив вопросов пуст
    if (totalCount > 0) {
      percent = correctCount / totalCount;
    }

    let passed = false;
    if (percent >= this.passThreshold) {
      passed = true;
    }

    const totalTimeLimit = this.timeLimitSec || 300;
    const timeSpentSec = totalTimeLimit - this.remainingSec;

    return {
      correct: correctCount,
      total: totalCount,
      percent: percent,
      passed: passed,
      timeSpent: timeSpentSec,
    };
  }
 

  /** @param {any} state */
  static fromState(quiz, state) {
    // TODO: создать двигатель на базе сохранённого состояния
    const engine = new QuizEngine(quiz);
    
    engine.currentIndex = state.currentIndex ?? 0;

    engine.answers = {};
    // To return answers in int type format from json string
    if (state.answers) {
      for (const [qId, ansVal] of Object.entries(state.answers)) {
        engine.answers[qId] = ansVal !== undefined && ansVal !== null ? Number(ansVal) : undefined;
      }
    }

    engine.remainingSec = state.remainingSec ?? quiz.timeLimitSec;
    engine.isFinished = state.isFinished ?? false;
    
    return engine;
  }

  /** Восстановление/выгрузка состояния для localStorage */
  getState() {
    return {
      currentIndex: this.currentIndex,
      answers: this.answers,
      remainingSec: this.remainingSec,
      isFinished: this.isFinished
    };
  }
}

// ========== DOM-утилиты ==========
const $ = (sel) => /** @type {HTMLElement} */ (document.querySelector(sel));
const els = {
  title: $("#quiz-title"),
  progress: $("#progress"),
  timer: $("#timer"),
  qSection: $("#question-section"),
  qText: $("#question-text"),
  form: $("#options-form"),
  btnPrev: $("#btn-prev"),
  btnNext: $("#btn-next"),
  btnFinish: $("#btn-finish"),
  result: $("#result-section"),
  resultSummary: $("#result-summary"),
  btnReview: $("#btn-review"),
  btnRestart: $("#btn-restart"),
};

let engine = /** @type {QuizEngine|null} */ (null);
let timerId = /** @type {number|undefined} */ (undefined);
let reviewMode = false;

// ========== Инициализация ==========
document.addEventListener("DOMContentLoaded", async () => {
  const quiz = await loadQuiz();
  els.title.textContent = quiz.title;

  const saved = StorageService.loadState();
  if (saved) {
    engine = QuizEngine.fromState(quiz, saved);
  } else {
    engine = new QuizEngine(quiz);
  }

  bindEvents();
  
  if (engine.isFinished) {
    // els.qSection.classList.add("hidden");
    els.qSection.style.display = "none";
    const actionsNav = document.querySelector("nav.actions");
    if (actionsNav) { // why did I use '!=== null' so much...
      // actionsNav.classList.add("hidden");
      actionsNav.style.display = "none";
    }

    const summary = engine.finish();
    renderResult(summary);
    // renderAll();
  } else {
    // els.result.classList.add("hidden");
    els.result.style.display = "none";

    // els.qSection.classList.remove("hidden");
    els.qSection.style.display = "block";

    const actionsNav = document.querySelector("nav.actions");
    if (actionsNav) {
      // actionsNav.classList.remove("hidden");
      actionsNav.style.display = "flex";
    }

    renderAll();
    startTimer();
  }
});

async function loadQuiz() {
  // Загружаем JSON с вопросами
  const res = await fetch(DATA_URL);
  /** @type {QuizDTO} */
  const data = await res.json();
  // Простейшая валидация формата (можно расширить)
  if (!data?.questions?.length) {
    throw new Error("Некорректные данные теста");
  }
  return data;
}

// ========== Таймер ==========
function startTimer() {
  stopTimer();
  timerId = window.setInterval(() => {
    try {
      engine.tick();
      persist();
      renderTimer();
    } catch (e) {
      // До реализации tick() попадём сюда — это нормально для шаблона.
      stopTimer();
    }
  }, 1000);
}
function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = undefined;
  }
}

// ========== События ==========
function bindEvents() {
  els.btnPrev.addEventListener("click", () => {
    engine.prev();
    persist();
    renderAll();
  });

  els.btnNext.addEventListener("click", () => {
    engine.next();
    persist();
    renderAll();
  });

  els.btnFinish.addEventListener("click", () => {
    const summary = engine.finish();
    if (summary) {
      stopTimer();
      renderResult(summary);
      persist();
    }
  });

  els.btnReview.addEventListener("click", () => {
    reviewMode = true;
  
    els.btnReview.style.display = "none";
    els.qSection.style.display = "block";

    const actionsNav = document.querySelector("nav.actions");
    if (actionsNav) {
      actionsNav.style.display = "flex";
    }
    
    engine.goTo(0);
    renderAll();
  });

  els.btnRestart.addEventListener("click", () => {
    StorageService.clear();
    window.location.reload();
  });

  els.form.addEventListener("change", (e) => {
    const target = /** @type {HTMLInputElement} */ (e.target);
    if (target.name === "option") {
      const idx = parseInt(target.value, 10);
      engine.select(idx);

      persist();
      renderNav();
    }
  });
}

// ========== Рендер ==========
function renderAll() {
  renderProgress();
  renderTimer();
  renderQuestion();
  renderNav();
}

function renderProgress() {
  els.progress.textContent = `Вопрос ${engine.currentIndex + 1} из ${
    engine.length
  }`;
}

function renderTimer() {
  const sec = engine.remainingSec ?? 0;
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  els.timer.textContent = `${m}:${s}`;
}

function renderQuestion() {
  const q = engine.currentQuestion;
  els.qText.textContent = q.text;

  els.form.innerHTML = "";
  q.options.forEach((opt, i) => {
    const id = `opt-${q.id}-${i}`;
    const wrapper = document.createElement("label");
    wrapper.className = "option";
    if (reviewMode) {
      const chosen = engine.answers[q.id];
      if (i === q.correctIndex) wrapper.classList.add("correct");
      if (chosen === i && i !== q.correctIndex)
        wrapper.classList.add("incorrect");
    }

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "option";
    input.value = String(i);
    input.id = id;
    
    const selectedIdx = engine.getSelectedIndex();
    if (selectedIdx === i) {
      input.checked = true;
    }

    if (reviewMode === true) {
      input.disabled = true; 
    }

    const span = document.createElement("span");
    span.textContent = opt;

    wrapper.appendChild(input);
    wrapper.appendChild(span);
    els.form.appendChild(wrapper);
  });
}

function renderNav() {
  const selectedIdx = engine.getSelectedIndex();
  const hasSelection = selectedIdx !== undefined && selectedIdx !== null && selectedIdx !== "";

  els.btnPrev.disabled = engine.currentIndex === 0;

  if (reviewMode === true) {
    els.btnNext.disabled = engine.currentIndex === engine.length - 1;
    els.btnFinish.disabled = true;
    
  } else {
    els.btnNext.disabled = !(engine.currentIndex < engine.length - 1 && hasSelection);
    els.btnFinish.disabled = !(engine.currentIndex === engine.length - 1 && hasSelection);
  }
}

function renderResult(summary) {
  els.qSection.style.display = "block";

  if (els.qText) {
    els.qText.textContent = "Вы завершили тест";
  }

  if (els.form) {
    els.form.innerHTML = "";
  }

  const actionsNav = document.querySelector("nav.actions");
  if (actionsNav) {
    actionsNav.style.display = "none";
  }

  els.result.style.display = "block";
  els.btnReview.style.display = "";

  const minutes = Math.floor(summary.timeSpent / 60).toString().padStart(2, "0");
  const seconds = (summary.timeSpent % 60).toString().padStart(2, "0");

  const pct = Math.round(summary.percent * 100);
  const status = summary.passed ? "Пройден" : "Не пройден";
  els.resultSummary.textContent = `${summary.correct} / ${summary.total} (${pct}%) — ${status} | Время — ${minutes}:${seconds}`;
}

// ========== Persist ==========
function persist() {
  try {
    if (engine) {
    StorageService.saveState(engine.getState());
  }
  } catch (error) {
    console.error("Ошибка при сохранении прогресса:", error);
  }
}