'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calculator, Delete, Equal, History, Loader2, NotebookPen, RefreshCcw } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';

const HISTORY_STORAGE_KEY = 'pv_calculator_history_v1';
const HISTORY_MAX_ITEMS = 300;
const BACKSPACE_KEY = 'BACKSPACE';

const CALC_KEYS = [
  ['C', '(', ')', BACKSPACE_KEY],
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['0', '.', '%', '+'],
] as const;

const OPERATORS = new Set(['+', '-', '*', '/', '%']);

type HistoryItem = {
  id: string;
  expression: string;
  result: string;
  createdAt: string;
};

function isNumericToken(token: string) {
  return /^\d+(\.\d+)?$/.test(token);
}

function tokenizeExpression(expression: string) {
  const tokens: string[] = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if (ch === ' ') {
      i += 1;
      continue;
    }
    if ('()+-*/%'.includes(ch)) {
      tokens.push(ch);
      i += 1;
      continue;
    }
    if (/\d|\./.test(ch)) {
      let next = ch;
      i += 1;
      while (i < expression.length && /[\d.]/.test(expression[i])) {
        next += expression[i];
        i += 1;
      }
      tokens.push(next);
      continue;
    }
    throw new Error('Invalid character');
  }
  return tokens;
}

function precedence(op: string) {
  if (op === '+' || op === '-') return 1;
  if (op === '*' || op === '/' || op === '%') return 2;
  return 0;
}

function applyOperator(values: number[], operator: string) {
  if (values.length < 2) throw new Error('Invalid expression');
  const b = values.pop() as number;
  const a = values.pop() as number;
  if (operator === '+') values.push(a + b);
  else if (operator === '-') values.push(a - b);
  else if (operator === '*') values.push(a * b);
  else if (operator === '/') {
    if (b === 0) throw new Error('Division by zero');
    values.push(a / b);
  } else if (operator === '%') {
    if (b === 0) throw new Error('Division by zero');
    values.push(a % b);
  }
}

function evaluateExpression(raw: string) {
  const expression = raw.trim();
  if (!expression) return 0;

  const normalized = expression.startsWith('-') ? '0' + expression : expression;
  const tokens = tokenizeExpression(normalized);
  const values: number[] = [];
  const operators: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (isNumericToken(token)) {
      values.push(Number(token));
      continue;
    }
    if (token === '(') {
      operators.push(token);
      continue;
    }
    if (token === ')') {
      while (operators.length > 0 && operators[operators.length - 1] !== '(') {
        applyOperator(values, operators.pop() as string);
      }
      if (operators.pop() !== '(') throw new Error('Mismatched parentheses');
      continue;
    }
    if (OPERATORS.has(token)) {
      while (operators.length > 0 && precedence(operators[operators.length - 1]) >= precedence(token)) {
        const last = operators[operators.length - 1];
        if (last === '(') break;
        applyOperator(values, operators.pop() as string);
      }
      operators.push(token);
      continue;
    }
    throw new Error('Invalid token');
  }

  while (operators.length > 0) {
    const op = operators.pop() as string;
    if (op === '(' || op === ')') throw new Error('Mismatched parentheses');
    applyOperator(values, op);
  }
  if (values.length !== 1 || !Number.isFinite(values[0])) throw new Error('Invalid expression');
  return values[0];
}

function formatResult(value: number) {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 1_000_000_000) / 1_000_000_000;
  return String(rounded);
}

function formatNumericStringForDisplay(raw: string, locale: string) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return raw || '0.00';
  const isWholeNumber = Number.isInteger(parsed);
  return new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US', {
    minimumFractionDigits: isWholeNumber ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(parsed);
}

function formatExpressionForDisplay(raw: string, locale: string) {
  if (!raw.trim()) return '0.00';
  let output = '';
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (/[\d.]/.test(ch)) {
      let token = ch;
      i += 1;
      while (i < raw.length && /[\d.]/.test(raw[i])) {
        token += raw[i];
        i += 1;
      }
      if (/^\d+(\.\d+)?$/.test(token)) {
        output += formatNumericStringForDisplay(token, locale);
      } else {
        output += token;
      }
      continue;
    }
    output += ch;
    i += 1;
  }
  return output || '0.00';
}

function readHistoryFromStorage() {
  if (typeof window === 'undefined') return [] as HistoryItem[];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.expression === 'string' && typeof item.result === 'string').slice(0, HISTORY_MAX_ITEMS);
  } catch {
    return [];
  }
}

function saveHistoryToStorage(items: HistoryItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, HISTORY_MAX_ITEMS)));
  } catch {
    // ignore storage failures
  }
}

