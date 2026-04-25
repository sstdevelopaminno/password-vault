import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type OcrLanguageCode = 'tha+eng' | 'tha' | 'eng';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_TRANSLATE_INPUT_CHARS = 12000;

function normalizeMode(raw: unknown): OcrLanguageCode {
 const value = String(raw ?? '').trim().toLowerCase();
 if (value === 'tha') return 'tha';
 if (value === 'eng') return 'eng';
 return 'tha+eng';
}

function sanitizeText(raw: unknown) {
 return String(raw ?? '')
 .replace(/\r\n/g, '\n')
 .trim();
}

function unwrapQuoted(value: string) {
 const trimmed = value.trim();
 if (
 trimmed.length >= 2 &&
 ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
 ) {
 return trimmed.slice(1, -1);
 }
 return trimmed;
}

function getOpenAiApiKey() {
 const raw = process.env.OPENAI_API_KEY;
 if (!raw) return '';
 return unwrapQuoted(raw);
}

function getTranslationModel() {
 const fromEnv = String(process.env.OPENAI_TRANSLATE_MODEL ?? '').trim();
 return fromEnv || 'gpt-4.1-mini';
}

function buildPrompt(mode: OcrLanguageCode, text: string) {
 const commonRules = [
 'Translate faithfully and preserve meaning.',
 'Keep URLs, emails, codes, numbers, dates, and line breaks as close to original as possible.',
 'Return plain text only. No markdown.',
 ];
 if (mode === 'tha') {
 return [
 ...commonRules,
 'Target language: Thai only.',
 '',
 'Text to translate:',
 text,
 ].join('\n');
 }
 if (mode === 'eng') {
 return [
 ...commonRules,
 'Target language: English only.',
 '',
 'Text to translate:',
 text,
 ].join('\n');
 }
 return [
 ...commonRules,
 'Target output: both Thai and English.',
 'Format exactly:',
 'Thai:',
 '<thai translation>',
 '',
 'English:',
 '<english translation>',
 '',
 'Text to translate:',
 text,
 ].join('\n');
}

function readResponseError(payload: unknown) {
 if (!payload || typeof payload !== 'object') return '';
 const maybe = payload as { error?: unknown };
 if (maybe.error && typeof maybe.error === 'object') {
 const message = (maybe.error as { message?: unknown }).message;
 if (typeof message === 'string') return message;
 }
 return '';
}

function extractOutputText(payload: unknown) {
 if (!payload || typeof payload !== 'object') return '';
 const direct = (payload as { output_text?: unknown }).output_text;
 if (typeof direct === 'string' && direct.trim()) return direct;

 const output = (payload as { output?: unknown }).output;
 if (!Array.isArray(output)) return '';

 const parts: string[] = [];
 for (const item of output) {
 if (!item || typeof item !== 'object') continue;
 const content = (item as { content?: unknown }).content;
 if (!Array.isArray(content)) continue;
 for (const part of content) {
 if (!part || typeof part !== 'object') continue;
 const type = (part as { type?: unknown }).type;
 const text = (part as { text?: unknown }).text;
 if (type === 'output_text' && typeof text === 'string' && text.trim()) {
 parts.push(text);
 }
 }
 }

 return parts.join('\n').trim();
}

export async function POST(req: Request) {
 const supabase = await createClient();
 const {
 data: { user },
 } = await supabase.auth.getUser();
 if (!user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const payload = await req.json().catch(() => ({}));
 const text = sanitizeText((payload as { text?: unknown }).text);
 const mode = normalizeMode((payload as { mode?: unknown }).mode);

 if (!text) {
 return NextResponse.json({ error: 'Text is required' }, { status: 400 });
 }
 if (text.length > MAX_TRANSLATE_INPUT_CHARS) {
 return NextResponse.json({ error: 'Text is too long for translation' }, { status: 400 });
 }

 const apiKey = getOpenAiApiKey();
 if (!apiKey) {
 return NextResponse.json(
 { error: 'Translation service is not configured. Missing OPENAI_API_KEY.' },
 { status: 503 },
 );
 }

 const response = await fetch(OPENAI_RESPONSES_URL, {
 method: 'POST',
 headers: {
 Authorization: 'Bearer ' + apiKey,
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 model: getTranslationModel(),
 input: [
 {
 role: 'system',
 content: 'You are a professional translator for Thai and English.',
 },
 {
 role: 'user',
 content: buildPrompt(mode, text),
 },
 ],
 temperature: 0,
 }),
 });

 const body = await response.json().catch(() => ({}));
 if (!response.ok) {
 const errorMessage = readResponseError(body);
 return NextResponse.json(
 { error: errorMessage || 'Translation provider request failed' },
 { status: 502 },
 );
 }

 const translatedText = extractOutputText(body);
 if (!translatedText) {
 return NextResponse.json({ error: 'Translation output is empty' }, { status: 502 });
 }

 return NextResponse.json({ text: translatedText, mode: mode });
}
