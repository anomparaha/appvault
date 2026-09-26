import type { IconProps } from "../types";
import rhSvg from "../../assets/icons/chains/rh.svg";

export function IconRobinhood({ size = 16, className }: IconProps) {
  return (
    <img
      src={rhSvg}
      width={size}
      height={size}
      className={className}
      alt="Robinhood"
      style={{ verticalAlign: "middle", flexShrink: 0, display: "inline-block" }}
    />
  );
}

