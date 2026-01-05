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
