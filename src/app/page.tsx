"use client";

import React, { useState } from 'react';

// Интерфейсы для типов данных
interface Criterion {
  code: string;
  name: string;
  maxScore: number;
}

interface Task {
  id: string;
  subject: string;
  title: string;
  prompt: string;
  maxScore: number;
  criteria: Criterion[];
  goodExample: string;
  badExample: string;
}

interface EvaluationResult {
  totalScore: number;
  maxScore: number;
  summary: string;
  criteria: {
    code: string;
    name: string;
    score: number;
    maxScore: number;
    comment: string;
  }[];
  errorsFound: string[];
  recommendations: string;
}

// Банк тестовых заданий ОГЭ
const TASKS: Task[] = [
    {
      id: 'ru-13.3',
      subject: 'Русский язык',
      title: 'Задание 13.3 — Сочинение-рассуждение',
      prompt: 'Напишите сочинение-рассуждение на тему "Что такое доброта?". Дайте определение понятию ДОБРОТА и прокомментируйте его. Приведите 2 примера-аргумента (из текста и из жизненного/читательского опыта).',
      maxScore: 7,
      criteria: [
        { code: 'СК1', name: 'Толкование значения слова / Тезис', maxScore: 1 },
        { code: 'СК2', name: 'Наличие примеров-аргументов', maxScore: 3 },
        { code: 'СК3', name: 'Смысловая цельность и связность', maxScore: 2 },
        { code: 'СК4', name: 'Композиционная стройность', maxScore: 1 },
      ],
      goodExample: 'Доброта — это душевное качество человека, которое проявляется в заботе, бескорыстной помощи и сострадании к окружающим. Добрый человек совершает поступки не ради выгоды, а по зову сердца.\n\nВ приведенном тексте автор показывает доброту на примере героя, который делится последним хлебом. Это подчеркивает его милосердие.\n\nВ жизни я тоже встречал примеры доброты. Наш сосед помог бездомной собаке найти дом. Таким образом, доброта делает мир лучше.',
      badExample: 'Доброта — это когда ты помогаешь другим людям и ничего не просишь взамен. Навряд ли без доброты мир бы выжил. В тексте автору тоже помогают люди. Я тоже один раз перевел бабушку через дорогу и она дала мне конфету.',
    },
  {
    id: 'math-21',
    subject: 'Математика',
    title: 'Задание 21 — Алгебраическое уравнение (2-я часть)',
    prompt: 'Решите уравнение: x⁴ = (2x - 3)²',
    maxScore: 2,
    criteria: [
      { code: 'М1', name: 'Правильность и полнота решения', maxScore: 2 },
    ],
    goodExample: 'x⁴ - (2x - 3)² = 0\n(x² - (2x - 3))(x² + (2x - 3)) = 0\n1) x² - 2x + 3 = 0, D = 4 - 12 = -8 < 0 (корней нет)\n2) x² + 2x - 3 = 0, D = 4 + 12 = 16\nx1 = (-2 + 4)/2 = 1\nx2 = (-2 - 4)/2 = -3\nОтвет: -3; 1.',
    badExample: 'Извлечем корень из обеих частей:\nx² = 2x - 3\nx² - 2x + 3 = 0\nD = -8, решений нет.\nОтвет: нет решений.',
  }
];

