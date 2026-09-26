import type { IconProps } from "../types";

export function IconExport({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M5 21h14" />
    </svg>
  );
}
