# Mint Tab & Auction Modal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Mint tab for test minting NFTs/tokens, NFT selector in auction creation, and auction detail modal with actions.

**Architecture:** New Mint page with balance display and one-click minting. NFT selector uses ERC721Enumerable to list user's NFTs. Auction cards open modal with full details and contextual action buttons based on user role and auction status.

**Tech Stack:** React, wagmi, viem, DaisyUI, lucide-react

---

## Task 1: Add ERC721Enumerable to AuctionNFT Contract

**Files:**
- Modify: `packages/hardhat/contracts/AuctionNFT.sol`

**Step 1: Update contract imports and inheritance**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { ERC721URIStorage } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/// @title AuctionNFT
/// @notice A simple ERC721 for the sealed bid auction demo
contract AuctionNFT is ERC721, ERC721Enumerable, ERC721URIStorage {
    uint256 private _nextTokenId;

    constructor() ERC721("Auction NFT", "ANFT") {}

    /// @notice Mint a new NFT
    /// @param to The address to mint to
    /// @param uri The token URI (metadata)
    /// @return tokenId The ID of the minted token
    function mint(address to, string memory uri) external returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _mint(to, tokenId);
        _setTokenURI(tokenId, uri);
    }

    // Required overrides for multiple inheritance
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
```

**Step 2: Verify contract compiles**

Run: `cd packages/hardhat && pnpm hardhat compile`
Expected: Compilation successful

**Step 3: Commit**

```bash
git add packages/hardhat/contracts/AuctionNFT.sol
git commit -m "feat(contract): add ERC721Enumerable to AuctionNFT"
```

---

## Task 2: Update ABI with ERC721Enumerable Functions

**Files:**
- Modify: `packages/nextjs/utils/auctionContracts.ts`

**Step 1: Add enumerable functions to auctionNftAbi**

Add these entries to the `auctionNftAbi` array:

```typescript
{
  inputs: [{ name: "owner", type: "address" }],
  name: "balanceOf",
  outputs: [{ name: "", type: "uint256" }],
  stateMutability: "view",
  type: "function",
},
{
  inputs: [
    { name: "owner", type: "address" },
    { name: "index", type: "uint256" },
  ],
  name: "tokenOfOwnerByIndex",
  outputs: [{ name: "", type: "uint256" }],
  stateMutability: "view",
  type: "function",
},
{
  inputs: [],
  name: "totalSupply",
  outputs: [{ name: "", type: "uint256" }],
  stateMutability: "view",
  type: "function",
},
```

**Step 2: Verify TypeScript compiles**

Run: `cd packages/nextjs && pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/nextjs/utils/auctionContracts.ts
git commit -m "feat(frontend): add ERC721Enumerable ABI functions"
```

---

## Task 3: Create useMint Hook

**Files:**
- Create: `packages/nextjs/hooks/useMint.ts`

**Step 1: Create the hook**

```typescript
"use client";

import { useState, useCallback } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import toast from "react-hot-toast";
import { auctionNftAbi, auctionTokenAbi } from "@/utils/auctionContracts";

const NFT_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS as `0x${string}`;
const TOKEN_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ADDRESS as `0x${string}`;

// Fixed mint amounts
const NFT_MINT_COUNT = 1;
const TOKEN_MINT_AMOUNT = BigInt(1000 * 1_000_000); // 1000 tokens with 6 decimals

