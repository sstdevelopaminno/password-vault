# UI Regression Checklist (2026-04-24)

## Scope
- Home calendar popup flow
- Notes OCR flow
- Billing OCR flow
- Core Thai i18n rendering safety

## Automated checks
- `npm run lint` passed
- `npm run typecheck` passed
- `npm run check:i18n` passed
- `npm run build` passed
- `npm run check:secrets` passed

## Button + interaction checks
- Verified touched pages use explicit `type='button'` for click actions:
  - `src/app/(user)/home/page.tsx`
  - `src/app/(user)/notes/page.tsx`
  - `src/app/(user)/billing/page.tsx`
- Verified icon-only controls in touched pages include `aria-label` where needed (close, month navigation, popup actions).

## Calendar popup checks (Home)
- Open/close popup action present and typed button
- Previous/next month controls include accessible labels
- Loading / error / empty / list states render
- Thai and English labels render via `tr(...)`

## OCR flow checks
- OCR worker reuse added with shared cache:
  - `src/lib/ocr-worker.ts`
- Notes and Billing OCR now use shared worker:
  - `src/app/(user)/notes/page.tsx`
  - `src/app/(user)/billing/page.tsx`
- Worker cleanup on unmount is present to prevent long-lived idle memory usage.

## Risks to watch in next pass
- OCR accuracy variance by image quality remains external to UI logic
- Real device camera capture latency should be validated on low-end Android hardware
