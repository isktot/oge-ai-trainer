//import { NextResponse } from 'next/server';
//
//// Отключаем проверку SSL для работы с сертификатами Минцифры/Сбера
//process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
//
//// Вспомогательная функция ограничения чисел в диапазоне [min, max]
//function clamp(num: number, min: number, max: number): number {
//  return Math.min(Math.max(num, min), max);
//}
//
//// Извлечение JSON с обработкой любых невалидных оберток
//function extractJson(text: string) {
//  try {
//    return JSON.parse(text);
//  } catch (e) {
//    const jsonMatch = text.match(/\{[\s\S]*\}/);
//    if (jsonMatch) {
//      try {
//        return JSON.parse(jsonMatch[0]);
//      } catch (err) {
//        throw new Error('Модель вернула некорректный JSON. Повторите запрос.');
//      }
//    }
//    throw new Error('Не удалось найти JSON-структуру в ответе ИИ.');
//  }
//}
//
//// Получение токена доступа GigaChat API
//async function getGigaChatAccessToken(authKey: string): Promise<string> {
//  const cleanAuthKey = authKey.trim().replace(/^["']|["']$/g, '');
//  const rqUID = crypto.randomUUID();
//
//  const response = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
//    method: 'POST',
//    headers: {
//      'Content-Type': 'application/x-www-form-urlencoded',
//      'Accept': 'application/json',
//      'RqUID': rqUID,
//      'Authorization': `Basic ${cleanAuthKey}`,
//    },
//    body: new URLSearchParams({ scope: 'GIGACHAT_API_PERS' }),
//  });
//
//  if (!response.ok) {
//    const errText = await response.text();
//    throw new Error(`Ошибка авторизации GigaChat (${response.status}): ${errText}`);
//  }
//
//  const data = await response.json();
//  return data.access_token;
//}
//
//export async function POST(request: Request) {
//  try {
//    const body = await request.json();
//    const { task, userResponse } = body;
//
//    if (!userResponse || userResponse.trim().length === 0) {
//      return NextResponse.json(
//        { error: 'Ответ ученика не может быть пустым' },
//        { status: 400 }
//      );
//    }
//
//    const rawAuthKey = process.env.GIGACHAT_AUTH_KEY;
//
//    // Режим эмуляции, если ключ не задан
//    if (!rawAuthKey || rawAuthKey.includes('ваш_') || rawAuthKey.trim() === '') {
//      await new Promise((res) => setTimeout(res, 1000));
//      return NextResponse.json({
//        totalScore: Math.floor(task.maxScore * 0.75),
//        maxScore: task.maxScore,
//        summary: "Тестовый режим: ключ API не найден в .env.local",
//        criteria: task.criteria.map((c: any) => ({
//          code: c.code,
//          name: c.name,
//          score: Math.max(0, c.maxScore - 1),
//          maxScore: c.maxScore,
//          comment: `По критерию ${c.code} условие выполнено частично.`
//        })),
//        errorsFound: ["Пример недочета в ответе"],
//        recommendations: "Укажите настоящий GIGACHAT_AUTH_KEY в файле .env.local"
//      });
//    }
//
//    const accessToken = await getGigaChatAccessToken(rawAuthKey);
//    const isMath = task.subject?.toLowerCase().includes('матем') || task.id?.startsWith('math');
//
//    // ОБНОВЛЕННЫЙ ЖЕСТКИЙ СИСТЕМНЫЙ ПРОМПТ C ПОШАГОВЫМ ЛИНГВИСТИЧЕСКИМ АУДИТОМ
//    const systemPrompt = `Ты — строгий эксперт комиссии ФИПИ по проверке ОГЭ (${isMath ? 'МАТЕМАТИКА' : 'РУССКИЙ ЯЗЫК'}).
//Твоя главная задача — детально выявить ВСЕ ошибки в ответе ученика и строго начислить баллы по критериям.
//
//ОБЯЗАТЕЛЬНАЯ ПРОЦЕДУРА АНАЛИЗА:
//1. Подсчитай точное количество слов в тексте ученика (для русского языка).
//2. Выполни ПОШАГОВЫЙ ЛИНГВИСТИЧЕСКИЙ АУДИТ И ПРОВЕРКУ ФАКТОВ:
//   - Просканируй каждое слово и знак препинания.
//   - Запиши ВСЕ найденные недочеты в массив "errorsFound" с указанием категории ошибки.
//3. Рассчитай баллы по каждому критерию строго согласно правилам снижения.
//4. Верни результат СТРОГО в виде одного валидного JSON-объекта без маркдаун-оберток.
//
//${isMath ? `
//ПРАВИЛА ПО МАТЕМАТИКЕ (Задание 20, max 2 балла):
//- М1 (max 2 балла):
//  * 2 балла: Все преобразования и вычисления верны, получен правильный ответ.
//  * 1 балл: Допущена ОДНА описка/вычислительная ошибка, но ход решения верный.
//  * 0 баллов: Допущено 2+ ошибки, ложная логика, не учтено ОДЗ, или нет ответа.
//` : `
//ПРАВИЛА ПО РУССКОМУ ЯЗЫКУ (Сочинение 13.3 + Грамотность):
//ОБЪЕМ: Если в сочинении МЕНЬШЕ 70 слов — АБСОЛЮТНО ВСЕ КРИТЕРИИ (СК1-СК4, ГК1-ГК4, ФК1) ОБНУЛЯЮТСЯ (выставляется 0 баллов за всё)!
//
//АУДИТ ГРАМОТНОСТИ И ФАКТИЧЕСКОЙ ТОЧНОСТИ (ГК1-ГК4, ФК1):
//Каждая ошибка обязана быть зафиксирована в errorsFound!
//
//- ГК1 (Орфография, max 3 балла):
//  * Выпиши все слова с орфографическими ошибками (напр. "изкусство", "потомучто", "проявляетца").
//  * 3 б. = 0 ошибок; 2 б. = 1-2 ошибки; 1 б. = 3-4 ошибки; 0 б. = 5+ ошибок.
//
//- ГК2 (Пунктуация, max 3 балла):
//  * Выпиши все пропущенные или лишние запятые, тире, двоеточия.
//  * 3 б. = 0 ошибок; 2 б. = 1-2 ошибки; 1 б. = 3-4 ошибки; 0 б. = 5+ ошибок.
//
//- ГК3 (Грамматика, max 3 балла):
//  * Выпиши грамматические нарушения (согласование, деепричастные обороты, формы слов, напр. "повар приготовивший еду и зашел").
//  * 3 б. = 0 ошибок; 2 б. = 1-2 ошибки; 1 б. = 3-4 ошибки; 0 б. = 5+ ошибок.
//
//- ГК4 (Речевые нормы, max 3 балла):
//  * Выпиши речевые и стилистические ошибки, тавтологии, плеоназмы, розговорные слова (напр. "красивые картинки", "прям бьет").
//  * 3 б. = 0 ошибок; 2 б. = 1-2 ошибки; 1 б. = 3-4 ошибки; 0 б. = 5+ ошибок.
//
//- ФК1 (Фактическая точность, max 1 балл):
//  * Проверь точность имен авторов, персонажей, деталей из текста (напр. если автор Домбровский, а ученик написал Чехов — это искажение фактов!).
//  * 1 б. = 0 ошибок; 0 б. = 1+ фактическая ошибка.
//
//КРИТЕРИИ СОЧИНЕНИЯ (СК1-СК4, max 7 баллов):
//- СК1 (max 1 б.): Ответ на вопрос темы дал (1 б.) / не дал (0 б.).
//- СК2 (max 3 б.): 2 примера из текста = 3 б.; 1 из текста = 2 б.; только жизненный = 1 б.; нет = 0 б.
//- СК3 (max 2 б.): Логика и абзацы (0 ошибок = 2 б.; 1-2 ошибки = 1 б.; 3+ = 0 б.).
//- СК4 (max 1 б.): Вступление, основная часть, вывод соблюдены = 1 б.; иначе = 0 б.
//`}
//
//СТРУКТУРА JSON-ОТВЕТА:
//{
//  "stepByStepAnalysis": "Разбор с точным подсчетом слов и описанием ошибок.",
//  "summary": "Краткое резюме проверки.",
//  "criteria": [
//    {
//      "code": "код (СК1, ГК1, ФК1 и т.д.)",
//      "name": "название критерия",
//      "score": number,
//      "maxScore": number,
//      "comment": "Обоснование балла со ссылкой на ошибки."
//    }
//  ],
//  "errorsFound": [
//    "[Орфография] Слово 'изкусство' пишется как 'искусство'",
//    "[Пунктуация] Пропущена запятая перед союзом 'потому что'",
//    "[Фактическая ошибка] Неверно указан автор текста: Чехов вместо Домбровского"
//  ],
//  "recommendations": "Конкретные советы ученику."
//}`;
//
//    const userPrompt = `
//ПРЕДМЕТ: ${task.subject}
//ЗАДАНИЕ ОГЭ: ${task.title}
//
//УСЛОВИЕ ЗАДАНИЯ И ТЕКСТ:
//"""
//${task.prompt}
//"""
//
//МАКСИМАЛЬНЫЙ БАЛЛ ЗА ЗАДАНИЕ: ${task.maxScore}
//
//КРИТЕРИИ ОЦЕНИВАНИЯ ФИПИ:
//${JSON.stringify(task.criteria, null, 2)}
//
//ОТВЕТ УЧЕНИКА ДЛЯ ПРОВЕРКИ:
//"""
//${userResponse}
//"""
//`;
//
//    let rawData = '';
//    const payload = {
//      model: 'GigaChat-Max',
//      messages: [
//        { role: 'system', content: systemPrompt },
//        { role: 'user', content: userPrompt }
//      ],
//      temperature: 0.01,
//      top_p: 0.1,
//    };
//
//    let completionResponse = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
//      method: 'POST',
//      headers: {
//        'Content-Type': 'application/json',
//        'Accept': 'application/json',
//        'Authorization': `Bearer ${accessToken}`,
//      },
//      body: JSON.stringify(payload),
//    });
//
//    rawData = await completionResponse.text();
//
//    if (!completionResponse.ok && rawData.includes('Model not found')) {
//      payload.model = 'GigaChat';
//      const fallbackResponse = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
//        method: 'POST',
//        headers: {
//          'Content-Type': 'application/json',
//          'Accept': 'application/json',
//          'Authorization': `Bearer ${accessToken}`,
//        },
//        body: JSON.stringify(payload),
//      });
//
//      if (!fallbackResponse.ok) {
//        throw new Error(`Ошибка GigaChat API (${fallbackResponse.status}): ${await fallbackResponse.text()}`);
//      }
//
//      const fallbackData = await fallbackResponse.json();
//      rawData = fallbackData.choices[0].message.content;
//    } else if (!completionResponse.ok) {
//      throw new Error(`Ошибка GigaChat API (${completionResponse.status}): ${rawData}`);
//    } else {
//      const aiData = JSON.parse(rawData);
//      rawData = aiData.choices[0].message.content;
//    }
//
//    const parsedResult = extractJson(rawData);
//
//    // Валидация и защита от галлюцинаций
//    const criteriaInput = Array.isArray(parsedResult.criteria) ? parsedResult.criteria : [];
//    
//    const sanitizedCriteria = task.criteria.map((c: any) => {
//      const found = criteriaInput.find((item: any) => item.code === c.code || item.name === c.name);
//      const rawScore = typeof found?.score === 'number' ? found.score : 0;
//      const safeScore = clamp(Math.round(rawScore), 0, c.maxScore);
//
//      return {
//        code: c.code,
//        name: c.name,
//        score: safeScore,
//        maxScore: c.maxScore,
//        comment: found?.comment || `Оценка по критерию ${c.code}.`,
//      };
//    });
//
//    const calculatedTotalScore = sanitizedCriteria.reduce((sum: number, item: any) => sum + item.score, 0);
//    const isPerfect = calculatedTotalScore === task.maxScore;
//
//    const sanitizedResult = {
//      totalScore: clamp(calculatedTotalScore, 0, task.maxScore),
//      maxScore: task.maxScore,
//      summary: parsedResult.summary || (isPerfect ? 'Работа выполнена идеально!' : 'Работа проверена экспертом.'),
//      criteria: sanitizedCriteria,
//      errorsFound: Array.isArray(parsedResult.errorsFound) ? parsedResult.errorsFound : [],
//      recommendations: isPerfect
//        ? 'Отличная работа! Все критерии выполнены полностью. Продолжайте в том же духе на реальном экзамене.'
//        : (parsedResult.recommendations || 'Обратите внимание на детализацию ответа и проверьте оформление по критериям ФИПИ.'),
//    };
//
//    return NextResponse.json(sanitizedResult);
//
//  } catch (error: any) {
//    console.error('API Error:', error);
//    return NextResponse.json(
//      { error: error.message || 'Ошибка сервера при проверке' },
//      { status: 500 }
//    );
//  }
//}

