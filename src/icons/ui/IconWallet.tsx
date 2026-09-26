import type { IconProps } from "../types";

export function IconWallet({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 7H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
      <path d="M17 14h.01" /><path d="M3 10h18" />
    </svg>
  );
}
