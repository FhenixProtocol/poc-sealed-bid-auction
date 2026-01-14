"use client";

import { useState, useCallback } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { cofhejs, FheTypes } from "cofhejs/web";
import toast from "react-hot-toast";
import { auctionNftAbi, auctionTokenAbi } from "@/utils/auctionContracts";
import { toastTxSuccess } from "@/utils/explorerLink";

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
   * Get user's token balance (plaintext/public)
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
   * Get user's encrypted/confidential token balance
   * Returns the ctHash that needs to be unsealed with a permit
   */
  const getEncryptedTokenBalanceHash = useCallback(async (): Promise<bigint> => {
    if (!publicClient || !address) return BigInt(0);

    try {
      const ctHash = await publicClient.readContract({
        address: TOKEN_CONTRACT_ADDRESS,
        abi: auctionTokenAbi,
        functionName: "confidentialBalanceOf",
        args: [address],
      });
      return ctHash as bigint;
    } catch (error) {
      console.error("Failed to get encrypted token balance hash:", error);
      return BigInt(0);
    }
  }, [publicClient, address]);

  /**
   * Unseal the encrypted token balance using cofhejs
   * Requires a valid permit to be created first
   */
  const unsealTokenBalance = useCallback(async (ctHash: bigint): Promise<bigint | null> => {
    if (!ctHash || ctHash === BigInt(0)) return BigInt(0);

    try {
      const result = await cofhejs.unseal(ctHash, FheTypes.Uint64);

      if (result?.success && result?.data !== undefined) {
        return BigInt(result.data.toString());
      }
      return null;
    } catch (error) {
      console.error("Failed to unseal token balance:", error);
      return null;
    }
  }, []);

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

      toastTxSuccess("NFT minted successfully!", hash, "mint-nft");
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

      toastTxSuccess("1000 tokens minted successfully!", hash, "mint-tokens");
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
    getEncryptedTokenBalanceHash,
    unsealTokenBalance,
    mintNft,
    mintTokens,
  };
}
