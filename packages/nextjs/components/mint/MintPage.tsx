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
          <li>* <strong>Auction NFTs</strong> can be listed for auction</li>
          <li>* <strong>AUCT tokens</strong> are used to place encrypted bids</li>
          <li>* These are test assets on Arbitrum Sepolia</li>
        </ul>
      </div>
    </div>
  );
};
