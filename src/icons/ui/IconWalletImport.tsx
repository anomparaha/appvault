import type { IconProps } from "../types";

export function IconWalletImport({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="6" width="18" height="13" rx="3" fill="currentColor" opacity="0.14" />
      <path
        d="M19 8H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 11h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="17" cy="14.5" r="1" fill="currentColor" />
      <path
        d="M12 3v6m0 0-2.5-2.5M12 9l2.5-2.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
