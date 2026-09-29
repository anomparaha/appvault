import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';

interface TooltipState {
  visible: boolean;
  text: string;
  pos: 'top' | 'bottom' | 'left' | 'right';
  targetRect: DOMRect | null;
}

let lastActiveTime = 0;

export function GlobalTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    text: '',
    pos: 'top',
    targetRect: null,
  });

  const [coords, setCoords] = useState<{ x: number; y: number; actualPos: 'top' | 'bottom' | 'left' | 'right'; arrowOffset: number }>({
    x: -9999,
    y: -9999,
    actualPos: 'top',
    arrowOffset: 50,
  });

  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTargetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handlePointerOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.('[data-tooltip], [title]') as HTMLElement | null;
      if (!el) return;

      // Ignore buttons, action bars, and elements marked as no-tooltip
      if (el.closest('.no-tooltip, .import-src-card, [data-no-tooltip], button, .btn, .actions')) {
        el.removeAttribute('title');
        el.removeAttribute('data-tooltip');
        return;
      }

      // Intercept and sanitize native title attribute to prevent ugly OS popups
      if (el.hasAttribute('title')) {
        const rawTitle = el.getAttribute('title') || '';
        if (rawTitle.trim()) {
          el.setAttribute('data-tooltip', rawTitle.trim());
          el.removeAttribute('title');
          el.setAttribute('data-plurivex-title', rawTitle.trim());
        } else {
          el.removeAttribute('title');
          return;
        }
      }

      const text = el.getAttribute('data-tooltip')?.trim();
      if (!text) return;

      const requestedPos = (el.getAttribute('data-tooltip-pos') as 'top' | 'bottom' | 'left' | 'right') || 'top';
      activeTargetRef.current = el;

      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      // Warm transitions: if another tooltip was active recently, show immediately (0ms), otherwise 100ms
      const isWarm = Date.now() - lastActiveTime < 250;
      const delay = isWarm ? 0 : 110;

      timeoutRef.current = setTimeout(() => {
        if (activeTargetRef.current === el && document.body.contains(el)) {
          lastActiveTime = Date.now();
          setTooltip({
            visible: true,
            text,
            pos: requestedPos,
            targetRect: el.getBoundingClientRect(),
          });
        }
      }, delay);
    };

    const handlePointerOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (activeTargetRef.current && related && activeTargetRef.current.contains(related)) {
        return;
      }
      activeTargetRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      lastActiveTime = Date.now();
      setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    const handleDismiss = () => {
      activeTargetRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      setCoords({ x: -9999, y: -9999, actualPos: 'top', arrowOffset: 50 });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };

    document.addEventListener('mouseover', handlePointerOver, { passive: true });
    document.addEventListener('mouseout', handlePointerOut, { passive: true });
    document.addEventListener('mousedown', handleDismiss, { passive: true });
    document.addEventListener('scroll', handleDismiss, { capture: true, passive: true });
    document.addEventListener('keydown', handleKeyDown, { passive: true });

    return () => {
      document.removeEventListener('mouseover', handlePointerOver);
      document.removeEventListener('mouseout', handlePointerOut);
      document.removeEventListener('mousedown', handleDismiss);
      document.removeEventListener('scroll', handleDismiss, { capture: true });
      document.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Compute position and viewport collision
  useLayoutEffect(() => {
    if (!tooltip.visible || !tooltip.targetRect || !tooltipRef.current) return;

    const elRect = tooltip.targetRect;
    const ttRect = tooltipRef.current.getBoundingClientRect();
    const margin = 7;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let actualPos = tooltip.pos;
    let x = 0;
    let y = 0;

    // Flip vertical if collision with viewport edges
    if (actualPos === 'top' && elRect.top - ttRect.height - margin < 6) {
      actualPos = 'bottom';
    } else if (actualPos === 'bottom' && elRect.bottom + ttRect.height + margin > vh - 6) {
      actualPos = 'top';
    }

    if (actualPos === 'top') {
      y = elRect.top - ttRect.height - margin;
      x = elRect.left + elRect.width / 2 - ttRect.width / 2;
    } else if (actualPos === 'bottom') {
      y = elRect.bottom + margin;
      x = elRect.left + elRect.width / 2 - ttRect.width / 2;
    } else if (actualPos === 'left') {
      x = elRect.left - ttRect.width - margin;
      y = elRect.top + elRect.height / 2 - ttRect.height / 2;
    } else if (actualPos === 'right') {
      x = elRect.right + margin;
      y = elRect.top + elRect.height / 2 - ttRect.height / 2;
    }

    // Clamp horizontally to avoid offscreen
    const clampedX = Math.max(8, Math.min(x, vw - ttRect.width - 8));
    const clampedY = Math.max(6, Math.min(y, vh - ttRect.height - 6));

    // Calculate caret arrow offset relative to trigger center
    const targetCenterX = elRect.left + elRect.width / 2;
    let arrowOffset = targetCenterX - clampedX;
    arrowOffset = Math.max(12, Math.min(arrowOffset, ttRect.width - 12));

    setCoords({ x: clampedX, y: clampedY, actualPos, arrowOffset });
  }, [tooltip.visible, tooltip.targetRect, tooltip.text, tooltip.pos]);

  if (!tooltip.visible && coords.x === -9999) return null;

  // Shortcut parsing: "Action (SHORTCUT)" => label + kbd
  const shortcutMatch = tooltip.text.match(/^(.*?)\s*\(([^)]+)\)$/);
  const mainLabel = shortcutMatch ? shortcutMatch[1].trim() : tooltip.text;
  const shortcutPill = shortcutMatch ? shortcutMatch[2].trim() : null;

  return ReactDOM.createPortal(
    <div
      ref={tooltipRef}
      className={`pvx-tooltip-portal ${tooltip.visible && coords.x !== -9999 ? 'pvx-tooltip-visible' : ''}`}
      data-pos={coords.actualPos}
      style={{
        left: `${coords.x}px`,
        top: `${coords.y}px`,
      }}
      role="tooltip"
      aria-hidden={!tooltip.visible}
    >
      <div
        className="pvx-tooltip-arrow"
        style={
          coords.actualPos === 'top' || coords.actualPos === 'bottom'
            ? { left: `${coords.arrowOffset}px`, marginLeft: '-4px' }
            : { top: '50%', marginTop: '-4px' }
        }
      />
      <div className="pvx-tooltip-content">
        <span className="pvx-tooltip-text">{mainLabel}</span>
        {shortcutPill && <kbd className="pvx-tooltip-kbd">{shortcutPill}</kbd>}
      </div>
    </div>,
    document.body
  );
}

/**
 * Optional declarative wrapper component:
 * <Tooltip content="Copy EVM Address" pos="bottom">
 *   <button>...</button>
 * </Tooltip>
 */
export function Tooltip({
  children,
  content,
  pos = 'top',
}: {
  children: React.ReactElement;
  content: string;
  pos?: 'top' | 'bottom' | 'left' | 'right';
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return React.cloneElement(children as React.ReactElement<any>, {
    'data-tooltip': content,
    'data-tooltip-pos': pos,
  });
}
