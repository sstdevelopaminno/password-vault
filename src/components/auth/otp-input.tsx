'use client'; 
import { useMemo, useRef } from 'react'; 
type OtpInputProps = { value: string; onChange: (next: string) => void; length?: number; ariaLabel?: string; emptyMask?: string; }; 
export function OtpInput({ value, onChange, length = 6, ariaLabel = 'OTP input', emptyMask = '-' }: OtpInputProps) { 
  const inputRef = useRef<HTMLInputElement | null>(null); 
  const chars = useMemo(() => Array.from({ length: length }, (_, i) => value[i] ?? ''), [length, value]); 
  const toDigits = (raw: string) => raw.split('').filter((ch) => '0123456789'.indexOf(ch) !== -1).join('').slice(0, length); 
  return (<div className='w-full'><input ref={inputRef} value={value} onChange={(e) => onChange(toDigits(e.target.value))} inputMode='numeric' autoComplete='one-time-code' className='sr-only' /><button type='button' onClick={() => inputRef.current?.focus()} className='grid w-full grid-cols-6 gap-3' aria-label={ariaLabel}>{chars.map((ch, idx) => (<span key={idx} className={`flex h-[54px] items-center justify-center rounded-[16px] border text-app-h2 font-semibold transition ${ch ? 'border-cyan-300 bg-cyan-50 text-blue-700 shadow-[0_6px_16px_rgba(34,211,238,0.25)]' : 'border-white/60 bg-white/95 text-slate-400'}`}>{ch || emptyMask}</span>))}</button></div>); 
} 

