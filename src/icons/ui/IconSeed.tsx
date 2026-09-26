import type { IconProps } from "../types";

export function IconSeed({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22c-4-3-7-7-7-11a7 7 0 0 1 14 0c0 4-3 8-7 11z" /><path d="M12 11v6" />
    </svg>
  );
}
