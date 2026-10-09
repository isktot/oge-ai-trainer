// scripts/validate-tasks.ts
//
// Полная валидация заданий: прогоняет примеры через API и сохраняет
// полные ответы для последующего анализа.
//
// Запуск:  npx tsx scripts/validate-tasks.ts
// Одно задание: TASK=math-20-3 npx tsx scripts/validate-tasks.ts
// Без задержек:  RUNS=1 npx tsx scripts/validate-tasks.ts
//
// Убедитесь, что `npm run dev` запущен в другом терминале.

import { TASKS, Task } from '../src/data/tasks';
import * as fs from 'fs';
import * as path from 'path';

const API_URL = 'http://localhost:3000/api/check';
const RUNS = Number(process.env.RUNS ?? 1);
const ONLY_TASK = process.env.TASK;

interface TestCase {
  name: string;
  text: string;
  expectedScore?: number; // если задан — сравниваем с фактическим
  note?: string;
}

interface RunResult {
  score: number;
  maxScore: number;
  criteria: {
    code: string;
    name: string;
    score: number;
    maxScore: number;
    comment: string;
  }[];
  errorsFound: string[];
  summary: string;
  recommendations: string;
  rawJson: any;
  error?: string;
}

interface CaseReport {
  name: string;
  expectedScore?: number;
  note?: string;
  runs: RunResult[];
  avgScore: number;
  minScore: number;
  maxScore: number;
  stdev: number;
  verdict: 'OK' | 'WARN' | 'FAIL';
  notes: string[];
}

interface TaskReport {
  id: string;
  title: string;
  maxScore: number;
  cases: CaseReport[];
}

// ---------- ТЕСТОВЫЕ СЦЕНАРИИ ----------
// Здесь вы задаёте все проверки, которые хотите прогнать.
// Ключ — id задания из TASKS. Значение — массив тестов.

