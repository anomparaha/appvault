import { useCallback, useState } from 'react';
import type { ToastMessage, ToastType } from '../../lib/types';

export function useToastState() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback((text: string, type: ToastType = 'info') => {
    setToasts((prev) => {
      // Prevent duplicate stacked notifications with identical text
      if (prev.some((t) => t.text === text)) return prev;
      const id = Date.now() + Math.random();
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2400);
      return [...prev, { id, text, type }];
    });
  }, []);

  return { toasts, toast };
}
