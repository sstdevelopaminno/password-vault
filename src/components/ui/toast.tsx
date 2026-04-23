"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error";

type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const SWIPE_DISMISS_DISTANCE = 62;
const SWIPE_MAX_OFFSET = 160;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [swipeOffsets, setSwipeOffsets] = useState<Record<string, number>>({});
  const [swipingId, setSwipingId] = useState<string | null>(null);
  const swipeRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    deltaX: number;
    dragging: boolean;
  } | null>(null);
  const swallowClickRef = useRef<{ id: string; until: number } | null>(null);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    setSwipeOffsets((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = crypto.randomUUID();
    setToasts((prev) => {
      if (prev.some((toast) => toast.type === type && toast.message === message)) {
        return prev;
      }
      return [...prev, { id, message, type }];
    });
    window.setTimeout(() => {
      removeToast(id);
    }, 1_600);
  }, [removeToast]);

  const beginSwipe = useCallback((id: string, pointerId: number, clientX: number, clientY: number) => {
    swipeRef.current = {
      id,
      pointerId,
      startX: clientX,
      startY: clientY,
      deltaX: 0,
      dragging: false,
    };
    setSwipingId(id);
  }, []);

  const moveSwipe = useCallback((pointerId: number, clientX: number, clientY: number) => {
    const current = swipeRef.current;
    if (!current || current.pointerId !== pointerId) return false;

    const dx = clientX - current.startX;
    const dy = clientY - current.startY;

    if (!current.dragging) {
      if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return false;
      current.dragging = true;
    }

    const nextOffset = Math.max(-SWIPE_MAX_OFFSET, Math.min(SWIPE_MAX_OFFSET, dx));
    current.deltaX = nextOffset;
    setSwipeOffsets((prev) => {
      if (prev[current.id] === nextOffset) return prev;
      return { ...prev, [current.id]: nextOffset };
    });
    return true;
  }, []);

  const endSwipe = useCallback((pointerId: number, cancelled = false) => {
    const current = swipeRef.current;
    if (!current || current.pointerId !== pointerId) return;

    swipeRef.current = null;
    const id = current.id;
    const offset = cancelled ? 0 : current.deltaX;
    const dismiss = !cancelled && Math.abs(offset) >= SWIPE_DISMISS_DISTANCE;

    if (current.dragging) {
      swallowClickRef.current = { id, until: Date.now() + 260 };
    }

    if (dismiss) {
      setSwipeOffsets((prev) => ({ ...prev, [id]: Math.sign(offset) * (SWIPE_MAX_OFFSET + 64) }));
      window.setTimeout(() => removeToast(id), 100);
    } else {
      setSwipeOffsets((prev) => ({ ...prev, [id]: 0 }));
      window.setTimeout(() => {
        setSwipeOffsets((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 200);
    }

    setSwipingId(null);
  }, [removeToast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),12px)] z-[70] mx-auto flex w-full max-w-[460px] flex-col gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto will-change-transform"
            style={{
              transform: `translateX(${swipeOffsets[toast.id] ?? 0}px)`,
              opacity: 1 - Math.min(Math.abs(swipeOffsets[toast.id] ?? 0) / 220, 0.45),
              transition: swipingId === toast.id ? "none" : "transform 180ms ease, opacity 180ms ease",
              touchAction: "pan-y",
            }}
            onPointerDown={(event) => {
              if (event.pointerType === "mouse" && event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              beginSwipe(toast.id, event.pointerId, event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
              const handled = moveSwipe(event.pointerId, event.clientX, event.clientY);
              if (handled) event.preventDefault();
            }}
            onPointerUp={(event) => {
              endSwipe(event.pointerId);
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={(event) => {
              endSwipe(event.pointerId, true);
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onClickCapture={(event) => {
              const gate = swallowClickRef.current;
              if (gate && gate.id === toast.id && Date.now() < gate.until) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-label={toast.type === "success" ? "Success notification" : "Error notification"}
          >
            <div
              className={cn(
                "rounded-2xl border px-4 py-3 text-app-body text-white shadow-[0_14px_34px_rgba(10,20,40,0.22)] backdrop-blur",
                toast.type === "success"
                  ? "border-emerald-200/45 bg-emerald-500/92"
                  : "border-rose-200/45 bg-rose-500/92",
              )}
            >
              <div className="flex items-center gap-2">
                {toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                <span>{toast.message}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

