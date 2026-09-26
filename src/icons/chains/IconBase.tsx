import type { IconProps } from "../types";
import baseSvg from "../../assets/icons/chains/base.svg";

export function IconBase({ size = 16, className }: IconProps) {
  return <img src={baseSvg} width={size} height={size} className={className} alt="Base" style={{ verticalAlign: "middle", flexShrink: 0, display: "inline-block" }} />;
}
