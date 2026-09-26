import type { IconProps } from "../types";
import arbSvg from "../../assets/icons/chains/arb.svg";

export function IconArb({ size = 16, className }: IconProps) {
  return <img src={arbSvg} width={size} height={size} className={className} alt="Arbitrum" style={{ verticalAlign: "middle", flexShrink: 0, display: "inline-block" }} />;
}