import { NextResponse } from 'next/server';

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

function extractJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        throw new Error('Модель вернула некорректный JSON. Повторите запрос.');
      }
    }
    throw new Error('Не удалось найти JSON-структуру в ответе ИИ.');
  }
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[«»"'`]/g, '').replace(/\s+/g, ' ').trim();
}

// Строгая нормализация: сохраняем знаки препинания, сжимаем только пробелы
function normalizeStrict(s: string): string {
  return s.toLowerCase().replace(/[«»"'`]/g, '').replace(/\s+/g, ' ').trim();
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
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return dp[b.length];
}

// Нечёткая проверка (для категорий, где допустимо перефразирование)
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
    return tTokens.some(
      (tt) => Math.abs(tt.length - qt.length) <= 2 && levenshtein(tt, qt) <= 1
    );
  }).length;

  const ratio = matched / qTokens.length;
  if (qTokens.length <= 2) return ratio === 1;
  if (qTokens.length <= 5) return ratio >= 0.8;
  return ratio >= 0.7;
}

// Строгая проверка: цитата должна быть найдена с сохранением знаков препинания.
// Используется для категорий, где модель утверждает отсутствие/наличие пунктуации.
function quoteExistsStrict(quote: string, studentText: string): boolean {
  if (!quote || quote.trim().length < 2) return false;
  const q = normalizeStrict(quote);
  const t = normalizeStrict(studentText);
  if (q.split(/\s+/).filter(Boolean).length > 30) return false;
  return t.includes(q);
}

