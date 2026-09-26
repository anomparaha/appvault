import type { IconProps } from "../types";
import bscSvg from "../../assets/icons/chains/bsc.svg";

export function IconBsc({ size = 16, className }: IconProps) {
  return <img src={bscSvg} width={size} height={size} className={className} alt="BSC" style={{ verticalAlign: "middle", flexShrink: 0, display: "inline-block" }} />;
}