export function useMint() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();

  const [isLoading, setIsLoading] = useState(false);

  /**
   * Get user's NFT balance
   */
  const getNftBalance = useCallback(async (): Promise<bigint> => {
    if (!publicClient || !address) return BigInt(0);

    try {
      const balance = await publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: auctionNftAbi,
        functionName: "balanceOf",
        args: [address],
      });
      return balance as bigint;
    } catch (error) {
      console.error("Failed to get NFT balance:", error);
      return BigInt(0);
    }
  }, [publicClient, address]);

  /**
   * Get user's token balance (plaintext)
   */
  const getTokenBalance = useCallback(async (): Promise<bigint> => {
    if (!publicClient || !address) return BigInt(0);

    try {
      const balance = await publicClient.readContract({
        address: TOKEN_CONTRACT_ADDRESS,
        abi: auctionTokenAbi,
        functionName: "balanceOf",
        args: [address],
      });
      return balance as bigint;
    } catch (error) {
      console.error("Failed to get token balance:", error);
      return BigInt(0);
    }
  }, [publicClient, address]);

  /**
   * Mint 1 NFT to the connected user
   */
  const mintNft = useCallback(async (): Promise<boolean> => {
    if (!walletClient || !address || !publicClient) {
      toast.error("Wallet not connected");
      return false;
    }

    setIsLoading(true);

    try {
      toast.loading("Minting NFT...", { id: "mint-nft" });

      const hash = await walletClient.writeContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: auctionNftAbi,
        functionName: "mint",
        args: [address, ""],
      });

      await publicClient.waitForTransactionReceipt({ hash });

      toast.success("NFT minted successfully!", { id: "mint-nft" });
      return true;
    } catch (error) {
      console.error("Failed to mint NFT:", error);
      toast.error("Failed to mint NFT", { id: "mint-nft" });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [walletClient, address, publicClient]);

  /**
   * Mint 1000 tokens to the connected user
   */
  const mintTokens = useCallback(async (): Promise<boolean> => {
    if (!walletClient || !address || !publicClient) {
      toast.error("Wallet not connected");
      return false;
    }

    setIsLoading(true);

    try {
      toast.loading("Minting tokens...", { id: "mint-tokens" });

      const hash = await walletClient.writeContract({
        address: TOKEN_CONTRACT_ADDRESS,
        abi: auctionTokenAbi,
        functionName: "mint",
        args: [address, TOKEN_MINT_AMOUNT],
      });

      await publicClient.waitForTransactionReceipt({ hash });

      toast.success("1000 tokens minted successfully!", { id: "mint-tokens" });
      return true;
    } catch (error) {
      console.error("Failed to mint tokens:", error);
      toast.error("Failed to mint tokens", { id: "mint-tokens" });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [walletClient, address, publicClient]);

  return {
    isLoading,
    nftContractAddress: NFT_CONTRACT_ADDRESS,
    tokenContractAddress: TOKEN_CONTRACT_ADDRESS,
    getNftBalance,
    getTokenBalance,
    mintNft,
    mintTokens,
  };
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd packages/nextjs && pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/nextjs/hooks/useMint.ts
git commit -m "feat(frontend): add useMint hook for NFT and token minting"
```

---

## Task 4: Create useNFTOwnership Hook

**Files:**
- Create: `packages/nextjs/hooks/useNFTOwnership.ts`

**Step 1: Create the hook**

```typescript
"use client";

import { useState, useCallback } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { auctionNftAbi } from "@/utils/auctionContracts";

const NFT_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS as `0x${string}`;

export function useNFTOwnership() {
  const publicClient = usePublicClient();
  const { address } = useAccount();

  const [ownedTokenIds, setOwnedTokenIds] = useState<bigint[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Fetch all NFT token IDs owned by the connected user
   */
  const fetchOwnedNFTs = useCallback(async (): Promise<bigint[]> => {
    if (!publicClient || !address) {
      setOwnedTokenIds([]);
      return [];
    }

    setIsLoading(true);

    try {
      // Get the balance (number of NFTs owned)
      const balance = await publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: auctionNftAbi,
        functionName: "balanceOf",
        args: [address],
      });

      const count = Number(balance);
      const tokenIds: bigint[] = [];

      // Fetch each token ID by index
      for (let i = 0; i < count; i++) {
        const tokenId = await publicClient.readContract({
          address: NFT_CONTRACT_ADDRESS,
          abi: auctionNftAbi,
          functionName: "tokenOfOwnerByIndex",
          args: [address, BigInt(i)],
        });
        tokenIds.push(tokenId as bigint);
      }

      setOwnedTokenIds(tokenIds);
      return tokenIds;
    } catch (error) {
      console.error("Failed to fetch owned NFTs:", error);
      setOwnedTokenIds([]);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [publicClient, address]);

  return {
    ownedTokenIds,
    isLoading,
    fetchOwnedNFTs,
    nftContractAddress: NFT_CONTRACT_ADDRESS,
  };
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd packages/nextjs && pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/nextjs/hooks/useNFTOwnership.ts
git commit -m "feat(frontend): add useNFTOwnership hook for fetching user NFTs"
```

---

## Task 5: Create MintPage Component

**Files:**
- Create: `packages/nextjs/components/mint/MintPage.tsx`
- Create: `packages/nextjs/components/mint/index.ts`

**Step 1: Create MintPage component**

```typescript
"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { Coins, ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { useMint } from "@/hooks/useMint";

export const MintPage = () => {
  const { address } = useAccount();
  const { isLoading, getNftBalance, getTokenBalance, mintNft, mintTokens } = useMint();

  const [nftBalance, setNftBalance] = useState<bigint>(BigInt(0));
  const [tokenBalance, setTokenBalance] = useState<bigint>(BigInt(0));
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isWalletConnected = !!address;

  const refreshBalances = async () => {
    setIsRefreshing(true);
    const [nft, token] = await Promise.all([getNftBalance(), getTokenBalance()]);
    setNftBalance(nft);
    setTokenBalance(token);
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (isWalletConnected) {
      refreshBalances();
    }
  }, [isWalletConnected, address]);

  const handleMintNft = async () => {
    const success = await mintNft();
    if (success) {
      refreshBalances();
    }
  };

  const handleMintTokens = async () => {
    const success = await mintTokens();
    if (success) {
      refreshBalances();
    }
  };

  // Format token balance (6 decimals)
  const formattedTokenBalance = (Number(tokenBalance) / 1_000_000).toLocaleString();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-base-content uppercase tracking-wide">
          Mint Test Assets
        </h1>
        {isWalletConnected && (
          <button
            onClick={refreshBalances}
            disabled={isRefreshing}
            className="btn btn-ghost btn-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      {/* Wallet not connected warning */}
      {!isWalletConnected && (
        <div className="alert alert-warning">
          <span className="font-display uppercase tracking-wide text-sm">
            Please connect your wallet to mint test assets
          </span>
        </div>
      )}

      {/* Balances Display */}
      {isWalletConnected && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* NFT Balance Card */}
          <div className="bg-base-200 border border-base-300 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-primary/10 border border-primary/30">
                <ImageIcon className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-lg font-display font-bold text-base-content uppercase tracking-wide">
                NFT Balance
              </h2>
            </div>
            <p className="text-3xl font-mono text-base-content mb-2">
              {nftBalance.toString()}
            </p>
            <p className="text-sm text-base-content/50">Auction NFTs owned</p>
          </div>

          {/* Token Balance Card */}
          <div className="bg-base-200 border border-base-300 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-secondary/10 border border-secondary/30">
                <Coins className="w-5 h-5 text-secondary" />
              </div>
              <h2 className="text-lg font-display font-bold text-base-content uppercase tracking-wide">
                Token Balance
              </h2>
            </div>
            <p className="text-3xl font-mono text-base-content mb-2">
              {formattedTokenBalance}
            </p>
            <p className="text-sm text-base-content/50">AUCT tokens</p>
          </div>
        </div>
      )}

      {/* Mint Buttons */}
      {isWalletConnected && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Mint NFT Button */}
          <button
            onClick={handleMintNft}
            disabled={isLoading}
            className="btn btn-primary btn-lg font-display uppercase tracking-wide"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ImageIcon className="w-5 h-5" />
            )}
            Mint 1 NFT
          </button>

          {/* Mint Tokens Button */}
          <button
            onClick={handleMintTokens}
            disabled={isLoading}
            className="btn btn-secondary btn-lg font-display uppercase tracking-wide"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Coins className="w-5 h-5" />
            )}
            Mint 1000 Tokens
          </button>
        </div>
      )}

      {/* Info Section */}
      <div className="bg-base-200 border border-base-300 p-6">
        <h3 className="text-sm font-display font-bold text-base-content uppercase tracking-wide mb-3">
          About Test Assets
        </h3>
        <ul className="text-sm text-base-content/70 space-y-2">
          <li>• <strong>Auction NFTs</strong> can be listed for auction</li>
          <li>• <strong>AUCT tokens</strong> are used to place encrypted bids</li>
          <li>• These are test assets on Arbitrum Sepolia</li>
        </ul>
      </div>
    </div>
  );
};
```

**Step 2: Create barrel export**

```typescript
// packages/nextjs/components/mint/index.ts
export { MintPage } from "./MintPage";
```

**Step 3: Verify TypeScript compiles**

Run: `cd packages/nextjs && pnpm tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/nextjs/components/mint/
git commit -m "feat(frontend): add MintPage component with balance display"
```

---

## Task 6: Create NFTSelector Component

**Files:**
- Create: `packages/nextjs/components/auction/NFTSelector.tsx`

**Step 1: Create the component**

```typescript
"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { ImageIcon, Loader2, AlertCircle } from "lucide-react";
import { useNFTOwnership } from "@/hooks/useNFTOwnership";