// Строгие категории — для них используем только quoteExistsStrict
const STRICT_CATEGORIES = ['пунктуация', 'орфография', 'грамматика', 'речь'];

function isStrictCategory(category: string): boolean {
  const c = category.toLowerCase();
  return STRICT_CATEGORIES.some((sc) => c.includes(sc));
}

// ============================================================
// АВТОРИЗАЦИЯ GIGACHAT
// ============================================================

async function getGigaChatAccessToken(authKey: string): Promise<string> {
  const cleanAuthKey = authKey.trim().replace(/^["']|["']$/g, '');
  const rqUID = crypto.randomUUID();
  const response = await fetch(
    'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        RqUID: rqUID,
        Authorization: `Basic ${cleanAuthKey}`,
      },
      body: new URLSearchParams({ scope: 'GIGACHAT_API_PERS' }),
    }
  );
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ошибка авторизации GigaChat (${response.status}): ${errText}`);
  }
  const data = await response.json();
  return data.access_token;
}

// ============================================================
// ОСНОВНОЙ ОБРАБОТЧИК
// ============================================================

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { task, userResponse } = body;

    if (!userResponse || userResponse.trim().length === 0) {
      return NextResponse.json(
        { error: 'Ответ ученика не может быть пустым' },
        { status: 400 }
      );
    }

    const rawAuthKey = process.env.GIGACHAT_AUTH_KEY;

    if (!rawAuthKey || rawAuthKey.includes('ваш_') || rawAuthKey.trim() === '') {
      await new Promise((res) => setTimeout(res, 1000));
      return NextResponse.json({
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
    }

    const accessToken = await getGigaChatAccessToken(rawAuthKey);
    const isMath =
      task.subject?.toLowerCase().includes('матем') ||
      task.id?.startsWith('math');

    const wordCount = countWords(userResponse);

    // ---------- СИСТЕМНЫЙ ПРОМПТ ----------
    const systemPrompt = `Ты — детерминированный классификатор ответов ОГЭ. Ты НЕ человек-эксперт, ты НЕ собеседник, у тебя нет «мнения». Ты исполняешь формальный алгоритм и возвращаешь ТОЛЬКО JSON.

═══════════════════════════════════════════
ЖЕЛЕЗНЫЕ ПРАВИЛА (нарушение = провал задания)
═══════════════════════════════════════════
1. ЗАПРЕЩЕНО выдумывать ошибки. Каждая ошибка в errorsFound ОБЯЗАНА содержать поле "quote" — ТОЧНУЮ подстроку, скопированную символ-в-символ из текста ученика, ВКЛЮЧАЯ ВСЕ ЗНАКИ ПРЕПИНАНИЯ на своих местах.
2. Если ты не можешь воспроизвести точную цитату со всеми знаками препинания — ошибки НЕ существует. Пропуск лучше выдумки.
3. ЗАПРЕЩЕНО вставлять в цитату запятые, тире, точки, которых нет у ученика, и ЗАПРЕЩЕНО убирать из цитаты знаки препинания, которые у ученика есть. Цитата = точная копия фрагмента.
4. ЗАПРЕЩЕНО считать ошибкой фрагмент, дословно совпадающий с исходным текстом задания. Если ученик процитировал автора — это НЕ его ошибка.
5. ЗАПРЕЩЕНО выдавать стилистические предпочтения за нарушения норм. «Неуместно», «снижает выразительность», «не звучит» — это НЕ речевая ошибка. Речевая ошибка — это нарушение нормы (тавтология, плеоназм, неверное словоупотребление).
6. Запрещено добавлять критерии, которых нет в списке КРИТЕРИИ.
7. Одна и та же ошибка НЕ считается дважды. Если ошибка привела к следствию (например, неверный знак → потерян корень), фиксируй ТОЛЬКО первопричину. Следствие НЕ добавляй как отдельную ошибку.
8. Если по критерию снят хотя бы 1 балл — в errorsFound ОБЯЗАНА быть хотя бы одна запись с цитатой. Комментарий без цитаты — недостаточен. Если ошибка системная (неверный метод) — цитируй первый шаг решения, где ученик свернул не туда.
9. Все баллы вычисляются ТОЛЬКО по таблице «ошибки → балл».
10. Ответ — один валидный JSON-объект. Без markdown, без \`\`\`json.
11. Язык ответа — русский. Числа — integer.

═══════════════════════════════════════════
АЛГОРИТМ
═══════════════════════════════════════════
ШАГ 1. Прочитай текст ученика целиком.
ШАГ 2. Найди КОНКРЕТНЫЕ фрагменты-нарушения. Для каждого:
      - category (Орфография | Пунктуация | Грамматика | Речь | Фактическая ошибка | Логика | Композиция | Содержание)
      - quote — ТОЧНАЯ подстрока со всеми знаками препинания (не более 30 слов)
      - explanation — почему это ошибка
      Правило отсева: если не можешь указать ТОЧНОЕ место — не указывай.
ШАГ 3. Посчитай количество ошибок по категориям.
ШАГ 4. Примени таблицу «ошибки → балл».
ШАГ 5. Верни JSON.

Поле "wordCount" — ТОЧНОЕ число слов от сервера. НЕ пересчитывай.

═══════════════════════════════════════════
ПРАВИЛА ПО ПРЕДМЕТУ
═══════════════════════════════════════════

${
  isMath
    ? `
          ПРЕДМЕТ: МАТЕМАТИКА (Задание 20 ОГЭ). РОВНО ОДИН критерий "М1" (maxScore = 2).

            • 2 балла — все преобразования и вычисления верны, получен правильный ответ.
            • 1 балл — решение доведено до конца, но допущена РОВНО ОДНА ошибка/описка,
              с учётом которой дальнейшие шаги выполнены верно.
              К «одной ошибке/описке» относятся ЛЮБЫЕ из перечисленных:
                - арифметическая ошибка (2+2=5);
                - ошибка в знаке при раскрытии скобок, переносе через знак равенства,
                  приведении подобных;
                - описка в коэффициенте;
                - потеря одного из корней при верной логике;
                - неверно указанный знак в ответе.
              ВАЖНО: если такая ошибка РОВНО ОДНА и решение в целом доведено до конца
              с верной логикой — ставь 1 балл, а НЕ 0.
            • 0 баллов — 2+ ошибки, ложная логика (ученик не понимает метод решения),
              потеря ОДЗ, нет ответа.

            КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО ставить 0 баллов, если в решении ровно одна ошибка
            указанного типа и метод решения выбран верно. Это противоречит критерию 1 балла.

      Категории ошибок (используй ТОЛЬКО эти):
        • "Вычислительная ошибка" — арифметика, знаки, коэффициенты, описки.
        • "Логическая ошибка" — неверный метод, потерянный случай, неверное следствие.
        • "Потеря ОДЗ" — ТОЛЬКО если в задании есть знаменатель с переменной,
          корень чётной степени, логарифм, и ученик игнорирует ограничение.
          В обычных уравнениях и неравенствах без этих элементов ОДЗ не применяется.

      Если ошибка ученика не подходит ни под одну из трёх категорий — не выдумывай
      новую, используй "Логическая ошибка" или вообще не добавляй запись в errorsFound.
`
    : `
ПРЕДМЕТ: РУССКИЙ ЯЗЫК (Сочинение 13.3 + грамотность).

ПРАВИЛО ОБЪЁМА: если wordCount < 70 → ВСЕ критерии = 0.
Первой строкой summary напиши: "Объём менее 70 слов — все критерии обнулены."

СК1 (0–1): 1 — прямой ответ на вопрос; 0 — нет ответа или не на тот вопрос.
СК2 (0–3): 3 — 2 примера из текста; 2 — 1 пример из текста; 1 — только жизненный опыт; 0 — нет.
СК3 (0–2): 2 — 0 логических ошибок; 1 — 1–2; 0 — 3+.
СК4 (0–1): 1 — трёхчастная композиция без ошибок; 0 — иначе.
ГК1 Орфография:   0→3 | 1–2→2 | 3–4→1 | 5+→0
ГК2 Пунктуация:   0→3 | 1–2→2 | 3–4→1 | 5+→0
ГК3 Грамматика:   0→3 | 1–2→2 | 3–4→1 | 5+→0
ГК4 Речь:         0→3 | 1–2→2 | 3–4→1 | 5+→0
ФК1 Факты:        0→1 | 1+→0

ОБЯЗАТЕЛЬНАЯ ПРОЦЕДУРА ПОИСКА (выполнять ДО выставления баллов за ГК1–ГК4):
Шаг 1. Пройди по тексту ученика слово за словом. Найди типичные ошибки ОГЭ:
   • -тся / -ться, -тца, -ца
   • -нн- / -н- в причастиях и прилагательных
   • чередующиеся корни (раст-/рос-, лаг-/лож-, кас-/кос-)
   • «не» с частями речи (слитно/раздельно)
   • приставки на з-/с-, пре-/при-
   • Ь после шипящих
   • безударные гласные в корне
   • окончания глаголов -ешь/-ишь, -ет/-ит
   Если находишь такое слово — фиксируй его в errorsFound категорией «Орфография».
Шаг 2. Пройди по тексту и найди пропущенные или лишние знаки препинания:
   • запятая при однородных членах
   • запятая перед союзами что, чтобы, потому что, когда, если, который
   • запятая при вводных словах (я думаю, конечно, наверное, возможно)
   • обособленные причастные и деепричастные обороты
   • запятая в сложносочинённых и сложноподчинённых предложениях
   Если находишь — фиксируй категорией «Пунктуация».
Шаг 3. Проверь грамматику и речь:
   • согласование подлежащего и сказуемого
   • падежные формы
   • деепричастные обороты (подлежащее действия совпадает?)
   • тавтология и плеоназм (например, «памятный сувенир»)
   • неверное словоупотребление
Шаг 4. Проверь факты: совпадает ли имя автора, название произведения, имена персонажей с условием задания.
Шаг 5. ТОЛЬКО ПОСЛЕ ЭТИХ ПРОВЕРОК выставляй баллы за ГК1–ГК4 и ФК1.

ВАЖНО: если ты находишь типичную ошибку из этих списков — ты ОБЯЗАН её зафиксировать. Не пропускай, даже если считаешь фрагмент «нормальным». Пропуск ошибки — такая же ошибка, как её выдумка.

Одна и та же ошибка НЕ считается дважды в разных категориях.
`
}

ПРИМЕРЫ:
✔ { "category": "Орфография", "quote": "изкусство", "explanation": "Пишется «искусство»." }
✔ { "category": "Пунктуация", "quote": "я думаю что это важно", "explanation": "Перед «что» нужна запятая." }
✔ { "category": "Фактическая ошибка", "quote": "у Чехова в рассказе", "explanation": "В условии автор Домбровский." }

✘ { "category": "Пунктуация", "quote": "я думаю, что это важно", "explanation": "Пропущена запятая" } — запятая в цитате ЕСТЬ, ошибки нет.
✘ { "category": "Речь", "quote": "каждое его полотно ликует", "explanation": "Слишком выразительно" } — это не ошибка, а стиль.
✘ { "category": "Пунктуация", "quote": "любой фрагмент из текста задания", "explanation": "..." } — цитата из задания, не ошибка ученика.

ФОРМАТ ОТВЕТА:
{
  "summary": "1–3 предложения.",
  "criteria": [
    { "code": "СК1", "name": "…", "score": 1, "maxScore": 1, "comment": "…" }
  ],
  "errorsFound": [
    { "category": "Орфография", "quote": "точная подстрока со знаками", "explanation": "…" }
  ],
  "recommendations": "2–4 совета."
}
ЕСЛИ ошибок нет — "errorsFound": [].
`;

    // ---------- ПОЛЬЗОВАТЕЛЬСКИЙ ПРОМПТ ----------
    const userPrompt = `
ПРЕДМЕТ: ${task.subject}
ЗАДАНИЕ: ${task.title}
WORD_COUNT: ${wordCount}

УСЛОВИЕ И ТЕКСТ:
"""
${task.prompt}
"""

МАКСИМАЛЬНЫЙ БАЛЛ: ${task.maxScore}

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

    // ---------- ЗАПРОС ----------
    const payload: any = {
      model: 'GigaChat-2-Max',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.01,
      top_p: 0.1,
    };

    let completionResponse = await fetch(
      'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      }
    );

    let rawData = await completionResponse.text();

    if (!completionResponse.ok && rawData.includes('Model not found')) {
      payload.model = 'GigaChat';
      const fallbackResponse = await fetch(
        'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        }
      );
      if (!fallbackResponse.ok) {
        throw new Error(
          `Ошибка GigaChat API (${fallbackResponse.status}): ${await fallbackResponse.text()}`
        );
      }
      const fallbackData = await fallbackResponse.json();
      rawData = fallbackData.choices[0].message.content;
    } else if (!completionResponse.ok) {
      throw new Error(
        `Ошибка GigaChat API (${completionResponse.status}): ${rawData}`
      );
    } else {
      const aiData = JSON.parse(rawData);
      rawData = aiData.choices[0].message.content;
    }

    const parsedResult = extractJson(rawData);

    // ============================================================
    // ПОСТ-ФИЛЬТР
    // ============================================================

    const criteriaInput = Array.isArray(parsedResult.criteria)
      ? parsedResult.criteria
      : [];
    const rawErrors: any[] = Array.isArray(parsedResult.errorsFound)
      ? parsedResult.errorsFound
      : [];

    const normalizedErrors = rawErrors.map((e: any) => {
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

    const verifiedErrors = normalizedErrors.filter((e) => {
      const strict = isStrictCategory(e.category);
      const exists = strict
        ? quoteExistsStrict(e.quote, userResponse)
        : quoteExists(e.quote, userResponse);
      if (!exists) return false;

      // Отбрасываем ошибки, чья цитата дословно содержится в задании
      const eNorm = normalizeForMatch(e.quote);
      if (eNorm.length > 5 && taskNorm.includes(eNorm)) return false;

      return true;
    });
        
        // Если модель снизила балл, но не зафиксировала ни одной ошибки —
        // генерируем fallback-запись из комментария к критерию.
        // Касается, в первую очередь, математики, где ошибка бывает системной
        // (неверный метод), и её нельзя процитировать.
        const criteriaWithLoss = criteriaInput.filter((c: any) => {
          const orig = task.criteria.find(
            (tc: any) => tc.code === c.code || tc.name === c.name
          );
          if (!orig) return false;
          const sc = typeof c.score === 'number' ? c.score : 0;
          return sc < orig.maxScore;
        });

        if (verifiedErrors.length === 0 && criteriaWithLoss.length > 0) {
          for (const c of criteriaWithLoss) {
            verifiedErrors.push({
              category: 'Логическая ошибка',
              quote: '', // цитаты нет — ошибка системная
              explanation:
                String(c.comment ?? '').trim() ||
                `По критерию ${c.code} снижен балл: см. комментарий.`,
            });
          }
        }

    const countsByCategory: Record<string, number> = {};
    for (const e of verifiedErrors) {
      const key = e.category.toLowerCase();
      countsByCategory[key] = (countsByCategory[key] ?? 0) + 1;
    }

    const modelCountsByCategory: Record<string, number> = {};
    for (const e of normalizedErrors) {
      const key = e.category.toLowerCase();
      modelCountsByCategory[key] = (modelCountsByCategory[key] ?? 0) + 1;
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

    // ============================================================
    // АСИММЕТРИЧНАЯ ВЕРИФИКАЦИЯ БАЛЛОВ
    // ============================================================

    const isRussian = !isMath;

    const sanitizedCriteria = task.criteria.map((c: any) => {
      const found = criteriaInput.find(
        (item: any) => item.code === c.code || item.name === c.name
      );
      const modelScore =
        typeof found?.score === 'number'
          ? clamp(Math.round(found.score), 0, c.maxScore)
          : 0;

      let finalScore: number;

      if (isRussian && wordCount < 70) {
        finalScore = 0;
      } else if (isRussian && ['ГК1', 'ГК2', 'ГК3', 'ГК4'].includes(c.code)) {
        const verifiedCount = countFor(c.code, countsByCategory);
        const modelErrCount = countFor(c.code, modelCountsByCategory);

        if (modelErrCount > 0 && verifiedCount === 0) {
          // Модель нашла ошибки, но ни одна не подтвердилась → не доверяем модели
          finalScore = c.maxScore;
        } else {
          finalScore = Math.min(modelScore, scoreByTable(verifiedCount));
        }
      } else if (isRussian && c.code === 'ФК1') {
        const verifiedCount = countFor('ФК1', countsByCategory);
        const modelErrCount = countFor('ФК1', modelCountsByCategory);

        let candidate: number;
        if (modelErrCount > 0 && verifiedCount === 0) {
          candidate = c.maxScore;
        } else if (verifiedCount > 0) {
          candidate = 0;
        } else {
          candidate = 1;
        }
        finalScore = Math.min(modelScore, candidate);
      } else {
        finalScore = modelScore;
      }

      return {
        code: c.code,
        name: c.name,
        score: finalScore,
        maxScore: c.maxScore,
        comment: found?.comment ?? `Оценка по критерию ${c.code}.`,
      };
    });

    const calculatedTotalScore = sanitizedCriteria.reduce(
      (sum: number, item: any) => sum + item.score,
      0
    );
    const isPerfect = calculatedTotalScore === task.maxScore;

    const recs = String(parsedResult.recommendations ?? '').trim();

    const sanitizedResult = {
      totalScore: clamp(calculatedTotalScore, 0, task.maxScore),
      maxScore: task.maxScore,
      summary:
        isRussian && wordCount < 70
          ? `Объём менее 70 слов (${wordCount}) — все критерии обнулены.`
          : String(parsedResult.summary ?? '').trim() ||
            (isPerfect
              ? 'Работа выполнена идеально!'
              : 'Работа проверена экспертом.'),
      criteria: sanitizedCriteria,
      errorsFound: verifiedErrors.map(
        (e: any) => `[${e.category}] «${e.quote}» — ${e.explanation}`
      ),
      recommendations: isPerfect
        ? 'Отличная работа! Все критерии выполнены полностью.'
        : recs ||
          'Обратите внимание на детализацию ответа и проверьте оформление по критериям ФИПИ.',
    };

    return NextResponse.json(sanitizedResult);
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Ошибка сервера при проверке' },
      { status: 500 }
    );
  }
}