export default function CalculatorPage() {
  const { locale } = useI18n();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isThai = locale === 'th';

  const [expression, setExpression] = useState('');
  const [result, setResult] = useState('0');
  const [error, setError] = useState('');
  const [lastEquation, setLastEquation] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [resultPopup, setResultPopup] = useState<{ expression: string; result: string } | null>(null);

  useEffect(() => {
    const nextExpression = String(searchParams.get('expression') ?? '').trim();
    const nextResult = String(searchParams.get('result') ?? '').trim();
    if (!nextExpression && !nextResult) return;
    setExpression(nextExpression || nextResult);
    setResult(nextResult || '0');
    setLastEquation(nextExpression && nextResult ? nextExpression + ' = ' + nextResult : '');
    setError('');
  }, [searchParams]);

  const summaryLabel = useMemo(() => (isThai ? 'ผลลัพธ์ล่าสุด' : 'Latest result'), [isThai]);
  const displayExpression = useMemo(() => formatExpressionForDisplay(expression || '0', locale), [expression, locale]);
  const displayResult = useMemo(() => formatNumericStringForDisplay(result, locale), [locale, result]);

  const appendToken = useCallback((token: string) => {
    setError('');
    setExpression((prev) => {
      if (token === '.') {
        const chunks = prev.split(/[+\-*/%()]/);
        const lastChunk = chunks[chunks.length - 1] ?? '';
        if (lastChunk.includes('.')) return prev;
      }
      if (OPERATORS.has(token)) {
        if (!prev) return token === '-' ? '-' : prev;
        const last = prev[prev.length - 1];
        if (OPERATORS.has(last)) return prev.slice(0, -1) + token;
      }
      return prev + token;
    });
  }, []);

  const clearAll = useCallback(() => {
    setExpression('');
    setResult('0');
    setError('');
    setLastEquation('');
    setResultPopup(null);
  }, []);

  const backspace = useCallback(() => {
    setError('');
    setExpression((prev) => prev.slice(0, -1));
  }, []);

  const addHistory = useCallback((item: HistoryItem) => {
    const current = readHistoryFromStorage();
    const next = [item, ...current].slice(0, HISTORY_MAX_ITEMS);
    saveHistoryToStorage(next);
  }, []);

  const calculateNow = useCallback(() => {
    try {
      const sourceExpression = expression.trim() || '0';
      const next = evaluateExpression(sourceExpression);
      const formatted = formatResult(next);
      const equation = sourceExpression + ' = ' + formatted;

      setResult(formatted);
      setExpression(formatted);
      setError('');
      setLastEquation(equation);
      setResultPopup({ expression: sourceExpression, result: formatted });
      addHistory({
        id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
        expression: sourceExpression,
        result: formatted,
        createdAt: new Date().toISOString(),
      });
    } catch {
      setError(isThai ? 'สมการไม่ถูกต้อง' : 'Invalid expression');
    }
  }, [addHistory, expression, isThai]);

  const saveLatestToNote = useCallback(async () => {
    const sourceExpression = expression.trim();
    const sourceResult = result.trim();
    if (!sourceExpression && !lastEquation) {
      showToast(isThai ? 'ยังไม่มีผลคำนวณให้บันทึก' : 'No calculation to save', 'error');
      return;
    }

    const equation = lastEquation || sourceExpression + ' = ' + sourceResult;
    setSavingNote(true);
    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: isThai ? 'บันทึกเครื่องคิดเลข' : 'Calculator Note',
          content: equation,
          reminderAt: null,
          meetingAt: null,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        showToast(body.error || (isThai ? 'บันทึกลงโน้ตไม่สำเร็จ' : 'Failed to save note'), 'error');
        return;
      }
      showToast(isThai ? 'บันทึกผลคำนวณลงโน้ตแล้ว' : 'Calculation saved to notes', 'success');
    } catch {
      showToast(isThai ? 'บันทึกลงโน้ตไม่สำเร็จ' : 'Failed to save note', 'error');
    } finally {
      setSavingNote(false);
    }
  }, [expression, isThai, lastEquation, result, showToast]);

  return (
    <section className='space-y-4 pb-24 pt-[calc(env(safe-area-inset-top)+0.4rem)] animate-screen-in'>
      <div className='neon-panel rounded-[24px] p-4'>
        <div className='mb-3 flex items-center justify-between'>
          <div className='inline-flex items-center gap-2'>
            <span className='neon-icon-wrap inline-flex h-10 w-10 items-center justify-center rounded-2xl'>
              <Calculator className='h-5 w-5 text-slate-100' />
            </span>
            <div>
              <h1 className='text-app-h3 font-semibold text-slate-100'>{isThai ? 'เครื่องคิดเลข' : 'Calculator'}</h1>
              <p className='text-app-caption text-slate-300'>{summaryLabel}: {displayResult}</p>
            </div>
          </div>
          <Button type='button' variant='secondary' size='sm' className='h-10 rounded-xl px-3 text-app-caption' onClick={clearAll}>
            <RefreshCcw className='mr-1 h-3.5 w-3.5' />
            {isThai ? 'รีเซ็ต' : 'Reset'}
          </Button>
        </div>

        <div className='rounded-2xl border border-[var(--border-soft)] bg-[rgba(13,25,68,0.82)] p-3.5'>
          <p className='min-h-[34px] break-all text-right font-mono text-[18px] leading-tight text-slate-200'>{displayExpression}</p>
          <p className='mt-1 min-h-[44px] break-all text-right font-mono text-[34px] font-semibold leading-tight text-cyan-200'>{displayResult}</p>
          {error ? <p className='mt-1 text-right text-app-caption text-rose-200'>{error}</p> : <div className='h-[22px]' />}
        </div>

        <div className='mt-2 grid grid-cols-2 gap-2'>
          <Button type='button' variant='secondary' className='h-10 rounded-xl text-app-caption' onClick={() => void saveLatestToNote()} disabled={savingNote}>
            {savingNote ? <Loader2 className='mr-1 h-4 w-4 animate-spin' /> : <NotebookPen className='mr-1 h-4 w-4' />}
            {isThai ? 'บันทึกลงโน้ต' : 'Save to notes'}
          </Button>
          <Button type='button' variant='secondary' className='h-10 rounded-xl text-app-caption' onClick={() => router.push('/calculator/history')}>
            <History className='mr-1 h-4 w-4' />
            {isThai ? 'ประวัติย้อนหลัง' : 'History'}
          </Button>
        </div>
      </div>

      <div className='neon-panel rounded-[24px] p-3'>
        <div className='grid grid-cols-4 gap-2'>
          {CALC_KEYS.flat().map((key) => {
            const isOperator = OPERATORS.has(key);
            const isControl = key === 'C' || key === BACKSPACE_KEY;
            const className =
              'h-14 rounded-2xl border text-[20px] font-semibold transition active:scale-[0.99] ' +
              (isControl
                ? 'border-rose-300/50 bg-[rgba(161,56,112,0.35)] text-rose-100 hover:bg-[rgba(185,64,126,0.45)]'
                : isOperator
                  ? 'border-indigo-300/55 bg-[rgba(71,76,173,0.45)] text-indigo-100 hover:bg-[rgba(82,89,201,0.56)]'
                  : 'border-[var(--border-soft)] bg-[rgba(20,34,82,0.76)] text-slate-100 hover:bg-[rgba(28,47,109,0.84)]');

            let action: () => void = () => appendToken(key);
            if (key === 'C') action = clearAll;
            if (key === BACKSPACE_KEY) action = backspace;

            return (
              <button key={key} type='button' className={className} onClick={action}>
                {key === BACKSPACE_KEY ? <Delete className='mx-auto h-4 w-4' /> : key}
              </button>
            );
          })}
          <Button type='button' className='col-span-3 h-14 rounded-2xl text-[20px]' onClick={calculateNow}>
            <Equal className='mr-1 h-5 w-5' />
            {isThai ? 'คำนวณผลลัพธ์' : 'Calculate result'}
          </Button>
          <Button type='button' variant='secondary' className='col-span-1 h-14 rounded-2xl' onClick={() => router.push('/calculator/history')}>
            <History className='h-5 w-5' />
          </Button>
        </div>
      </div>

      {resultPopup ? (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-[3px]'>
          <div className='w-full max-w-[420px] rounded-[24px] border border-cyan-300/40 bg-[linear-gradient(165deg,rgba(18,39,98,0.98),rgba(20,31,76,0.98))] p-4 shadow-[0_24px_52px_rgba(8,22,66,0.55)]'>
            <p className='text-app-caption text-cyan-100'>{isThai ? 'ผลลัพธ์ล่าสุด' : 'Latest Result'}</p>
            <p className='mt-2 break-all text-right font-mono text-[16px] text-slate-200'>{formatExpressionForDisplay(resultPopup.expression, locale)}</p>
            <p className='mt-1 break-all text-right font-mono text-[34px] font-semibold text-cyan-100'>= {formatNumericStringForDisplay(resultPopup.result, locale)}</p>
            <div className='mt-4 flex justify-end'>
              <Button type='button' className='h-10 rounded-xl px-5' onClick={() => setResultPopup(null)}>
                {isThai ? 'ปิด' : 'Close'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