function getTestCases(task: Task): TestCase[] {
  const cases: TestCase[] = [];

  // Всегда добавляем встроенные goodExample и badExample
  cases.push({
    name: 'goodExample (встроенный)',
    text: task.goodExample,
    expectedScore: task.maxScore,
    note: 'Эталонный хороший ответ из tasks.ts',
  });

  cases.push({
    name: 'badExample (встроенный)',
    text: task.badExample,
    expectedScore: 0,
    note: 'Эталонный плохой ответ из tasks.ts',
  });

  // Кастомные тесты по каждому заданию
  switch (task.id) {
    case 'math-20-1': {
      cases.push({
        name: 'Кастом: правильный метод, но x=1 пропущен второй корень',
        text: `x³ - x² + 7x - 7 = 0
x²(x - 1) + 7(x - 1) = 0
(x - 1)(x² + 7) = 0
x - 1 = 0 => x = 1
Ответ: 1.`,
        expectedScore: 2,
        note: 'Фактически всё верно, второй множитель не даёт корней',
      });
      cases.push({
        name: 'Кастом: неверный ответ, метод правильный',
        text: `x³ - x² + 7x - 7 = 0
x²(x - 1) + 7(x - 1) = 0
(x - 1)(x² + 7) = 0
x = 7
Ответ: 7.`,
        expectedScore: 1,
        note: 'Метод верный, но корень извлечён неверно',
      });
      cases.push({
        name: 'Кастом: только ответ без решения',
        text: `Ответ: 1.`,
        expectedScore: 0,
        note: 'Нет решения',
      });
      break;
    }

    case 'math-20-2': {
      cases.push({
        name: 'Кастом: правильный ответ, расписан через два случая',
        text: `(2x - 3)² = (1 - 2x)²
Значит 2x - 3 = 1 - 2x или 2x - 3 = -(1 - 2x)

Случай 1: 2x - 3 = 1 - 2x => 4x = 4 => x = 1
Случай 2: 2x - 3 = -1 + 2x => -3 = -1 => нет решений

Ответ: 1.`,
        expectedScore: 2,
        note: 'Полный разбор через оба случая',
      });
      cases.push({
        name: 'Кастом: ошибка в знаке',
        text: `(2x - 3)² - (1 - 2x)² = 0
(4x - 4)(2x - 2) = 0
x = 1
Ответ: 1.`,
        expectedScore: 1,
        note: 'Ответ верный, но в разности квадратов второй множитель неверный',
      });
      break;
    }

    case 'math-20-3': {
      cases.push({
        name: 'Кастом: арифметическая ошибка в корне',
        text: `2x² + 3x - 6x - 9 + 7 < 0
2x² - 3x - 2 < 0

D = 9 - 4*2*(-2) = 9 + 16 = 25
x1 = (3 + 5)/4 = 2
x2 = (3 - 5)/4 = -1

Ответ: (-1; 2).`,
        expectedScore: 1,
        note: 'Арифметика: -2/4 = -0.5, а не -1. Ответ неверный',
      });
      cases.push({
        name: 'Кастом: правильный ответ через двойное неравенство',
        text: `2x² - 3x - 2 < 0
D = 25
x1 = 2, x2 = -0.5
Ответ: -0.5 < x < 2.`,
        expectedScore: 2,
        note: 'Эквивалентная форма записи',
      });
      cases.push({
        name: 'Кастом: только ответ без решения',
        text: `Ответ: (-0.5; 2).`,
        expectedScore: 0,
        note: 'Нет решения',
      });
      break;
    }

    case 'math-20-4': {
      cases.push({
        name: 'Кастом: правильный ответ, но через перебор случаев',
        text: `(-10) / ((x-3)² - 5) ≥ 0
Числитель отрицательный, значит нужно, чтобы знаменатель был < 0.
(x-3)² - 5 < 0
(x-3)² < 5
-√5 < x-3 < √5
3-√5 < x < 3+√5
Ответ: (3-√5; 3+√5).`,
        expectedScore: 2,
        note: 'Альтернативный метод, ответ верный',
      });
      break;
    }

    case 'math-20-5': {
      cases.push({
        name: 'Кастом: потерян один корень (x=-1 не найден)',
        text: `x² + y = 5
6x² - y = 2
Сложим: 7x² = 7 => x² = 1 => x = 1
y = 5 - 1 = 4
Ответ: (1; 4).`,
        expectedScore: 1,
        note: 'Потерян второй корень x=-1',
      });
      cases.push({
        name: 'Кастом: правильный ответ, но не в форме пар',
        text: `x² + y = 5
6x² - y = 2
7x² = 7 => x = ±1
При x = 1: y = 4
При x = -1: y = 4
Ответ: x₁ = 1, y₁ = 4; x₂ = -1, y₂ = 4.`,
        expectedScore: 2,
        note: 'Правильные значения, нестандартная форма',
      });
      break;
    }

    case 'ru-13.3-1': {
      cases.push({
        name: 'Кастом: без личного примера',
        text: `Настоящее искусство — это то, что трогает душу и пробуждает светлые чувства. В тексте Ю.О. Домбровского рассказчик восхищается картинами художника Хлудова. Он видит в них свежесть, радость и полноту жизни, которые искусствоведы не замечали. По мнению автора, картины Хлудова ликуют и дарят зрителю восторг.

Таким образом, ценность настоящего искусства — в его способности пробуждать в человеке искренние эмоции.`,
        expectedScore: 14,
        note: 'Только один пример (из текста), нет личного опыта',
      });
      break;
    }

    case 'ru-13.3-2': {
      cases.push({
        name: 'Кастом: хороший ответ с одной орфографической ошибкой',
        text: `Нельзя бросать человека в беде, потому что взаимовыручка и сострадание — основа настоящих человеческих отношений.

В тексте Л.Ф. Воронковой мальчик Ваня проявляет настоящий героизм. Увидев, что маленький Васятка попал на пчельник, он не испугался и бросился ему на помощь. Ваня сам пострадал от укусов, но вывел малыша к дому.

В жизни я тоже сталкивался с подобной ситуацией. Однажды я помог однокласнику, который поскользнулся на льду и повредил ногу.

Таким образом, готовность прийти на помощь делает нас настоящими людьми.`,
        expectedScore: 18,
        note: 'Хороший текст, но «однокласнику» — одна орфографическая ошибка',
      });
      break;
    }

    case 'ru-13.3-3': {
      cases.push({
        name: 'Кастом: слабый текст с типичными ошибками',
        text: `Доброта проявляетца по разному. В тексте Яковлева девочка Кэт подружилась с собакой Урсом. Она давала ему еду и разговаривала с ним. Собака была злая, но Кэт смогла её приручить. Я думаю что доброта очень важна, потомучто без неё мир был бы жестоким.`,
        expectedScore: 6,
        note: 'Короткий, ошибки: проявляетца, по разному, потомучто, я думаю что',
      });
      break;
    }
  }

  return cases;
}

// ---------- ЗАПРОС К API ----------