export default function OgeTrainerPage() {
  const [selectedTask, setSelectedTask] = useState<Task>(TASKS[0]);
  const [inputText, setInputText] = useState<string>('');
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);

  const handleEvaluate = async () => {
    if (!inputText.trim()) {
      alert('Пожалуйста, введите текст ответа перед проверкой.');
      return;
    }

    setIsEvaluating(true);
    setEvaluation(null);

    try {
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: selectedTask,
          userResponse: inputText,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Ошибка сервера (${res.status})`);
      }

      setEvaluation(data);
    } catch (err: any) {
      console.error(err);
      alert(`Ошибка проверки: ${err.message}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Шапка сайта */}
        <header className="border-b border-slate-800 pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <span className="bg-blue-600/20 text-blue-400 text-xs font-semibold px-2.5 py-1 rounded border border-blue-500/30">
              НОУ 10 Класс • ИИ-Тренажёр
            </span>
            <h1 className="text-3xl font-bold mt-2 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Подготовка к ОГЭ с ИИ-Экспертом
            </h1>
          </div>
          <div className="flex gap-2">
            {TASKS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedTask(t);
                  setEvaluation(null);
                  setInputText('');
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  selectedTask.id === t.id
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {t.subject} ({t.id})
              </button>
            ))}
          </div>
        </header>

        {/* Основной блок */}
        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Левая колонка: Задание и Поле ввода */}
          <section className="space-y-4">
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 space-y-3">
              <h2 className="text-lg font-semibold text-blue-400">{selectedTask.title}</h2>
              <p className="text-sm text-slate-300 leading-relaxed">{selectedTask.prompt}</p>
              
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="text-xs text-slate-400">Быстрый подставной пример:</span>
                <button
                  onClick={() => setInputText(selectedTask.badExample)}
                  className="text-xs text-amber-400 hover:underline"
                >
                  + С ошибками
                </button>
                <span className="text-xs text-slate-600">•</span>
                <button
                  onClick={() => setInputText(selectedTask.goodExample)}
                  className="text-xs text-emerald-400 hover:underline"
                >
                  + Образцовый
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Ваш ответ:</label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Вставьте или напишите сюда ответ ученика..."
                rows={10}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition resize-none font-mono text-sm"
              />
            </div>

            <button
              onClick={handleEvaluate}
              disabled={isEvaluating}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold py-3 px-6 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
            >
              {isEvaluating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>ИИ-Эксперт проверяет...</span>
                </>
              ) : (
                <span>Проверить через ИИ-эксперта</span>
              )}
            </button>
          </section>

          {/* Правая колонка: Результаты проверки */}
          <section className="space-y-4">
            {evaluation ? (
              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-6 space-y-6 animate-in fade-in duration-300">
                
                {/* Итоговый балл */}
                <div className="flex justify-between items-center border-b border-slate-700 pb-4">
                  <div>
                    <h3 className="text-sm font-medium text-slate-400">Итоговая оценка</h3>
                    <p className="text-2xl font-bold text-white mt-1">
                      {evaluation.totalScore} <span className="text-slate-500 text-lg">/ {evaluation.maxScore} баллов</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                      evaluation.totalScore === evaluation.maxScore 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}>
                      {Math.round((evaluation.totalScore / evaluation.maxScore) * 100)}% выполнения
                    </span>
                  </div>
                </div>

                {/* Резюме */}
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Резюме проверки</h4>
                  <p className="text-sm text-slate-300 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                    {evaluation.summary}
                  </p>
                </div>

                {/* Оценка по критериям */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Детализация по критериям ФИПИ</h4>
                  <div className="space-y-2">
                    {evaluation.criteria.map((c, i) => (
                      <div key={i} className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold text-blue-400">{c.code}: {c.name}</span>
                          <span className="font-mono text-slate-300">{c.score} / {c.maxScore}</span>
                        </div>
                        <p className="text-xs text-slate-400">{c.comment}</p>
                      </div>
                    ))}
                  </div>
                </div>

                           {/* Ошибки и Рекомендации */}
                           {(evaluation.errorsFound?.length ?? 0) > 0 && (
                             <div className="space-y-2">
                               <h4 className="text-xs font-semibold text-rose-400 uppercase tracking-wider">Найденные недочеты</h4>
                               <ul className="list-disc list-inside text-xs text-rose-300/90 space-y-1 bg-rose-950/20 p-3 rounded-lg border border-rose-900/30">
                                 {evaluation.errorsFound?.map((err, idx) => (
                                   <li key={idx}>{err}</li>
                                 ))}
                               </ul>
                             </div>
                           )}

                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Совет эксперта</h4>
                  <p className="text-xs text-emerald-300/90 bg-emerald-950/20 p-3 rounded-lg border border-emerald-900/30">
                    {evaluation.recommendations}
                  </p>
                </div>

              </div>
            ) : (
              <div className="h-full border-2 border-dashed border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center text-center text-slate-500 space-y-3 min-h-[300px]">
                <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center text-2xl">
                  🤖
                </div>
                <div>
                  <p className="font-medium text-slate-400">Результат проверки появится здесь</p>
                  <p className="text-xs text-slate-600 mt-1">Выберите пример или введите текст ответа и нажмите «Проверить»</p>
                </div>
              </div>
            )}
          </section>

        </main>
      </div>
    </div>
  );
}
