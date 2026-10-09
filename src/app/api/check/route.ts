import { checkText } from 'fixnow';
import { jsonrepair } from 'jsonrepair';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ============================================================
// УТИЛИТЫ
// ============================================================

function clamp(num: number, min: number, max: number): number {
  return Math.min(Math.max(num, min), max);
}

function countWords(text: string): number {
  const cleaned = text
    .replace(/\b[А-ЯЁA-Z]\.\s?[А-ЯЁA-Z]\.\s?[А-ЯЁ][а-яё]+/g, 'WORD')
    .replace(/\d+/g, '')
    .replace(/[.,!?;:()"«»—-]/g, ' ')
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function majority<T extends string>(values: T[]): T | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T = values[0];
  let bestCount = 0;
  for (const [v, c] of counts.entries()) {
    if (c > bestCount) {
      bestCount = c;
      best = v;
    }
  }
  return best;
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function checkSpelling(
  text: string
): Promise<{ quote: string; explanation: string }[]> {
  try {
    const issues = await checkText(text, { language: 'ru', suggestions: false });
    return (issues ?? []).map((issue: any) => ({
      quote: String(issue.word ?? issue.original ?? issue.text ?? '').trim(),
      explanation: 'Слово не найдено в словаре русского языка.',
    }));
  } catch (err) {
    console.error('Spellcheck error:', err);
    return [];
  }
}

function checkPunctuation(
  text: string
): { quote: string; explanation: string }[] {
  const errors: { quote: string; explanation: string }[] = [];
  const thinkThat =
    /(я думаю|я считаю|он сказал|она сказала|мы думаем|я знаю|он понял)\s+что\b/gi;
  for (const m of text.matchAll(thinkThat)) {
    errors.push({ quote: m[0], explanation: 'Перед союзом «что» нужна запятая.' });
  }
  const seeHow =
    /(увидел|увидела|услышал|услышала|заметил|почувствовал|смотрел)\s+как\b/gi;
  for (const m of text.matchAll(seeHow)) {
    errors.push({ quote: m[0], explanation: 'Перед союзом «как» нужна запятая.' });
  }
  const whichClause = /\s+который\b/gi;
  for (const m of text.matchAll(whichClause)) {
    const idx = m.index ?? 0;
    const before = text.slice(Math.max(0, idx - 1), idx);
    if (before !== ',') {
      errors.push({
        quote: text.slice(Math.max(0, idx - 25), idx + 15).trim(),
        explanation: 'Перед союзным словом «который» нужна запятая.',
      });
    }
  }
  const contrast = /(\S)\s+(но|а|однако)\s+/gi;
  for (const m of text.matchAll(contrast)) {
    if (!/[,.!?;:]/.test(m[1])) {
      errors.push({
        quote: m[0].trim(),
        explanation: `Перед союзом «${m[2]}» нужна запятая.`,
      });
    }
  }
  return errors;
}

function sanitizeJsonText(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u00A0]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

function extractJson(text: string): any {
  const cleaned = sanitizeJsonText(text);
  try { return JSON.parse(cleaned); } catch {}
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch ? jsonMatch[0] : cleaned;
  try { return JSON.parse(candidate); } catch {}
  try { return JSON.parse(jsonrepair(candidate)); } catch (e: any) {
    throw new Error(`Не удалось распарсить JSON: ${e?.message ?? 'ошибка'}`);
  }
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[«»"'`]/g, '').replace(/\s+/g, ' ').trim();
}
function normalizeStrict(s: string): string {
  return s.toLowerCase().replace(/[«»"'`]/g, '').replace(/\s+/g, ' ').trim();
}

function extractStudentAnswer(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/ответ\s*[:\-–—]\s*(.+)/i);
    if (m) return m[1].trim();
  }
  return lines.length > 0 ? lines[lines.length - 1] : '';
}

function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c)))
    .replace(/[ё]/g, 'е')
    .replace(/[х]/g, 'x')
    .replace(/[у]/g, 'y')
    .replace(/[–—−]/g, '-')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\s+/g, '')
    .replace(/\.(?=[)\]}]*$)/g, '')
    .replace(/[.,;:]+$/, '')
    .trim();
}

