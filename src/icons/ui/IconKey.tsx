import type { IconProps } from "../types";

export function IconKey({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4" /><path d="m10.5 12.5 21 2" /><path d="M18 5l3 3" />
    </svg>
  );
}
