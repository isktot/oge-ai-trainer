"use client";

import React, { useState } from 'react';
import { TASKS, Task } from '@/data/tasks'; // Подключаем задания из отдельного файла

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

export default function OgeTrainerPage() {
  const [selectedSubject, setSelectedSubject] = useState<'Русский язык' | 'Математика'>('Русский язык');
  const [selectedTask, setSelectedTask] = useState<Task>(TASKS[0]);
  const [inputText, setInputText] = useState<string>('');
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);

  const filteredTasks = TASKS.filter((t) => t.subject === selectedSubject);

  const handleSubjectChange = (subject: 'Русский язык' | 'Математика') => {
    setSelectedSubject(subject);
    const firstTask = TASKS.find((t) => t.subject === subject) || TASKS[0];
    setSelectedTask(firstTask);
    setEvaluation(null);
    setInputText('');
  };

  const handleRandomTask = () => {
    const available = filteredTasks.filter((t) => t.id !== selectedTask.id);
    const pool = available.length > 0 ? available : filteredTasks;
    const random = pool[Math.floor(Math.random() * pool.length)];
    setSelectedTask(random);
    setEvaluation(null);
    setInputText('');
  };

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
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Шапка */}
        <header className="border-b border-slate-800 pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <span className="bg-blue-600/20 text-blue-400 text-xs font-semibold px-2.5 py-1 rounded border border-blue-500/30">
              НОУ 10 Класс • ИИ-Тренажёр ОГЭ
            </span>
            <h1 className="text-3xl font-bold mt-2 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Экспертная проверка ответов ОГЭ
            </h1>
          </div>

          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700/60">
            {(['Русский язык', 'Математика'] as const).map((subject) => (
              <button
                key={subject}
                onClick={() => handleSubjectChange(subject)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  selectedSubject === subject
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {subject}
              </button>
            ))}
          </div>
        </header>

        {/* Переключатель заданий */}
        <div className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Выберите задание ({filteredTasks.length}):
            </label>
            <select
              value={selectedTask.id}
              onChange={(e) => {
                const found = TASKS.find((t) => t.id === e.target.value);
                if (found) {
                  setSelectedTask(found);
                  setEvaluation(null);
                  setInputText('');
                }
              }}
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              {filteredTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleRandomTask}
            className="sm:self-end bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium px-4 py-2 rounded-lg border border-slate-600 transition flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <span>🎲</span>
            <span>Случайное задание</span>
          </button>
        </div>

        {/* Рабочая область */}
        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          <section className="space-y-4">
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-blue-400">{selectedTask.title}</h2>
                <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                  Макс. балл: {selectedTask.maxScore}
                </span>
              </div>

              <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto pr-2 custom-scrollbar bg-slate-950/40 p-3 rounded-lg border border-slate-800">
                {selectedTask.prompt}
              </div>
              
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="text-xs text-slate-400">Тест:</span>
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
                  + Идеальный
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Ответ ученика:</label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Вставьте или напишите сюда ответ..."
                rows={9}
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

          {/* Результаты */}
          <section className="space-y-4">
            {evaluation ? (
              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-6 space-y-6">
                
                <div className="flex justify-between items-center border-b border-slate-700 pb-4">
                  <div>
                    <h3 className="text-sm font-medium text-slate-400">Итоговая оценка</h3>
                    <p className="text-2xl font-bold text-white mt-1">
                      {evaluation.totalScore} <span className="text-slate-500 text-lg">/ {evaluation.maxScore} баллов</span>
                    </p>
                  </div>
                  <div>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                      evaluation.totalScore === evaluation.maxScore 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}>
                      {Math.round((evaluation.totalScore / evaluation.maxScore) * 100)}% выполнения
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Резюме проверки</h4>
                  <p className="text-sm text-slate-300 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                    {evaluation.summary}
                  </p>
                </div>

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
                  <p className="text-xs text-slate-600 mt-1">Выберите задание или нажмите «🎲 Случайное задание»</p>
                </div>
              </div>
            )}
          </section>

        </main>
      </div>
    </div>
  );
}