function answerMatchesLocal(studentAnswer: string, correctAnswers: string[]): boolean {
  if (!studentAnswer || correctAnswers.length === 0) return false;
  const norm = normalizeAnswer(studentAnswer);
  if (!norm) return false;
  return correctAnswers.some((ca) => normalizeAnswer(ca) === norm);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

function quoteExists(quote: string, studentText: string): boolean {
  if (!quote || quote.trim().length < 2) return false;
  const qNorm = normalizeForMatch(quote);
  const tNorm = normalizeForMatch(studentText);
  const qWordCount = qNorm.split(/\s+/).filter(Boolean).length;
  if (qWordCount > 30) return false;
  if (tNorm.includes(qNorm)) return true;
  const qTokens = qNorm.split(/\s+/).filter((t) => t.length > 2);
  if (qTokens.length === 0) return tNorm.includes(qNorm);
  const tTokens = tNorm.split(/\s+/).filter(Boolean);
  const tSet = new Set(tTokens);
  const matched = qTokens.filter((qt) => {
    if (tSet.has(qt)) return true;
    return tTokens.some((tt) => Math.abs(tt.length - qt.length) <= 2 && levenshtein(tt, qt) <= 1);
  }).length;
  const ratio = matched / qTokens.length;
  if (qTokens.length <= 2) return ratio === 1;
  if (qTokens.length <= 5) return ratio >= 0.8;
  return ratio >= 0.7;
}

function quoteExistsStrict(quote: string, studentText: string): boolean {
  if (!quote || quote.trim().length < 2) return false;
  const q = normalizeStrict(quote);
  const t = normalizeStrict(studentText);
  if (q.split(/\s+/).filter(Boolean).length > 30) return false;
  return t.includes(q);
}

const STRICT_CATEGORIES = ['пунктуация', 'орфография', 'грамматика', 'речь'];
function isStrictCategory(category: string): boolean {
  const c = category.toLowerCase();
  return STRICT_CATEGORIES.some((sc) => c.includes(sc));
}

// ============================================================
// АВТОРИЗАЦИЯ И ВЫЗОВ
// ============================================================

async function getGigaChatAccessToken(authKey: string): Promise<string> {
  const cleanAuthKey = authKey.trim().replace(/^["']|["']$/g, '');
  const rqUID = crypto.randomUUID();
  const response = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      RqUID: rqUID,
      Authorization: `Basic ${cleanAuthKey}`,
    },
    body: new URLSearchParams({ scope: 'GIGACHAT_API_PERS' }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ошибка авторизации GigaChat (${response.status}): ${errText}`);
  }
  const data = await response.json();
  return data.access_token;
}

async function callGigaChat(payload: any, accessToken: string, maxRetries = 3): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response;
    try {
      response = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (netErr) {
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      throw netErr;
    }
    const raw = await response.text();
    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      await sleep(Math.pow(2, attempt) * 1000);
      continue;
    }
    if (!response.ok) {
      if (raw.includes('Model not found') || raw.includes('No such model')) {
        const fallbackPayload = { ...payload, model: 'GigaChat-2' };
        const fb = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(fallbackPayload),
        });
        if (!fb.ok) throw new Error(`Ошибка GigaChat API (${fb.status}): ${await fb.text()}`);
        const fd = await fb.json();
        return fd.choices[0].message.content;
      }
      throw new Error(`Ошибка GigaChat API (${response.status}): ${raw}`);
    }
    const aiData = JSON.parse(raw);
    return aiData.choices[0].message.content;
  }
  throw new Error('GigaChat: все попытки исчерпаны');
}

async function askGigaChatIfAnswersEquivalent(
  studentAnswer: string,
  correctAnswers: string[],
  accessToken: string
): Promise<boolean> {
  const systemPrompt = `Ты — формальный компаратор. Ты НЕ решаешь задачу. Ты сравниваешь два ответа и определяешь, эквивалентны ли они математически.
Отвечай СТРОГО валидным JSON без markdown:
{"equivalent": true|false, "reason": "короткое пояснение до 100 символов"}
ПРАВИЛА:
- Игнорируй различия формы записи: (a; b), a < x < b, x ∈ (a; b) — одно и то же.
- Игнорируй порядок пар: (1; 4), (-1; 4) = (-1; 4), (1; 4).
- Игнорируй десятичный разделитель: 0.5 = 0,5.
- Учитывай числовые различия: (-1; 2) ≠ (-0.5; 2).
- Учитывай потерю корня: (1; 4) ≠ (-1; 4), (1; 4).`;

  const userPrompt = `Эталонные ответы (любой из них — правильный):
${correctAnswers.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Ответ ученика:
${studentAnswer}

Эквивалентен ли ответ ученика хотя бы одному эталонному?`;

  const payload: any = {
    model: 'GigaChat-2-Max',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.01,
    top_p: 0.1,
    max_tokens: 300,
  };

  try {
    const raw = await callGigaChat(payload, accessToken, 2);
    const parsed = extractJson(raw);
    return Boolean(parsed?.equivalent);
  } catch (e: any) {
    console.error('Equivalence check failed:', e?.message ?? e);
    return false;
  }
}

// ============================================================
// АДАПТИВНЫЙ МНОГОПРОГОННЫЙ АНАЛИЗ
// ============================================================

// Проверяем согласие между прогонами
function hasAgreement(parsed: any[], isMath: boolean): boolean {
  if (parsed.length < 3) return false;

  if (isMath) {
    // Совпадение errorType + solutionIsComplete
    const keys = parsed.map((r) => `${r.errorType}|${r.solutionIsComplete}`);
    return new Set(keys).size === 1;
  }

  // Русский: СК1-СК4 — разброс по каждому критерию ≤ 1
  const criteriaCodes = ['СК1', 'СК2', 'СК3', 'СК4'];
  for (const code of criteriaCodes) {
    const scores = parsed
      .map((r) => {
        const arr = Array.isArray(r.criteria) ? r.criteria : [];
        const c = arr.find((x: any) => String(x.code) === code);
        return typeof c?.score === 'number' ? c.score : null;
      })
      .filter((v): v is number => v !== null);
    if (scores.length < 2) continue;
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    if (max - min > 1) return false;
  }
  return true;
}

interface AdaptiveResult {
  parsed: any[];
  raw: string[];
  runsDone: number;
  agreed: boolean;
}

async function runAdaptive(
  payload: any,
  accessToken: string,
  isMath: boolean,
  minRuns: number,
  maxRuns: number,
  delayMs: number,
  onProgress: (percentDelta: number, message: string) => void
): Promise<AdaptiveResult> {
  const parsed: any[] = [];
  const raw: string[] = [];

  // Первая порция — minRuns
  for (let i = 0; i < minRuns; i++) {
    try {
      const r = await callGigaChat(payload, accessToken);
      raw.push(r);
      try {
        parsed.push(extractJson(r));
      } catch (e) {
        console.error(`Run ${i + 1} parse failed`, e);
      }
      onProgress(0, `Прогон ${i + 1} из ${minRuns}…`);
    } catch (e: any) {
      console.error(`Run ${i + 1} failed`, e?.message ?? e);
      onProgress(0, `Прогон ${i + 1} не удался, повторяем…`);
    }
    if (i < minRuns - 1) await sleep(delayMs);
  }

  // Добор до валидных 2, если первые упали
  let extraAttempts = 0;
  while (parsed.length < 2 && extraAttempts < 2) {
    try {
      await sleep(delayMs);
      const r = await callGigaChat(payload, accessToken);
      raw.push(r);
      try {
        parsed.push(extractJson(r));
      } catch (e) {
        console.error('Extra parse failed', e);
      }
      onProgress(0, `Дополнительный прогон…`);
    } catch (e) {
      console.error('Extra failed', e);
    }
    extraAttempts++;
  }

  if (parsed.length < 2) {
    return { parsed, raw, runsDone: parsed.length, agreed: false };
  }

  // Проверяем согласие
  if (hasAgreement(parsed, isMath)) {
    return { parsed, raw, runsDone: parsed.length, agreed: true };
  }

  // Не согласны — добираем до maxRuns
  console.log(`Согласие не достигнуто (${parsed.length} прогонов), добираем`);
  while (parsed.length < maxRuns) {
    try {
      await sleep(delayMs);
      const r = await callGigaChat(payload, accessToken);
      raw.push(r);
      try {
        parsed.push(extractJson(r));
      } catch (e) {
        console.error('Disagreement extra parse failed', e);
      }
      onProgress(0, `Дополнительный прогон (${parsed.length} из ${maxRuns})…`);
    } catch (e) {
      console.error('Disagreement extra failed', e);
      break;
    }
    if (hasAgreement(parsed, isMath)) {
      return { parsed, raw, runsDone: parsed.length, agreed: true };
    }
  }

  return { parsed, raw, runsDone: parsed.length, agreed: hasAgreement(parsed, isMath) };
}

// ============================================================
// SSE ОБРАБОТЧИК
// ============================================================

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      const progress = (percent: number, message: string) => {
        send('progress', { percent: Math.round(percent), message });
      };

      try {
        const body = await request.json();
        const { task, userResponse } = body;

        if (!task || !task.criteria || !Array.isArray(task.criteria)) {
          send('error', { message: 'Некорректное задание' });
          controller.close();
          return;
        }
        if (!userResponse || userResponse.trim().length === 0) {
          send('error', { message: 'Ответ ученика не может быть пустым' });
          controller.close();
          return;
        }

        progress(3, 'Проверка входных данных…');

        const rawAuthKey = process.env.GIGACHAT_AUTH_KEY;

        if (!rawAuthKey || rawAuthKey.includes('ваш_') || rawAuthKey.trim() === '') {
          await sleep(1000);
          send('result', {
            totalScore: Math.floor(task.maxScore * 0.75),
            maxScore: task.maxScore,
            summary: 'Тестовый режим: ключ API не найден в .env.local',
            criteria: task.criteria.map((c: any) => ({
              code: c.code,
              name: c.name,
              score: Math.max(0, c.maxScore - 1),
              maxScore: c.maxScore,
              comment: `По критерию ${c.code} условие выполнено частично.`,
            })),
            errorsFound: ['Пример недочета в ответе'],
            recommendations: 'Укажите настоящий GIGACHAT_AUTH_KEY в файле .env.local',
          });
          controller.close();
          return;
        }

        progress(6, 'Авторизация в GigaChat…');
        const accessToken = await getGigaChatAccessToken(rawAuthKey);

        const isMath =
          task.subject?.toLowerCase().includes('матем') || task.id?.startsWith('math');

        const wordCount = countWords(userResponse);
        const isRussian = !isMath;

        // ---------- 1. ДЕТЕРМИНИРОВАННАЯ ПРОВЕРКА ОТВЕТА ----------
        let mathAnswerText = '';
        let mathAnswerIsCorrect = false;

        if (isMath) {
          progress(8, 'Проверка ответа…');
          mathAnswerText = extractStudentAnswer(userResponse);
          const correctAnswers: string[] = Array.isArray(task.correctAnswers)
            ? task.correctAnswers
            : [];
          mathAnswerIsCorrect = answerMatchesLocal(mathAnswerText, correctAnswers);

          if (!mathAnswerIsCorrect && mathAnswerText && correctAnswers.length > 0) {
            progress(9, 'Сверка формы записи ответа…');
            await sleep(1500);
            mathAnswerIsCorrect = await askGigaChatIfAnswersEquivalent(
              mathAnswerText,
              correctAnswers,
              accessToken
            );
          }
        }

        // ---------- 2. СИСТЕМНЫЙ ПРОМПТ ----------
        const systemPrompt = isMath
          ? `Ты — формальный классификатор математических решений ОГЭ. Ты НЕ выставляешь баллы. Ты отвечаешь на два вопроса о решении ученика и возвращаешь ТОЛЬКО JSON.

═══════════════════════════════════════════
ЧТО ОТ ТЕБЯ ТРЕБУЕТСЯ
═══════════════════════════════════════════
1. Классифицировать ГЛАВНУЮ ошибку в решении, если она есть.
2. Определить, доведено ли решение до конца.
3. Описать найденные ошибки с ТОЧНЫМИ цитатами из текста ученика.

═══════════════════════════════════════════
КЛАССИФИКАЦИЯ ОШИБОК (errorType)
═══════════════════════════════════════════
• "none"        — решение полностью верное, ошибок нет.
• "arithmetic"  — вычислительная ошибка или описка: неверно посчитан дискриминант, неправильно выполнено арифметическое действие, описка в коэффициенте, потерян знак при переносе, но МЕТОД решения выбран и применён верно.
• "logical"     — логическая ошибка: неверный метод, потеря случая (например, не рассмотрены оба знака при извлечении корня), неверное применение формулы, ложное следствие, потеря ОДЗ.

ВАЖНО: если ученик получил неверный ответ из-за пропущенного случая / неверной формулы / ложного вывода — это "logical", а НЕ "arithmetic". "arithmetic" — только если метод верный, а ошибка чисто счётная.

═══════════════════════════════════════════
ПОЛНОТА РЕШЕНИЯ (solutionIsComplete)
═══════════════════════════════════════════
• true  — приведены шаги решения, а не только финальный ответ.
• false — дан только финальный ответ без обоснования ИЛИ решение обрывается.

═══════════════════════════════════════════
ЖЕЛЕЗНЫЕ ПРАВИЛА
═══════════════════════════════════════════
1. Каждая ошибка в errorsFound ОБЯЗАНА содержать "quote" — ТОЧНУЮ подстроку из текста ученика.
2. Если не можешь воспроизвести точную цитату — не добавляй ошибку.
3. Одна и та же ошибка не считается дважды.
4. Ответ — один валидный JSON без markdown.
5. НЕ выставляй баллы.

ФОРМАТ:
{
  "errorType": "none" | "arithmetic" | "logical",
  "solutionIsComplete": true | false,
  "summary": "1–2 предложения о решении ученика.",
  "errorsFound": [
    { "category": "Вычислительная ошибка" | "Логическая ошибка" | "Потеря ОДЗ",
      "quote": "точная подстрока",
      "explanation": "кратко" }
  ],
  "recommendations": "1–3 совета."
}
ЕСЛИ ошибок нет — "errorsFound": [] и "errorType": "none".`
          : `Ты — детерминированный классификатор ответов ОГЭ по русскому языку. Возвращай ТОЛЬКО JSON.

ЖЕЛЕЗНЫЕ ПРАВИЛА:
1. Каждая ошибка в errorsFound ОБЯЗАНА содержать "quote" — ТОЧНУЮ подстроку, скопированную символ-в-символ из текста ученика, ВКЛЮЧАЯ ЗНАКИ ПРЕПИНАНИЯ.
2. Если не можешь воспроизвести точную цитату — ошибки НЕ существует.
3. Запрещено вставлять/убирать знаки препинания в цитате.
4. Запрещено считать ошибкой фрагмент из задания.
5. Запрещено выдавать стилистические предпочтения за нарушения норм.
6. Одна и та же ошибка не считается дважды.
7. Ответ — один валидный JSON без markdown.

ПРАВИЛО ОБЪЁМА: если wordCount < 70 → все критерии = 0.

КРИТЕРИИ (оценивай ТОЛЬКО СК1–СК4 — смысловые):
СК1 (0–1): 1 — прямой ответ на вопрос; 0 — нет.
СК2 (0–3): 3 — 2 примера из текста; 2 — 1 из текста; 1 — только жизненный опыт; 0 — нет.
СК3 (0–2): 2 — 0 логических ошибок; 1 — 1–2; 0 — 3+.
СК4 (0–1): 1 — трёхчастная композиция без ошибок; 0 — иначе.

ВНИМАНИЕ: критерии ГК1–ГК4 и ФК1 ты НЕ оцениваешь — их посчитает сервер по найденным ошибкам.

ПРОЦЕДУРА ПОИСКА:
1. Орфография: -тся/-ться, -тца, -нн-, чередующиеся корни, «не», приставки, Ь после шипящих.
2. Пунктуация: однородные, союзы, вводные, обособленные обороты.
3. Грамматика и речь: согласование, падежи, тавтология, плеоназм.
4. Факты: автор, персонаж, детали.

ФОРМАТ:
{
  "summary": "1–3 предложения.",
  "criteria": [
    { "code": "СК1", "name": "…", "score": 1, "maxScore": 1, "comment": "…" }
  ],
  "errorsFound": [
    { "category": "Орфография" | "Пунктуация" | "Грамматика" | "Речь" | "Фактическая ошибка",
      "quote": "точная подстрока",
      "explanation": "кратко" }
  ],
  "recommendations": "2–4 совета."
}
ЕСЛИ ошибок нет — "errorsFound": [].`;

        const userPrompt = `
ПРЕДМЕТ: ${task.subject}
ЗАДАНИЕ: ${task.title}
WORD_COUNT: ${wordCount}

УСЛОВИЕ И ТЕКСТ:
"""
${task.prompt}
"""

КРИТЕРИИ:
${JSON.stringify(
  task.criteria.map((c: any) => ({ code: c.code, name: c.name, maxScore: c.maxScore })),
  null,
  2
)}

ОТВЕТ УЧЕНИКА:
"""
${userResponse}
"""
`;

        const payload: any = {
          model: 'GigaChat-2-Max',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.01,
          top_p: 0.1,
          max_tokens: 4096,
        };

        // ---------- 3. АДАПТИВНЫЕ ПРОГОНЫ ----------
        progress(12, 'Отправка запросов к ИИ…');

        // Прогресс: с 12% до 75% по мере прогонов (макс 5)
        let currentRun = 0;
        const { parsed: parsedResults, runsDone, agreed } = await runAdaptive(
          payload,
          accessToken,
          isMath,
          3,
          5,
          1500,
          (_delta, message) => {
            currentRun++;
            const percent = 12 + Math.min(63, currentRun * 12);
            progress(percent, message);
          }
        );

        if (parsedResults.length === 0) {
          send('error', { message: 'GigaChat не вернул валидных ответов' });
          controller.close();
          return;
        }

        progress(78, agreed ? 'Согласие достигнуто' : 'Дополнительный анализ…');

        // ---------- 4. ОБРАБОТКА ОШИБОК ----------
        const allErrors: any[] = [];
        for (const pr of parsedResults) {
          const arr = Array.isArray(pr.errorsFound) ? pr.errorsFound : [];
          allErrors.push(...arr);
        }

        const normalizedAllErrors = allErrors.map((e: any) => {
          if (typeof e === 'string') {
            const m = e.match(/[«"'`]([^«"'`]+)[»"'`]/);
            const catMatch = e.match(/\[([^\]]+)\]/);
            return {
              category: catMatch?.[1] ?? 'Прочее',
              quote: m?.[1] ?? '',
              explanation: e,
            };
          }
          return {
            category: String(e.category ?? 'Прочее'),
            quote: String(e.quote ?? ''),
            explanation: String(e.explanation ?? ''),
          };
        });

        const taskNorm = normalizeForMatch(task.prompt || '');

        const verifiedErrors = (() => {
          const seen = new Set<string>();
          const out: typeof normalizedAllErrors = [];
          for (const e of normalizedAllErrors) {
            const strict = isStrictCategory(e.category);
            const exists = strict
              ? quoteExistsStrict(e.quote, userResponse)
              : quoteExists(e.quote, userResponse);
            if (!exists) continue;
            const eNorm = normalizeForMatch(e.quote);
            if (eNorm.length > 5 && taskNorm.includes(eNorm)) continue;
            const key = e.category.toLowerCase() + '||' + normalizeStrict(e.quote);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(e);
          }
          return out;
        })();

        if (isRussian) {
          const [spellingErrors, punctuationErrors] = await Promise.all([
            checkSpelling(userResponse),
            Promise.resolve(checkPunctuation(userResponse)),
          ]);
          const seenQuotes = new Set(verifiedErrors.map((e: any) => normalizeStrict(e.quote)));
          for (const err of spellingErrors) {
            if (!err.quote) continue;
            if (/^[А-ЯЁA-Z]/.test(err.quote)) continue;
            const eNorm = normalizeForMatch(err.quote);
            if (eNorm.length > 3 && taskNorm.includes(eNorm)) continue;
            const strict = normalizeStrict(err.quote);
            if (seenQuotes.has(strict)) continue;
            seenQuotes.add(strict);
            verifiedErrors.push({
              category: 'Орфография',
              quote: err.quote,
              explanation: err.explanation,
            });
          }
          for (const err of punctuationErrors) {
            if (!err.quote) continue;
            const strict = normalizeStrict(err.quote);
            if (seenQuotes.has(strict)) continue;
            seenQuotes.add(strict);
            verifiedErrors.push({
              category: 'Пунктуация',
              quote: err.quote,
              explanation: err.explanation,
            });
          }
        }

        const countsByCategory: Record<string, number> = {};
        for (const e of verifiedErrors) {
          const key = e.category.toLowerCase();
          countsByCategory[key] = (countsByCategory[key] ?? 0) + 1;
        }

        const scoreByTable = (n: number): number => {
          if (n === 0) return 3;
          if (n <= 2) return 2;
          if (n <= 4) return 1;
          return 0;
        };

        const countFor = (code: string, source: Record<string, number>): number => {
          const map: Record<string, string[]> = {
            ГК1: ['орфография', 'орфографич'],
            ГК2: ['пунктуация', 'пунктуацион'],
            ГК3: ['грамматика', 'грамматич'],
            ГК4: ['речь', 'речев'],
            ФК1: ['фактическая', 'факт'],
          };
          const keys = map[code] ?? [];
          return Object.entries(source)
            .filter(([k]) => keys.some((p) => k.includes(p)))
            .reduce((sum, [, v]) => sum + v, 0);
        };

        progress(88, 'Подсчёт баллов…');

        // ========================================================
        // МАТЕМАТИКА
        // ========================================================
        if (isMath) {
          const errorTypes = parsedResults
            .map((pr) => pr.errorType)
            .filter((v: any) => v === 'none' || v === 'arithmetic' || v === 'logical');
          const completeness = parsedResults
            .map((pr) => pr.solutionIsComplete)
            .filter((v: any) => typeof v === 'boolean');

          const majErrorType =
            (majority(errorTypes as ('none' | 'arithmetic' | 'logical')[]) as any) ??
            'logical';
          const majComplete =
            majority(completeness.map((v) => String(v)) as ('true' | 'false')[]) === 'true';

          let mathScore: number;
          let mathComment: string;

          if (!mathAnswerText) {
            mathScore = 0;
            mathComment = 'В работе отсутствует итоговый ответ.';
          } else if (mathAnswerIsCorrect) {
            if (majErrorType === 'none') {
              mathScore = 2;
              mathComment = 'Ответ совпадает с правильным, решение полное.';
            } else {
              mathScore = 1;
              mathComment = 'Ответ совпадает с правильным, но решение содержит ошибки.';
            }
          } else {
            if (majErrorType === 'arithmetic' && majComplete) {
              mathScore = 1;
              mathComment =
                'Ответ не совпадает с правильным, метод верный, ошибка вычислительного характера — 1 балл.';
            } else if (majErrorType === 'logical') {
              mathScore = 0;
              mathComment =
                'Ответ не совпадает с правильным, логическая ошибка (неверный метод / потерянный случай) — 0 баллов.';
            } else {
              mathScore = 0;
              mathComment = 'Ответ не совпадает с правильным, решение неполное или с ошибками.';
            }
          }

          if (mathScore < 2 && verifiedErrors.length === 0) {
            verifiedErrors.push({
              category: majErrorType === 'arithmetic' ? 'Вычислительная ошибка' : 'Логическая ошибка',
              quote: '',
              explanation: !mathAnswerText
                ? 'В работе отсутствует итоговый ответ.'
                : !mathAnswerIsCorrect
                ? `Ответ «${mathAnswerText}» не совпадает с правильным.`
                : 'В решении есть недочёты.',
            });
          }

          const finalCriteria = task.criteria.map((c: any) => {
            if (c.code === 'М1') {
              return {
                code: c.code,
                name: c.name,
                score: mathScore,
                maxScore: c.maxScore,
                comment: mathComment,
              };
            }
            return {
              code: c.code,
              name: c.name,
              score: 0,
              maxScore: c.maxScore,
              comment: 'Не применимо.',
            };
          });

          const isPerfect = mathScore === task.maxScore;
          const bestMathRun = parsedResults[0];

          progress(98, 'Формирование ответа…');

          send('result', {
            totalScore: mathScore,
            maxScore: task.maxScore,
            summary:
              String(bestMathRun.summary ?? '').trim() ||
              (isPerfect ? 'Работа выполнена идеально!' : 'Работа проверена экспертом.'),
            criteria: finalCriteria,
            errorsFound: verifiedErrors.map((e: any) => {
              const quote = String(e.quote ?? '').trim();
              return quote ? `[${e.category}] «${quote}» — ${e.explanation}` : `[${e.category}] ${e.explanation}`;
            }),
            recommendations: isPerfect
              ? 'Отличная работа! Все критерии выполнены полностью.'
              : String(bestMathRun.recommendations ?? '').trim() ||
                'Проверьте решение по критериям ФПИ.',
          });
          controller.close();
          return;
        }

        // ========================================================
        // РУССКИЙ ЯЗЫК
        // ========================================================
        const criteriaByCode = new Map<string, number[]>();
        for (const pr of parsedResults) {
          const arr = Array.isArray(pr.criteria) ? pr.criteria : [];
          for (const c of arr) {
            const code = String(c.code ?? '');
            const sc = typeof c.score === 'number' ? c.score : 0;
            if (!criteriaByCode.has(code)) criteriaByCode.set(code, []);
            criteriaByCode.get(code)!.push(sc);
          }
        }

        const medianScores = new Map<string, number>();
        for (const [code, values] of criteriaByCode.entries()) {
          medianScores.set(code, median(values));
        }

        const medianTotal = task.criteria.reduce(
          (sum: number, c: any) => sum + (medianScores.get(c.code) ?? 0),
          0
        );

        let bestResult = parsedResults[0];
        let bestDist = Infinity;
        for (const pr of parsedResults) {
          const arr = Array.isArray(pr.criteria) ? pr.criteria : [];
          const total = arr.reduce(
            (s: number, c: any) => s + (typeof c.score === 'number' ? c.score : 0),
            0
          );
          const dist = Math.abs(total - medianTotal);
          if (dist < bestDist) {
            bestDist = dist;
            bestResult = pr;
          }
        }

        const bestCriteriaInput = Array.isArray(bestResult.criteria)
          ? bestResult.criteria
          : [];

        const finalCriteria = task.criteria.map((c: any) => {
          const bestFound = bestCriteriaInput.find(
            (item: any) => item.code === c.code || item.name === c.name
          );
          const medianScore = medianScores.get(c.code) ?? 0;
          const modelScore = clamp(Math.round(medianScore), 0, c.maxScore);

          let finalScore: number;
          let finalComment: string;

          if (wordCount < 70) {
            finalScore = 0;
            finalComment = 'Объём менее 70 слов — критерий обнулён.';
          } else if (['ГК1', 'ГК2', 'ГК3', 'ГК4'].includes(c.code)) {
            const verifiedCount = countFor(c.code, countsByCategory);
            finalScore = scoreByTable(verifiedCount);
            finalComment =
              verifiedCount === 0
                ? 'Ошибок по данному критерию не обнаружено.'
                : `Подтверждённых ошибок: ${verifiedCount}.`;
          } else if (c.code === 'ФК1') {
            const verifiedCount = countFor('ФК1', countsByCategory);
            finalScore = verifiedCount > 0 ? 0 : 1;
            finalComment =
              verifiedCount > 0
                ? `Обнаружено фактических ошибок: ${verifiedCount}.`
                : 'Фактических ошибок не обнаружено.';
          } else {
            finalScore = modelScore;
            finalComment = bestFound?.comment ?? `Оценка по критерию ${c.code}.`;
          }

          return {
            code: c.code,
            name: c.name,
            score: finalScore,
            maxScore: c.maxScore,
            comment: finalComment,
          };
        });

        const calculatedTotalScore = finalCriteria.reduce(
          (sum: number, item: any) => sum + item.score,
          0
        );
        const isPerfect = calculatedTotalScore === task.maxScore;
        const recs = String(bestResult.recommendations ?? '').trim();

        progress(98, 'Формирование ответа…');

        send('result', {
          totalScore: clamp(calculatedTotalScore, 0, task.maxScore),
          maxScore: task.maxScore,
          summary:
            wordCount < 70
              ? `Объём менее 70 слов (${wordCount}) — все критерии обнулены.`
              : String(bestResult.summary ?? '').trim() ||
                (isPerfect ? 'Работа выполнена идеально!' : 'Работа проверена экспертом.'),
          criteria: finalCriteria,
          errorsFound: verifiedErrors.map((e: any) => {
            const quote = String(e.quote ?? '').trim();
            return quote ? `[${e.category}] «${quote}» — ${e.explanation}` : `[${e.category}] ${e.explanation}`;
          }),
          recommendations: isPerfect
            ? 'Отличная работа! Все критерии выполнены полностью.'
            : recs || 'Обратите внимание на детализацию ответа и критерии ФИПИ.',
        });
        controller.close();
      } catch (error: any) {
        console.error('API Error:', error);
        try {
          send('error', { message: error.message || 'Ошибка сервера' });
        } catch {}
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