interface NFTSelectorProps {
  selectedTokenId: bigint | null;
  onSelect: (tokenId: bigint | null) => void;
  disabled?: boolean;
}

export const NFTSelector = ({ selectedTokenId, onSelect, disabled }: NFTSelectorProps) => {
  const { address } = useAccount();
  const { ownedTokenIds, isLoading, fetchOwnedNFTs } = useNFTOwnership();

  useEffect(() => {
    if (address) {
      fetchOwnedNFTs();
    }
  }, [address, fetchOwnedNFTs]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "") {
      onSelect(null);
    } else {
      onSelect(BigInt(value));
    }
  };

  if (isLoading) {
    return (
      <div className="form-control">
        <label className="label">
          <span className="label-text font-pixel uppercase tracking-widest text-xs flex items-center gap-2">
            <ImageIcon className="w-3 h-3" />
            Select NFT
          </span>
        </label>
        <div className="input input-bordered flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-base-content/50" />
          <span className="ml-2 text-sm text-base-content/50">Loading NFTs...</span>
        </div>
      </div>
    );
  }

  if (ownedTokenIds.length === 0) {
    return (
      <div className="form-control">
        <label className="label">
          <span className="label-text font-pixel uppercase tracking-widest text-xs flex items-center gap-2">
            <ImageIcon className="w-3 h-3" />
            Select NFT
          </span>
        </label>
        <div className="alert alert-warning">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">
            You don't own any NFTs. Go to the <strong>Mint</strong> tab to mint some!
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="form-control">
      <label className="label">
        <span className="label-text font-pixel uppercase tracking-widest text-xs flex items-center gap-2">
          <ImageIcon className="w-3 h-3" />
          Select NFT
        </span>
      </label>
      <select
        value={selectedTokenId?.toString() ?? ""}
        onChange={handleChange}
        disabled={disabled}
        className="select select-bordered font-mono text-sm"
      >
        <option value="">Select an NFT...</option>
        {ownedTokenIds.map((tokenId) => (
          <option key={tokenId.toString()} value={tokenId.toString()}>
            NFT #{tokenId.toString()}
          </option>
        ))}
      </select>
    </div>
  );
};
```

**Step 2: Export from barrel**

Add to `packages/nextjs/components/auction/index.ts`:
```typescript
export { NFTSelector } from "./NFTSelector";
```

**Step 3: Verify TypeScript compiles**

Run: `cd packages/nextjs && pnpm tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/nextjs/components/auction/NFTSelector.tsx packages/nextjs/components/auction/index.ts
git commit -m "feat(frontend): add NFTSelector component for owned NFTs"
```

---

## Task 7: Update CreateAuctionForm with NFTSelector

**Files:**
- Modify: `packages/nextjs/components/auction/CreateAuctionForm.tsx`

**Step 1: Replace manual inputs with NFTSelector**

Update the component to:
- Import NFTSelector
- Remove nftContract state (use env address)
- Replace tokenId input with NFTSelector
- Use selectedTokenId state (bigint | null)

Key changes:
```typescript
import { NFTSelector } from "./NFTSelector";

