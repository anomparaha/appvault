import type { IconProps } from "../types";
import solSvg from "../../assets/icons/chains/sol.svg";

export function IconSol({ size = 16, className }: IconProps) {
  return <img src={solSvg} width={size} height={size} className={className} alt="SOL" style={{ verticalAlign: "middle", flexShrink: 0, display: "inline-block" }} />;
}
