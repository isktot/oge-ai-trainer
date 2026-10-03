import { NextResponse } from 'next/server';

// Отключаем проверку SSL для работы с сертификатами Минцифры/Сбера
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Вспомогательная функция ограничения чисел в диапазоне [min, max]
function clamp(num: number, min: number, max: number): number {
  return Math.min(Math.max(num, min), max);
}

// Извлечение JSON с обработкой любых невалидных оберток
function extractJson(text: string) {
  try {
    return JSON.parse(text);
  } catch (e) {
    // Поиск объекта JSON через регулярное выражение
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (err) {
        throw new Error('Модель вернула некорректный JSON. Повторите запрос.');
      }
    }
    throw new Error('Не удалось найти JSON-структуру в ответе ИИ.');
  }
}

// Получение токена доступа GigaChat API
async function getGigaChatAccessToken(authKey: string): Promise<string> {
  const cleanAuthKey = authKey.trim().replace(/^["']|["']$/g, '');
  const rqUID = crypto.randomUUID();

  const response = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'RqUID': rqUID,
      'Authorization': `Basic ${cleanAuthKey}`,
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

    // Режим эмуляции, если ключ не задан
    if (!rawAuthKey || rawAuthKey.includes('ваш_') || rawAuthKey.trim() === '') {
      await new Promise((res) => setTimeout(res, 1000));
      return NextResponse.json({
        totalScore: Math.floor(task.maxScore * 0.75),
        maxScore: task.maxScore,
        summary: "Тестовый режим: ключ API не найден в .env.local",
        criteria: task.criteria.map((c: any) => ({
          code: c.code,
          name: c.name,
          score: Math.max(0, c.maxScore - 1),
          maxScore: c.maxScore,
          comment: `По критерию ${c.code} условие выполнено частично.`
        })),
        errorsFound: ["Пример недочета в ответе"],
        recommendations: "Укажите настоящий GIGACHAT_AUTH_KEY в файле .env.local"
      });
    }

    const accessToken = await getGigaChatAccessToken(rawAuthKey);
    const isMath = task.subject?.toLowerCase().includes('матем') || task.id?.startsWith('math');

      // ПРИНЦИПИАЛЬНО НОВЫЙ СИСТЕМНЫЙ ПРОМПТ ДЛЯ МАТЕМАТИКИ И РУССКОГО ЯЗЫКА
          const systemPrompt = `Ты — главком и жесткий председатель экспертной комиссии ФИПИ по проверке ОГЭ (${isMath ? 'МАТЕМАТИКА' : 'РУССКИЙ ЯЗЫК'}).
      Твоя цель — выставлять максимально бескомпромиссные и строго обоснованные оценки по всем правилам спецификации.

      АБСОЛЮТНЫЕ ИНСТРУКЦИИ ОЦЕНИВАНИЯ:
      1. Выполни пошаговый разбор текста (stepByStepAnalysis): детально разбери каждую строку решения/сочинения.
      2. Ни в коем случае НЕ придумывай ошибки, которых нет, но и НЕ прощай фактических, логических или математических недочетов.
      3. Оценивай КАЖДЫЙ критерий строго в рамках допустимого [0, maxScore].
      4. Верни результат СТРОГО в формате одного валидного JSON-объекта (без markdown-оберток и комментариев).

      ${isMath ? `
      ЖЕСТКИЕ ПРАВИЛА ПО МАТЕМАТИКЕ (Задания с развернутым ответом):
      - Внимательно сверяй все алгебраические и арифметические действия: раскрытие скобок, дискриминант, корни уравнения.
      - Если в задании есть дроби, квадратные корни или ограничения, а ученик НЕ учел ОДЗ или привел посторонние корни — ставь 0 баллов!
      - За 1 арифметическую ошибку при полностью верном ходе решения ставится 1 балл из 2.
      - За 2 ошибки или неверную логику решения — 0 баллов.
      - Обязательно проверяй наличие итогового блока "Ответ:".
      ` : `
      ЖЕСТКИЕ ПРАВИЛА ПО РУССКОМУ ЯЗЫКУ (Сочинение 13.3):
      - КРИТИЧЕСКИЙ ОБЪЕМ: Если в сочинении МЕНЬШЕ 70 слов — за ВСЕ критерии сразу ставится 0 баллов!
      - СК1 (max 2 балла): 2 балла — дал четкое определение и прокомментировал его; 1 балл — дал определение БЕЗ комментария; 0 баллов — не дал определения.
      - СК2 (max 3 балла): 3 балла — приведено 2 примера-аргумента (1 из текста + 1 из жизненного/читательского опыта); 2 балла — 2 примера из текста ИЛИ 1 пример из текста + 1 из опыта без пояснений; 1 балл — только 1 пример; 0 баллов — нет примеров.
      - СК3 (max 1 балл): Соблюдена ли логика, связность и абзацное членение.
      - СК4 (max 1 балл): Наличие всех частей композиции (вступление, основная часть, вывод).
      `}

      СТРУКТУРА JSON-ОТВЕТА:
      {
        "stepByStepAnalysis": "Анализ шагов...",
        "summary": "Резюме проверки (2-3 предложения).",
        "criteria": [
          {
            "code": "код критерия (например, СК1 или М1)",
            "name": "название критерия",
            "score": number,
            "maxScore": number,
            "comment": "Почему выставлен именно такой балл."
          }
        ],
        "errorsFound": ["Ошибка 1", "Ошибка 2"],
        "recommendations": "Рекомендации ученику по исправлению."
      }`;

    const userPrompt = `
ПРЕДМЕТ: ${task.subject}
ЗАДАНИЕ ОГЭ: ${task.title}

УСЛОВИЕ ЗАДАНИЯ И ТЕКСТ:
"""
${task.prompt}
"""

МАКСИМАЛЬНЫЙ БАЛЛ ЗА ЗАДАНИЕ: ${task.maxScore}

КРИТЕРИИ ОЦЕНИВАНИЯ ФИПИ:
${JSON.stringify(task.criteria, null, 2)}

ОТВЕТ УЧЕНИКА ДЛЯ ПРОВЕРКИ:
"""
${userResponse}
"""
`;

    // Вызов API GigaChat c fallback-логикой[cite: 2]
    let rawData = '';
    const payload = {
      model: 'GigaChat-Max',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.01, // Минимальная температура для строгого ответа
      top_p: 0.1,
    };

    let completionResponse = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    rawData = await completionResponse.text();

    // Fallback на обычную модель GigaChat, если GigaChat-Pro недоступен[cite: 2]
    if (!completionResponse.ok && rawData.includes('Model not found')) {
      payload.model = 'GigaChat';
      const fallbackResponse = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!fallbackResponse.ok) {
        throw new Error(`Ошибка GigaChat API (${fallbackResponse.status}): ${await fallbackResponse.text()}`);
      }

      const fallbackData = await fallbackResponse.json();
      rawData = fallbackData.choices[0].message.content;
    } else if (!completionResponse.ok) {
      throw new Error(`Ошибка GigaChat API (${completionResponse.status}): ${rawData}`);
    } else {
      const aiData = JSON.parse(rawData);
      rawData = aiData.choices[0].message.content;
    }

    // Распарсим JSON от ИИ
    const parsedResult = extractJson(rawData);

    // ВАЛИДАЦИЯ И ЗАЩИТА ОТ ГАЛЛЮЦИНАЦИЙ НА СТОРУ ХОСТА
    const criteriaInput = Array.isArray(parsedResult.criteria) ? parsedResult.criteria : [];
    
    // 1. Принудительно корректируем баллы по каждому критерию в границы [0, maxScore]
    const sanitizedCriteria = task.criteria.map((c: any) => {
      const found = criteriaInput.find((item: any) => item.code === c.code || item.name === c.name);
      const rawScore = typeof found?.score === 'number' ? found.score : 0;
      const safeScore = clamp(Math.round(rawScore), 0, c.maxScore);

      return {
        code: c.code,
        name: c.name,
        score: safeScore,
        maxScore: c.maxScore,
        comment: found?.comment || `Оценка по критерию ${c.code}.`,
      };
    });

      // 2. Итоговый балл считается строго программно
          const calculatedTotalScore = sanitizedCriteria.reduce((sum: number, item: any) => sum + item.score, 0);
          const isPerfect = calculatedTotalScore === task.maxScore;

          const sanitizedResult = {
            totalScore: clamp(calculatedTotalScore, 0, task.maxScore),
            maxScore: task.maxScore,
            summary: parsedResult.summary || (isPerfect ? 'Работа выполнена идеально!' : 'Работа проверена экспертом.'),
            criteria: sanitizedCriteria,
            errorsFound: Array.isArray(parsedResult.errorsFound) ? parsedResult.errorsFound : [],
            // Если балл максимальный — хвалим, если нет — берем рекомендацию или стандартный совет
            recommendations: isPerfect
              ? 'Отличная работа! Все критерии выполнены полностью. Продолжайте в том же духе на реальном экзамене.'
              : (parsedResult.recommendations || 'Обратите внимание на детализацию ответа и проверьте оформление по критериям ФИПИ.'),
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
