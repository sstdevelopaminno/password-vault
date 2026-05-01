'use client';

import { useCallback, useMemo, useState } from 'react';
import { Calculator, Delete, Equal, RefreshCcw } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { Button } from '@/components/ui/button';

const CALC_KEYS = [
  ['C', '(', ')', '⌫'],
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['0', '.', '%', '+'],
] as const;

const OPERATORS = new Set(['+', '-', '*', '/', '%']);

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

export default function CalculatorPage() {
  const { locale } = useI18n();
  const isThai = locale === 'th';
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState('0');
  const [error, setError] = useState('');

  const summaryLabel = useMemo(() => (isThai ? 'ผลลัพธ์ล่าสุด' : 'Latest result'), [isThai]);

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
  }, []);

  const backspace = useCallback(() => {
    setError('');
    setExpression((prev) => prev.slice(0, -1));
  }, []);

  const calculateNow = useCallback(() => {
    try {
      const next = evaluateExpression(expression);
      const formatted = formatResult(next);
      setResult(formatted);
      setExpression(formatted);
      setError('');
    } catch {
      setError(isThai ? 'สมการไม่ถูกต้อง' : 'Invalid expression');
    }
  }, [expression, isThai]);

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
              <p className='text-app-caption text-slate-300'>{summaryLabel}: {result}</p>
            </div>
          </div>
          <Button type='button' variant='secondary' size='sm' className='h-9 rounded-xl px-3 text-app-caption' onClick={clearAll}>
            <RefreshCcw className='mr-1 h-3.5 w-3.5' />
            {isThai ? 'รีเซ็ต' : 'Reset'}
          </Button>
        </div>

        <div className='rounded-2xl border border-[var(--border-soft)] bg-[rgba(13,25,68,0.82)] p-3'>
          <p className='min-h-[28px] break-all text-right font-mono text-app-body text-slate-200'>{expression || '0'}</p>
          <p className='mt-1 min-h-[34px] break-all text-right font-mono text-[26px] font-semibold leading-tight text-cyan-200'>{result}</p>
          {error ? <p className='mt-1 text-right text-app-micro text-rose-200'>{error}</p> : <div className='h-[18px]' />}
        </div>
      </div>

      <div className='neon-panel rounded-[24px] p-3'>
        <div className='grid grid-cols-4 gap-2'>
          {CALC_KEYS.flat().map((key) => {
            const isOperator = OPERATORS.has(key);
            const isControl = key === 'C' || key === '⌫';
            const className =
              'h-12 rounded-2xl border text-[17px] font-semibold transition active:scale-[0.99] ' +
              (isControl
                ? 'border-rose-300/50 bg-[rgba(161,56,112,0.35)] text-rose-100 hover:bg-[rgba(185,64,126,0.45)]'
                : isOperator
                  ? 'border-indigo-300/55 bg-[rgba(71,76,173,0.45)] text-indigo-100 hover:bg-[rgba(82,89,201,0.56)]'
                  : 'border-[var(--border-soft)] bg-[rgba(20,34,82,0.76)] text-slate-100 hover:bg-[rgba(28,47,109,0.84)]');

            let action: () => void = () => appendToken(key);
            if (key === 'C') action = clearAll;
            if (key === '⌫') action = backspace;

            return (
              <button key={key} type='button' className={className} onClick={action}>
                {key === '⌫' ? <Delete className='mx-auto h-4 w-4' /> : key}
              </button>
            );
          })}
          <Button type='button' className='col-span-4 h-12 rounded-2xl text-base' onClick={calculateNow}>
            <Equal className='mr-1 h-4 w-4' />
            {isThai ? 'คำนวณผลลัพธ์' : 'Calculate result'}
          </Button>
        </div>
      </div>
    </section>
  );
}