// State changes:
const [selectedTokenId, setSelectedTokenId] = useState<bigint | null>(null);
// Remove: nftContract, tokenId states

// In form validation:
if (selectedTokenId === null) {
  toast.error("Please select an NFT");
  return false;
}

// In handleSubmit:
const result = await createAuction(
  nftContractAddress as `0x${string}`,  // From hook
  selectedTokenId,
  tokenContractAddress as `0x${string}`,
  startTimestamp,
  endTimestamp
);

// In JSX, replace NFT Contract Address and Token ID inputs with:
<NFTSelector
  selectedTokenId={selectedTokenId}
  onSelect={setSelectedTokenId}
  disabled={!isWalletConnected || isLoading}
/>
```

**Step 2: Verify TypeScript compiles**

Run: `cd packages/nextjs && pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/nextjs/components/auction/CreateAuctionForm.tsx
git commit -m "refactor(frontend): use NFTSelector in CreateAuctionForm"
```

---

## Task 8: Create AuctionDetailModal Component

**Files:**
- Create: `packages/nextjs/components/auction/AuctionDetailModal.tsx`

**Step 1: Create the modal component**

```typescript
"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { X, Clock, Users, Gavel, Trophy, AlertCircle, Loader2 } from "lucide-react";
import { useAuction } from "@/hooks/useAuction";
import {
  AuctionData,
  AuctionStatus,
  SettlementResult,
  getStatusColor,
  getStatusLabel,
} from "@/utils/auctionContracts";
import { PlaceBidModal } from "./PlaceBidModal";

