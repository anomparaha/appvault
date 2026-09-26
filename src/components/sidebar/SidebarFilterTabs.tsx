import { ChainIcon } from "../../icons/ChainIcon";
import type { Filter } from "./WalletRow";

interface SidebarFilterTabsProps {
  totalCount: number;
  filter: Filter;
  setFilter: (f: Filter) => void;
  chainFilter: string;
  setChainFilter: (c: string) => void;
  fundedCount: number;
  bscFundedCount: number;
  solFundedCount: number;
  ethFundedCount: number;
  btcFundedCount: number;
  baseFundedCount: number;
  arbFundedCount: number;
  robinhoodFundedCount?: number;
  existingTags: string[];
  tagFilter: string | null;
  setTagFilter: (t: string | null) => void;
  activeScopeFundedCount: number;
  selectedSweepCount: number;
  isAllFundedSelected: boolean;
  onSelectAllFunded: (filter?: "all" | "evm" | "sol") => void;
  onClearSweepSelection: () => void;
}

export function SidebarFilterTabs({
  totalCount,
  filter,
  setFilter,
  chainFilter,
  setChainFilter,
  fundedCount,
  bscFundedCount,
  solFundedCount,
  ethFundedCount,
  btcFundedCount,
  baseFundedCount,
  arbFundedCount,
  robinhoodFundedCount = 0,
  existingTags,
  tagFilter,
  setTagFilter,
  activeScopeFundedCount,
  selectedSweepCount,
  isAllFundedSelected,
  onSelectAllFunded,
  onClearSweepSelection,
}: SidebarFilterTabsProps) {
  return (
    <>
      <div className="filter-tabs filter-tabs-5">
        <button
          type="button"
          className={`filter-tab${filter === "all" ? " active" : ""}`}
          onClick={() => {
            setFilter("all");
            setChainFilter("all");
          }}
        >
          All <span className="tab-pill-count">{totalCount.toLocaleString()}</span>
        </button>
        <button
          type="button"
          className={`filter-tab funded-tab${filter === "funded" ? " active" : ""}`}
          onClick={() => setFilter("funded")}
        >
          Funded <span className="tab-pill-count funded-pill">{fundedCount}</span>
        </button>
        <button
          type="button"
          className={`filter-tab btc-tab${filter === "btc" ? " active" : ""}`}
          onClick={() => {
            setFilter("btc");
            setChainFilter("all");
          }}
        >
          BTC
        </button>
        <button
          type="button"
          className={`filter-tab${filter === "evm" ? " active" : ""}`}
          onClick={() => {
            setFilter("evm");
            setChainFilter("all");
          }}
        >
          EVM
        </button>
        <button
          type="button"
          className={`filter-tab${filter === "sol" ? " active" : ""}`}
          onClick={() => {
            setFilter("sol");
            setChainFilter("all");
          }}
        >
          SOL
        </button>
      </div>

      <div className="sidebar-filter-zone">
        {filter === "funded" && (
          <div className="chain-filter-scroll">
            <button
              type="button"
              className={`chain-pill ${chainFilter === "all" ? "active" : ""}`}
              onClick={() => setChainFilter("all")}
            >
              All Funded ({fundedCount})
            </button>
            <button
              type="button"
              className={`chain-pill chain-pill-btc ${chainFilter === "btc" ? "active" : ""}`}
              onClick={() => setChainFilter(chainFilter === "btc" ? "all" : "btc")}
            >
              <ChainIcon chain="btc" size={11} /> BTC ({btcFundedCount})
            </button>
            <button
              type="button"
              className={`chain-pill chain-pill-eth ${chainFilter === "eth" ? "active" : ""}`}
              onClick={() => setChainFilter(chainFilter === "eth" ? "all" : "eth")}
            >
              <ChainIcon chain="eth" size={11} /> ETH ({ethFundedCount})
            </button>
            <button
              type="button"
              className={`chain-pill chain-pill-robinhood ${chainFilter === "robinhood" ? "active" : ""}`}
              onClick={() => setChainFilter(chainFilter === "robinhood" ? "all" : "robinhood")}
            >
              <ChainIcon chain="robinhood" size={11} /> RH ({robinhoodFundedCount})
            </button>
            {baseFundedCount > 0 && (
              <button
                type="button"
                className={`chain-pill chain-pill-base ${chainFilter === "base" ? "active" : ""}`}
                onClick={() => setChainFilter(chainFilter === "base" ? "all" : "base")}
              >
                <ChainIcon chain="base" size={11} /> BASE ({baseFundedCount})
              </button>
            )}
            {arbFundedCount > 0 && (
              <button
                type="button"
                className={`chain-pill chain-pill-arb ${chainFilter === "arb" ? "active" : ""}`}
                onClick={() => setChainFilter(chainFilter === "arb" ? "all" : "arb")}
              >
                <ChainIcon chain="arb" size={11} /> ARB ({arbFundedCount})
              </button>
            )}
            <button
              type="button"
              className={`chain-pill chain-pill-bsc ${chainFilter === "bsc" ? "active" : ""}`}
              onClick={() => setChainFilter(chainFilter === "bsc" ? "all" : "bsc")}
            >
              <ChainIcon chain="bsc" size={11} /> BNB ({bscFundedCount})
            </button>
            <button
              type="button"
              className={`chain-pill chain-pill-sol ${chainFilter === "sol" ? "active" : ""}`}
              onClick={() => setChainFilter(chainFilter === "sol" ? "all" : "sol")}
            >
              <ChainIcon chain="sol" size={11} /> SOL ({solFundedCount})
            </button>
          </div>
        )}

        {/* Tag / Folder Directory Scroll Bar */}
        <div className="tag-filter-scroll">
          <button
            type="button"
            className={`tag-pill ${tagFilter === null ? "active" : ""}`}
            onClick={() => setTagFilter(null)}
          >
            All Tags
          </button>
          <button
            type="button"
            className={`tag-pill tag-pill-main ${tagFilter?.toLowerCase() === "main" ? "active" : ""}`}
            onClick={() => setTagFilter(tagFilter?.toLowerCase() === "main" ? null : "main")}
          >
            Main
          </button>
          <button
            type="button"
            className={`tag-pill tag-pill-airdrop ${tagFilter?.toLowerCase() === "airdrop" ? "active" : ""}`}
            onClick={() => setTagFilter(tagFilter?.toLowerCase() === "airdrop" ? null : "airdrop")}
          >
            Airdrop
          </button>
          <button
            type="button"
            className={`tag-pill tag-pill-whales ${tagFilter?.toLowerCase() === "whales" ? "active" : ""}`}
            onClick={() => setTagFilter(tagFilter?.toLowerCase() === "whales" ? null : "whales")}
          >
            Whales
          </button>
          <button
            type="button"
            className={`tag-pill tag-pill-burner ${tagFilter?.toLowerCase() === "burner" ? "active" : ""}`}
            onClick={() => setTagFilter(tagFilter?.toLowerCase() === "burner" ? null : "burner")}
          >
            Burner
          </button>
          {existingTags
            .filter((t) => !["main", "airdrop", "whales", "burner"].includes(t.toLowerCase()))
            .map((t) => (
              <button
                key={t}
                type="button"
                className={`tag-pill ${tagFilter?.toLowerCase() === t.toLowerCase() ? "active" : ""}`}
                onClick={() => setTagFilter(tagFilter?.toLowerCase() === t.toLowerCase() ? null : t)}
              >
                #{t}
              </button>
            ))}
        </div>

        {/* Batch Selection Toolbar */}
        {(activeScopeFundedCount > 0 || selectedSweepCount > 0) && (
          <div className="sidebar-batch-bar">
            {activeScopeFundedCount > 0 && (
              <button
                type="button"
                className={`batch-action-btn ${isAllFundedSelected ? "active" : ""}`}
                onClick={() => {
                  if (filter === "sol") {
                    onSelectAllFunded("sol");
                  } else if (filter === "evm") {
                    onSelectAllFunded("evm");
                  } else {
                    onSelectAllFunded("all");
                  }
                }}
                data-tooltip={isAllFundedSelected ? "Deselect all funded wallets" : "Select all funded wallets"}
              >
                {isAllFundedSelected ? "Deselect Funded" : `Select All Funded (${activeScopeFundedCount})`}
              </button>
            )}

            {selectedSweepCount > 0 && (
              <button
                type="button"
                className="batch-action-btn btn-clear-selection"
                onClick={onClearSweepSelection}
                data-tooltip="Clear all selected checkboxes"
              >
                Clear ({selectedSweepCount})
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
