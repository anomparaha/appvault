import type { IconProps } from "./types";
import { IconEth } from "./chains/IconEth";
import { IconBsc } from "./chains/IconBsc";
import { IconSol } from "./chains/IconSol";
import { IconBase } from "./chains/IconBase";
import { IconArb } from "./chains/IconArb";
import { IconBtc } from "./chains/IconBtc";
import { IconRobinhood } from "./chains/IconRobinhood";

export function ChainIcon({ chain, size = 16, className }: { chain: string } & IconProps) {
  const c = chain.toLowerCase();
  if (c === "btc" || c === "bitcoin") return <IconBtc size={size} className={className} />;
  if (c === "eth" || c === "ethereum" || c === "evm") return <IconEth size={size} className={className} />;
  if (c === "bsc" || c === "bnb") return <IconBsc size={size} className={className} />;
  if (c === "sol" || c === "solana") return <IconSol size={size} className={className} />;
  if (c === "base") return <IconBase size={size} className={className} />;
  if (c === "arb" || c === "arbitrum") return <IconArb size={size} className={className} />;
  if (c === "robinhood" || c === "rh") return <IconRobinhood size={size} className={className} />;
  return null;
}