interface AuctionDetailModalProps {
  auction: AuctionData;
  isOpen: boolean;
  onClose: () => void;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTimestamp(timestamp: bigint): string {
  return new Date(Number(timestamp) * 1000).toLocaleString();
}

function formatDuration(startTime: bigint, endTime: bigint): string {
  const durationSeconds = Number(endTime - startTime);
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? "s" : ""}`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export const AuctionDetailModal = ({ auction, isOpen, onClose }: AuctionDetailModalProps) => {
  const { address } = useAccount();
  const {
    hasBidOnAuction,
    hasClaimedRefund,
    getSettlementResult,
    requestSettlement,
    finalizeSettlement,
    claimRefund,
    isLoading,
  } = useAuction();

  const [userHasBid, setUserHasBid] = useState(false);
  const [userHasRefunded, setUserHasRefunded] = useState(false);
  const [settlementResult, setSettlementResult] = useState<SettlementResult | null>(null);
  const [showBidModal, setShowBidModal] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  const isSeller = address?.toLowerCase() === auction.seller.toLowerCase();
  const now = BigInt(Math.floor(Date.now() / 1000));
  const hasStarted = now >= auction.startTime;
  const hasEnded = now >= auction.endTime;
  const isActive = auction.status === AuctionStatus.Active && hasStarted && !hasEnded;

  // Fetch user status and settlement result
  useEffect(() => {
    const fetchStatus = async () => {
      if (!address || !isOpen) return;

      setIsCheckingStatus(true);

      const [hasBid, hasRefund] = await Promise.all([
        hasBidOnAuction(auction.id, address),
        hasClaimedRefund(auction.id, address),
      ]);

      setUserHasBid(hasBid);
      setUserHasRefunded(hasRefund);

      if (auction.status === AuctionStatus.Settled) {
        const result = await getSettlementResult(auction.id);
        setSettlementResult(result);
      }

      setIsCheckingStatus(false);
    };

    fetchStatus();
  }, [address, auction.id, auction.status, isOpen, hasBidOnAuction, hasClaimedRefund, getSettlementResult]);

  const handleRequestSettlement = async () => {
    const success = await requestSettlement(auction.id);
    if (success) {
      onClose();
    }
  };

  const handleFinalizeSettlement = async () => {
    // For now, this requires manual input - in production would use oracle/callback
    const winner = prompt("Enter winner address:");
    const amount = prompt("Enter winning amount:");

    if (!winner || !amount) return;

    const success = await finalizeSettlement(
      auction.id,
      winner as `0x${string}`,
      BigInt(amount)
    );
    if (success) {
      onClose();
    }
  };

  const handleClaimRefund = async () => {
    const success = await claimRefund(auction.id);
    if (success) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const isWinner = settlementResult?.winner.toLowerCase() === address?.toLowerCase();
  const canPlaceBid = isActive && !isSeller && !userHasBid;
  const canRequestSettlement = isSeller && auction.status === AuctionStatus.Active && hasEnded && auction.totalBids > BigInt(0);
  const canFinalizeSettlement = isSeller && auction.status === AuctionStatus.SettlementRequested;
  const canClaimRefund = (auction.status === AuctionStatus.Settled || auction.status === AuctionStatus.Cancelled)
    && userHasBid && !userHasRefunded && !isWinner;

  return (
    <>
      <div className="modal modal-open">
        <div className="modal-box max-w-2xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 border border-primary/30">
                <Gavel className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-display font-bold text-base-content uppercase tracking-wide">
                  Auction #{auction.id.toString()}
                </h3>
                <span className={`badge ${getStatusColor(auction.status)} badge-sm font-display uppercase tracking-wide mt-1`}>
                  {getStatusLabel(auction.status)}
                </span>
              </div>
            </div>
            <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-base-200 p-4 border border-base-300">
              <p className="text-xs font-pixel text-base-content/50 uppercase tracking-widest mb-1">NFT Token ID</p>
              <p className="text-lg font-mono">{auction.tokenId.toString()}</p>
            </div>
            <div className="bg-base-200 p-4 border border-base-300">
              <p className="text-xs font-pixel text-base-content/50 uppercase tracking-widest mb-1">Total Bids</p>
              <p className="text-lg font-mono flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                {auction.totalBids.toString()}
              </p>
            </div>
            <div className="bg-base-200 p-4 border border-base-300">
              <p className="text-xs font-pixel text-base-content/50 uppercase tracking-widest mb-1">Duration</p>
              <p className="text-lg font-mono flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                {formatDuration(auction.startTime, auction.endTime)}
              </p>
            </div>
            <div className="bg-base-200 p-4 border border-base-300">
              <p className="text-xs font-pixel text-base-content/50 uppercase tracking-widest mb-1">Seller</p>
              <p className="text-sm font-mono">{truncateAddress(auction.seller)}</p>
              {isSeller && <span className="badge badge-primary badge-xs mt-1">You</span>}
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-base-200 p-4 border border-base-300 mb-6">
            <p className="text-xs font-pixel text-base-content/50 uppercase tracking-widest mb-2">Timeline</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-base-content/50">Start</p>
                <p className="font-mono">{formatTimestamp(auction.startTime)}</p>
              </div>
              <div>
                <p className="text-base-content/50">End</p>
                <p className="font-mono">{formatTimestamp(auction.endTime)}</p>
              </div>
            </div>
          </div>

          {/* Settlement Result (if settled) */}
          {auction.status === AuctionStatus.Settled && settlementResult && (
            <div className="bg-success/10 border border-success/30 p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-5 h-5 text-success" />
                <p className="text-sm font-display font-bold text-success uppercase tracking-wide">
                  Auction Settled
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-base-content/50">Winner</p>
                  <p className="font-mono">
                    {truncateAddress(settlementResult.winner)}
                    {isWinner && <span className="badge badge-success badge-xs ml-2">You</span>}
                  </p>
                </div>
                <div>
                  <p className="text-base-content/50">Winning Bid</p>
                  <p className="font-mono">{(Number(settlementResult.amount) / 1_000_000).toLocaleString()} AUCT</p>
                </div>
              </div>
            </div>
          )}

          {/* User Status */}
          {!isCheckingStatus && address && (
            <div className="mb-6">
              {userHasBid && (
                <div className="alert alert-info">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">You have placed a bid on this auction</span>
                </div>
              )}
              {userHasRefunded && (
                <div className="alert alert-success">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">You have claimed your refund</span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="modal-action">
            {isCheckingStatus ? (
              <div className="flex items-center gap-2 text-base-content/50">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading...</span>
              </div>
            ) : (
              <>
                {canPlaceBid && (
                  <button
                    onClick={() => setShowBidModal(true)}
                    className="btn btn-primary font-display uppercase tracking-wide"
                  >
                    Place Bid
                  </button>
                )}
                {canRequestSettlement && (
                  <button
                    onClick={handleRequestSettlement}
                    disabled={isLoading}
                    className="btn btn-primary font-display uppercase tracking-wide"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Request Settlement
                  </button>
                )}
                {canFinalizeSettlement && (
                  <button
                    onClick={handleFinalizeSettlement}
                    disabled={isLoading}
                    className="btn btn-primary font-display uppercase tracking-wide"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Finalize Settlement
                  </button>
                )}
                {canClaimRefund && (
                  <button
                    onClick={handleClaimRefund}
                    disabled={isLoading}
                    className="btn btn-secondary font-display uppercase tracking-wide"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Claim Refund
                  </button>
                )}
              </>
            )}
            <button onClick={onClose} className="btn btn-ghost font-display uppercase tracking-wide">
              Close
            </button>
          </div>
        </div>
        <div className="modal-backdrop bg-black/50" onClick={onClose} />
      </div>

      {/* Place Bid Modal */}
      {showBidModal && (
        <PlaceBidModal
          auctionId={auction.id}
          isOpen={showBidModal}
          onClose={() => {
            setShowBidModal(false);
            onClose();
          }}
        />
      )}
    </>
  );
};
```

**Step 2: Export from barrel**

Add to `packages/nextjs/components/auction/index.ts`:
```typescript
export { AuctionDetailModal } from "./AuctionDetailModal";
```

**Step 3: Verify TypeScript compiles**

Run: `cd packages/nextjs && pnpm tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/nextjs/components/auction/AuctionDetailModal.tsx packages/nextjs/components/auction/index.ts
git commit -m "feat(frontend): add AuctionDetailModal with actions"
```

---

## Task 9: Update AuctionList to Open Modal on Click

**Files:**
- Modify: `packages/nextjs/components/auction/AuctionList.tsx`

**Step 1: Add modal state and rendering**

Update the component to:
- Import AuctionDetailModal
- Add state for selected auction
- Pass onClick handler to AuctionCard
- Render modal when auction is selected

Key changes:
```typescript
import { AuctionDetailModal } from "./AuctionDetailModal";

// Add state:
const [selectedAuction, setSelectedAuction] = useState<AuctionData | null>(null);

// In the map rendering AuctionCard:
<AuctionCard
  key={auction.id.toString()}
  auction={auction}
  onClick={() => setSelectedAuction(auction)}
/>

// Add modal at the end:
{selectedAuction && (
  <AuctionDetailModal
    auction={selectedAuction}
    isOpen={!!selectedAuction}
    onClose={() => setSelectedAuction(null)}
  />
)}
```

**Step 2: Verify TypeScript compiles**

Run: `cd packages/nextjs && pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/nextjs/components/auction/AuctionList.tsx
git commit -m "feat(frontend): open AuctionDetailModal on card click"
```

---

## Task 10: Add Mint Tab to Navbar

**Files:**
- Modify: `packages/nextjs/components/Navbar.tsx`

**Step 1: Add Mint navigation option**

Update the Navbar to include a "Mint" tab alongside "Auctions". Update the navigation store if needed, or add inline routing.

Key changes:
- Add "Mint" to the tabs/navigation
- Handle tab switching to show MintPage

**Step 2: Verify TypeScript compiles**

Run: `cd packages/nextjs && pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/nextjs/components/Navbar.tsx
git commit -m "feat(frontend): add Mint tab to navbar"
```

---

## Task 11: Update Main Page to Handle Mint Tab

**Files:**
- Modify: `packages/nextjs/app/page.tsx`

**Step 1: Conditionally render MintPage or AuctionsPage based on active tab**

Update the main page to:
- Import MintPage
- Check active tab from navigation store
- Render MintPage when "mint" tab is active

**Step 2: Verify TypeScript compiles**

Run: `cd packages/nextjs && pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/nextjs/app/page.tsx
git commit -m "feat(frontend): render MintPage based on active tab"
```

---

## Task 12: Final Integration Test

**Step 1: Run TypeScript check**

Run: `cd packages/nextjs && pnpm tsc --noEmit`
Expected: No errors

**Step 2: Run development server**

Run: `cd packages/nextjs && pnpm dev`
Expected: App starts without errors

**Step 3: Manual testing checklist**
- [ ] Mint tab appears in navbar
- [ ] Mint tab shows balances when wallet connected
- [ ] Mint NFT button works
- [ ] Mint Tokens button works
- [ ] Balances update after minting
- [ ] Create Auction form shows NFT selector
- [ ] NFT selector shows owned NFTs
- [ ] Clicking auction card opens modal
- [ ] Modal shows all auction info
- [ ] Modal shows correct action buttons based on role/status
- [ ] Place Bid works from modal
- [ ] Request Settlement works for seller
- [ ] Claim Refund works for losing bidders

**Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "feat(frontend): complete mint tab and auction modal integration"
```
