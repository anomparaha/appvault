import type { IconProps } from "../types";
import ethSvg from "../../assets/icons/chains/eth.svg";

export function IconEth({ size = 16, className }: IconProps) {
  return <img src={ethSvg} width={size} height={size} className={className} alt="ETH" style={{ verticalAlign: "middle", flexShrink: 0, display: "inline-block" }} />;
}