async function callApi(task: Task, userResponse: string): Promise<RunResult> {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, userResponse }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        score: 0,
        maxScore: task.maxScore,
        criteria: [],
        errorsFound: [],
        summary: '',
        recommendations: '',
        rawJson: data,
        error: `${res.status}: ${data.error ?? 'unknown'}`,
      };
    }

    return {
      score: data.totalScore,
      maxScore: data.maxScore,
      criteria: data.criteria ?? [],
      errorsFound: data.errorsFound ?? [],
      summary: data.summary ?? '',
      recommendations: data.recommendations ?? '',
      rawJson: data,
    };
  } catch (e: any) {
    return {
      score: 0,
      maxScore: task.maxScore,
      criteria: [],
      errorsFound: [],
      summary: '',
      recommendations: '',
      rawJson: null,
      error: e?.message ?? 'fetch failed',
    };
  }
}

// ---------- СТАТИСТИКА ----------

function calcStats(runs: RunResult[]) {
  const scores = runs.map((r) => r.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  const variance =
    scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length;
  return { avg, min, max, stdev: Math.sqrt(variance) };
}

// ---------- ОСНОВНОЙ ЦИКЛ ----------

async function main() {
  const tasks = ONLY_TASK
    ? TASKS.filter((t) => t.id === ONLY_TASK)
    : TASKS;

  console.log(`\n${'='.repeat(70)}`);
  console.log('ПОЛНАЯ ВАЛИДАЦИЯ ЗАДАНИЙ');
  console.log('='.repeat(70));
  console.log(`Заданий: ${tasks.length}`);
  console.log(`Прогонов на тест: ${RUNS}`);

  const allCases = tasks.map((t) => getTestCases(t));
  const totalCases = allCases.reduce((s, c) => s + c.length, 0);
  console.log(`Всего тестов: ${totalCases}`);
  console.log(`Всего запросов: ~${totalCases * RUNS}`);
  console.log(`Оценочное время: ~${Math.round(totalCases * RUNS * 50 / 60)} мин\n`);

  const reports: TaskReport[] = [];

  for (let ti = 0; ti < tasks.length; ti++) {
    const task = tasks[ti];
    const testCases = allCases[ti];

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`[${task.id}] ${task.title}`);
    console.log(`${'─'.repeat(70)}`);

    const caseReports: CaseReport[] = [];

    for (const tc of testCases) {
      console.log(`\n  ▸ ${tc.name}`);
      if (tc.note) console.log(`    (${tc.note})`);
      if (tc.expectedScore !== undefined) {
        console.log(`    Ожидается: ${tc.expectedScore}/${task.maxScore}`);
      }

      const runs: RunResult[] = [];
      for (let r = 0; r < RUNS; r++) {
        process.stdout.write(`    Прогон ${r + 1}/${RUNS}... `);
        const result = await callApi(task, tc.text);
        runs.push(result);
        if (result.error) {
          console.log(`❌ ${result.error}`);
        } else {
          console.log(`→ ${result.score}/${task.maxScore}`);
        }
      }

      const stats = calcStats(runs);
      const notes: string[] = [];
      let verdict: 'OK' | 'WARN' | 'FAIL' = 'OK';

      if (tc.expectedScore !== undefined) {
        const diff = Math.abs(stats.avg - tc.expectedScore);
        if (diff > 3) {
          notes.push(
            `❌ Расхождение с ожидаемым: ${stats.avg.toFixed(1)} vs ${tc.expectedScore} (${diff.toFixed(1)})`
          );
          verdict = 'FAIL';
        } else if (diff > 1) {
          notes.push(
            `⚠️  Расхождение с ожидаемым: ${stats.avg.toFixed(1)} vs ${tc.expectedScore} (${diff.toFixed(1)})`
          );
          verdict = 'WARN';
        }
      }

      if (stats.max - stats.min > 2) {
        notes.push(`⚠️  Нестабильно: разброс ${stats.min}–${stats.max}`);
        if (verdict === 'OK') verdict = 'WARN';
      }

      if (runs.some((r) => r.error)) {
        notes.push(`❌ Ошибка API в одном из прогонов`);
        verdict = 'FAIL';
      }

      caseReports.push({
        name: tc.name,
        expectedScore: tc.expectedScore,
        note: tc.note,
        runs,
        avgScore: stats.avg,
        minScore: stats.min,
        maxScore: stats.max,
        stdev: stats.stdev,
        verdict,
        notes,
      });

      // Краткая детализация прогона
      const firstRun = runs[0];
      if (!firstRun.error) {
        const criteriaStr = firstRun.criteria
          .map((c) => `${c.code}=${c.score}/${c.maxScore}`)
          .join('  ');
        console.log(`    Критерии: ${criteriaStr}`);
        if (firstRun.errorsFound.length > 0) {
          console.log(`    Ошибок найдено: ${firstRun.errorsFound.length}`);
        }
      }

      for (const n of notes) console.log(`    ${n}`);
    }

    reports.push({
      id: task.id,
      title: task.title,
      maxScore: task.maxScore,
      cases: caseReports,
    });
  }

  // ---------- ИТОГОВЫЙ ОТЧЁТ ----------
  console.log(`\n\n${'='.repeat(70)}`);
  console.log('ИТОГОВЫЙ ОТЧЁТ');
  console.log('='.repeat(70));

  let okCount = 0, warnCount = 0, failCount = 0;

  for (const r of reports) {
    console.log(`\n[${r.id}] ${r.title}`);
    for (const c of r.cases) {
      const icon = c.verdict === 'OK' ? '✅' : c.verdict === 'WARN' ? '⚠️ ' : '❌';
      const exp =
        c.expectedScore !== undefined ? ` (ожидалось ${c.expectedScore})` : '';
      console.log(
        `  ${icon} ${c.name}: ${c.avgScore.toFixed(1)}/${r.maxScore}${exp}`
      );
      for (const n of c.notes) console.log(`     ${n}`);

      if (c.verdict === 'OK') okCount++;
      else if (c.verdict === 'WARN') warnCount++;
      else failCount++;
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Итого тестов: ${okCount + warnCount + failCount}`);
  console.log(`  ✅ OK:   ${okCount}`);
  console.log(`  ⚠️  WARN: ${warnCount}`);
  console.log(`  ❌ FAIL: ${failCount}`);
  console.log('='.repeat(70));

  // ---------- СОХРАНЕНИЕ ----------
  const outDir = path.join(process.cwd(), 'validation-reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  // Полный JSON со всеми деталями для анализа
  const jsonPath = path.join(outDir, `full-report-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(reports, null, 2), 'utf-8');

  // Читаемый текстовый отчёт
  const txtPath = path.join(outDir, `full-report-${timestamp}.txt`);
  let txt = `ПОЛНАЯ ВАЛИДАЦИЯ ЗАДАНИЙ\n${new Date().toISOString()}\n\n`;

  for (const r of reports) {
    txt += `\n${'='.repeat(70)}\n[${r.id}] ${r.title} (макс ${r.maxScore})\n${'='.repeat(70)}\n`;

    for (const c of r.cases) {
      txt += `\n--- ${c.name} ---\n`;
      if (c.note) txt += `Заметка: ${c.note}\n`;
      if (c.expectedScore !== undefined) {
        txt += `Ожидаемый балл: ${c.expectedScore}\n`;
      }
      txt += `Фактический балл: ${c.avgScore.toFixed(1)} (${c.minScore}–${c.maxScore}, σ=${c.stdev.toFixed(1)})\n`;
      txt += `Вердикт: ${c.verdict}\n`;

      for (let i = 0; i < c.runs.length; i++) {
        const run = c.runs[i];
        txt += `\n  Прогон ${i + 1}: ${run.score}/${r.maxScore}\n`;
        if (run.error) {
          txt += `    ОШИБКА: ${run.error}\n`;
          continue;
        }
        txt += `    Summary: ${run.summary}\n`;
        txt += `    Критерии:\n`;
        for (const cr of run.criteria) {
          txt += `      ${cr.code} ${cr.name}: ${cr.score}/${cr.maxScore} — ${cr.comment}\n`;
        }
        if (run.errorsFound.length > 0) {
          txt += `    Найденные ошибки:\n`;
          for (const e of run.errorsFound) {
            txt += `      • ${e}\n`;
          }
        } else {
          txt += `    Ошибок не найдено\n`;
        }
        txt += `    Рекомендации: ${run.recommendations}\n`;
      }
    }
  }

  fs.writeFileSync(txtPath, txt, 'utf-8');

  console.log(`\nОтчёты сохранены:`);
  console.log(`  JSON (для анализа): ${jsonPath}`);
  console.log(`  TXT  (читаемый):    ${txtPath}\n`);
}

main().catch((e) => {
  console.error('Фатальная ошибка:', e);
  process.exit(1);
});
