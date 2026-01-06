"use client";

import { useState, useCallback } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { parseEventLogs } from "viem";
import { cofhejs, Encryptable } from "cofhejs/web";
import toast from "react-hot-toast";
import { useAuctionStore } from "@/services/store/auctionStore";
import {
  AuctionData,
  AuctionStatus,
  SettlementResult,
  sealedBidAuctionAbi,
  auctionNftAbi,
  auctionTokenAbi,
} from "@/utils/auctionContracts";

// Contract addresses from environment variables
const AUCTION_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_AUCTION_CONTRACT_ADDRESS as `0x${string}`;
const NFT_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS as `0x${string}`;
const TOKEN_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ADDRESS as `0x${string}`;

export function useAuction() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const { setCachedAuction, triggerRefresh } = useAuctionStore();

  const [isLoading, setIsLoading] = useState(false);

  // ============ Read Functions ============

  /**
   * Get auction details by ID
   */
  const getAuction = useCallback(
    async (auctionId: bigint): Promise<AuctionData | null> => {
      if (!publicClient) {
        console.error("Public client not available");
        return null;
      }

      try {
        const result = await publicClient.readContract({
          address: AUCTION_CONTRACT_ADDRESS,
          abi: sealedBidAuctionAbi,
          functionName: "getAuction",
          args: [auctionId],
        });

        const [seller, nftContract, tokenId, fherc20Token, startTime, endTime, status, totalBids] = result;

        const auctionData: AuctionData = {
          id: auctionId,
          seller: seller as `0x${string}`,
          nftContract: nftContract as `0x${string}`,
          tokenId: tokenId as bigint,
          fherc20Token: fherc20Token as `0x${string}`,
          startTime: startTime as bigint,
          endTime: endTime as bigint,
          status: status as AuctionStatus,
          totalBids: totalBids as bigint,
        };

        // Cache the auction data
        setCachedAuction(auctionId, auctionData);

        return auctionData;
      } catch (error) {
        console.error("Failed to get auction:", error);
        return null;
      }
    },
    [publicClient, setCachedAuction]
  );

  /**
   * Get the total number of auctions (nextAuctionId)
   */
  const getTotalAuctions = useCallback(async (): Promise<bigint> => {
    if (!publicClient) {
      console.error("Public client not available");
      return BigInt(0);
    }

    try {
      const result = await publicClient.readContract({
        address: AUCTION_CONTRACT_ADDRESS,
        abi: sealedBidAuctionAbi,
        functionName: "nextAuctionId",
      });

      return result as bigint;
    } catch (error) {
      console.error("Failed to get total auctions:", error);
      return BigInt(0);
    }
  }, [publicClient]);

  /**
   * Get all auctions within a range
   */
  const getAllAuctions = useCallback(
    async (startId: bigint, limit: number): Promise<AuctionData[]> => {
      if (!publicClient) {
        console.error("Public client not available");
        return [];
      }

      try {
        const totalAuctions = await getTotalAuctions();
        const auctions: AuctionData[] = [];

        const endId = startId + BigInt(limit) > totalAuctions ? totalAuctions : startId + BigInt(limit);

        for (let i = startId; i < endId; i++) {
          const auction = await getAuction(i);
          if (auction) {
            auctions.push(auction);
          }
        }

        return auctions;
      } catch (error) {
        console.error("Failed to get all auctions:", error);
        return [];
      }
    },
    [publicClient, getTotalAuctions, getAuction]
  );

  /**
   * Check if an address has bid on an auction
   */
  const hasBidOnAuction = useCallback(
    async (auctionId: bigint, bidder: string): Promise<boolean> => {
      if (!publicClient) {
        console.error("Public client not available");
        return false;
      }

      try {
        const result = await publicClient.readContract({
          address: AUCTION_CONTRACT_ADDRESS,
          abi: sealedBidAuctionAbi,
          functionName: "hasBidOnAuction",
          args: [auctionId, bidder as `0x${string}`],
        });

        return result as boolean;
      } catch (error) {
        console.error("Failed to check if bid exists:", error);
        return false;
      }
    },
    [publicClient]
  );

  /**
   * Check if an address has claimed their refund
   */
  const hasClaimedRefund = useCallback(
    async (auctionId: bigint, bidder: string): Promise<boolean> => {
      if (!publicClient) {
        console.error("Public client not available");
        return false;
      }

      try {
        const result = await publicClient.readContract({
          address: AUCTION_CONTRACT_ADDRESS,
          abi: sealedBidAuctionAbi,
          functionName: "hasClaimedRefund",
          args: [auctionId, bidder as `0x${string}`],
        });

        return result as boolean;
      } catch (error) {
        console.error("Failed to check refund status:", error);
        return false;
      }
    },
    [publicClient]
  );

  /**
   * Get settlement result for a settled auction
   */
  const getSettlementResult = useCallback(
    async (auctionId: bigint): Promise<SettlementResult | null> => {
      if (!publicClient) {
        console.error("Public client not available");
        return null;
      }

      try {
        const result = await publicClient.readContract({
          address: AUCTION_CONTRACT_ADDRESS,
          abi: sealedBidAuctionAbi,
          functionName: "getSettlementResult",
          args: [auctionId],
        });

        const [winner, amount] = result as [string, bigint];

        return {
          winner: winner as `0x${string}`,
          amount: amount,
        };
      } catch (error) {
        console.error("Failed to get settlement result:", error);
        return null;
      }
    },
    [publicClient]
  );

  // ============ Write Functions ============

  /**
   * Check if NFT is approved for the auction contract
   */
  const isNftApproved = useCallback(
    async (nftContract: `0x${string}`, tokenId: bigint): Promise<boolean> => {
      if (!publicClient) {
        console.error("Public client not available");
        return false;
      }

      try {
        const approved = await publicClient.readContract({
          address: nftContract,
          abi: auctionNftAbi,
          functionName: "getApproved",
          args: [tokenId],
        });

        return (approved as string).toLowerCase() === AUCTION_CONTRACT_ADDRESS.toLowerCase();
      } catch (error) {
        console.error("Failed to check NFT approval:", error);
        return false;
      }
    },
    [publicClient]
  );

  /**
   * Approve NFT for the auction contract
   */
  const approveNft = useCallback(
    async (nftContract: `0x${string}`, tokenId: bigint): Promise<boolean> => {
      if (!walletClient || !address || !publicClient) {
        toast.error("Wallet not connected");
        return false;
      }

      setIsLoading(true);

      try {
        toast.loading("Approving NFT transfer...", { id: "approve-nft" });

        const approveHash = await walletClient.writeContract({
          address: nftContract,
          abi: auctionNftAbi,
          functionName: "approve",
          args: [AUCTION_CONTRACT_ADDRESS, tokenId],
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });

        if (receipt.status !== "success") {
          toast.error("NFT approval failed", { id: "approve-nft" });
          return false;
        }

        toast.success("NFT approved!", { id: "approve-nft" });
        return true;
      } catch (error) {
        console.error("Failed to approve NFT:", error);
        toast.error("Failed to approve NFT", { id: "approve-nft" });
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [walletClient, address, publicClient]
  );

  /**
   * Create a new auction (NFT must be approved first)
   */
  const createAuction = useCallback(
    async (
      nftContract: `0x${string}`,
      tokenId: bigint,
      fherc20Token: `0x${string}`,
      startTime: bigint,
      endTime: bigint
    ): Promise<bigint | null> => {
      if (!walletClient || !address || !publicClient) {
        toast.error("Wallet not connected");
        return null;
      }

      setIsLoading(true);

      try {
        toast.loading("Creating auction...", { id: "create-auction" });

        const createHash = await walletClient.writeContract({
          address: AUCTION_CONTRACT_ADDRESS,
          abi: sealedBidAuctionAbi,
          functionName: "createAuction",
          args: [nftContract, tokenId, fherc20Token, startTime, endTime],
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });

        if (receipt.status !== "success") {
          toast.error("Auction creation failed on chain", { id: "create-auction" });
          return null;
        }

        // Parse the AuctionCreated event using viem's type-safe event parsing
        const events = parseEventLogs({
          abi: sealedBidAuctionAbi,
          logs: receipt.logs,
        });
        const auctionCreatedEvent = events.find((e) => e.eventName === "AuctionCreated");
        const auctionId = auctionCreatedEvent?.args?.auctionId ?? null;

        toast.success("Auction created successfully!", { id: "create-auction" });
        triggerRefresh();

        return auctionId;
      } catch (error) {
        console.error("Failed to create auction:", error);
        toast.error("Failed to create auction", { id: "create-auction" });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [walletClient, address, publicClient, triggerRefresh]
  );

  /**
   * Place a bid on an auction
   * Checks if already bid, sets operator approval if needed, encrypts the bid
   */
  const placeBid = useCallback(
    async (auctionId: bigint, amount: bigint): Promise<boolean> => {
      if (!walletClient || !address || !publicClient) {
        toast.error("Wallet not connected");
        return false;
      }

      setIsLoading(true);

      try {
        // Check if user has already bid on this auction
        const alreadyBid = await hasBidOnAuction(auctionId, address);
        if (alreadyBid) {
          toast.error("You have already placed a bid on this auction");
          return false;
        }

        // Get auction details to get the token address
        const auction = await getAuction(auctionId);
        if (!auction) {
          toast.error("Auction not found");
          return false;
        }

        // Check if operator approval is set for the auction contract
        toast.loading("Checking operator approval...", { id: "check-operator" });

        const isOperatorApproved = await publicClient.readContract({
          address: auction.fherc20Token,
          abi: auctionTokenAbi,
          functionName: "isOperator",
          args: [address, AUCTION_CONTRACT_ADDRESS],
        });

        toast.dismiss("check-operator");

        if (!isOperatorApproved) {
          // Set operator approval (valid for 1 year)
          toast.loading("Setting operator approval...", { id: "set-operator" });

          // Calculate expiration time (1 year from now) - uint48 fits in number
          const until = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;

          const setOperatorHash = await walletClient.writeContract({
            address: auction.fherc20Token,
            abi: auctionTokenAbi,
            functionName: "setOperator",
            args: [AUCTION_CONTRACT_ADDRESS, until],
          });

          await publicClient.waitForTransactionReceipt({ hash: setOperatorHash });
          toast.success("Operator approval set!", { id: "set-operator" });
        }

        // Encrypt the bid amount using cofhejs
        toast.loading("Encrypting bid...", { id: "encrypt-bid" });

        const encryptResult = await cofhejs.encrypt([Encryptable.uint64(amount)] as const);

        const encrypted = encryptResult.data?.[0];
        if (!encrypted) {
          toast.error("Failed to encrypt bid amount", { id: "encrypt-bid" });
          return false;
        }

        // Format the encrypted value to match the expected ABI structure
        const encryptedAmount = {
          ctHash: encrypted.ctHash,
          securityZone: encrypted.securityZone,
          utype: encrypted.utype,
          signature: encrypted.signature as `0x${string}`,
        };

        toast.success("Bid encrypted!", { id: "encrypt-bid" });

        // Place the bid
        toast.loading("Placing bid...", { id: "place-bid" });

        const bidHash = await walletClient.writeContract({
          address: AUCTION_CONTRACT_ADDRESS,
          abi: sealedBidAuctionAbi,
          functionName: "bid",
          args: [auctionId, encryptedAmount],
        });

        await publicClient.waitForTransactionReceipt({ hash: bidHash });

        toast.success("Bid placed successfully!", { id: "place-bid" });
        triggerRefresh();

        return true;
      } catch (error) {
        console.error("Failed to place bid:", error);
        toast.error("Failed to place bid", { id: "place-bid" });
        toast.dismiss("check-operator");
        toast.dismiss("set-operator");
        toast.dismiss("encrypt-bid");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [walletClient, address, publicClient, hasBidOnAuction, getAuction, triggerRefresh]
  );

  /**
   * Request settlement of an auction (initiates decryption)
   */
  const requestSettlement = useCallback(
    async (auctionId: bigint): Promise<boolean> => {
      if (!walletClient || !address || !publicClient) {
        toast.error("Wallet not connected");
        return false;
      }

      setIsLoading(true);

      try {
        toast.loading("Requesting settlement...", { id: "request-settlement" });

        const hash = await walletClient.writeContract({
          address: AUCTION_CONTRACT_ADDRESS,
          abi: sealedBidAuctionAbi,
          functionName: "requestSettlement",
          args: [auctionId],
        });

        await publicClient.waitForTransactionReceipt({ hash });

        toast.success("Settlement requested successfully!", { id: "request-settlement" });
        triggerRefresh();

        return true;
      } catch (error) {
        console.error("Failed to request settlement:", error);
        toast.error("Failed to request settlement", { id: "request-settlement" });
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [walletClient, address, publicClient, triggerRefresh]
  );

  /**
   * Finalize settlement after decryption is complete
   */
  const finalizeSettlement = useCallback(
    async (auctionId: bigint, winner: `0x${string}`, amount: bigint): Promise<boolean> => {
      if (!walletClient || !address || !publicClient) {
        toast.error("Wallet not connected");
        return false;
      }

      setIsLoading(true);

      try {
        toast.loading("Finalizing settlement...", { id: "finalize-settlement" });

        const hash = await walletClient.writeContract({
          address: AUCTION_CONTRACT_ADDRESS,
          abi: sealedBidAuctionAbi,
          functionName: "finalizeSettlement",
          args: [auctionId, winner, amount],
        });

        await publicClient.waitForTransactionReceipt({ hash });

        toast.success("Settlement finalized successfully!", { id: "finalize-settlement" });
        triggerRefresh();

        return true;
      } catch (error) {
        console.error("Failed to finalize settlement:", error);
        toast.error("Failed to finalize settlement", { id: "finalize-settlement" });
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [walletClient, address, publicClient, triggerRefresh]
  );

  /**
   * Claim refund for a losing bid
   */
  const claimRefund = useCallback(
    async (auctionId: bigint): Promise<boolean> => {
      if (!walletClient || !address || !publicClient) {
        toast.error("Wallet not connected");
        return false;
      }

      setIsLoading(true);

      try {
        toast.loading("Claiming refund...", { id: "claim-refund" });

        const hash = await walletClient.writeContract({
          address: AUCTION_CONTRACT_ADDRESS,
          abi: sealedBidAuctionAbi,
          functionName: "claimRefund",
          args: [auctionId],
        });

        await publicClient.waitForTransactionReceipt({ hash });

        toast.success("Refund claimed successfully!", { id: "claim-refund" });
        triggerRefresh();

        return true;
      } catch (error) {
        console.error("Failed to claim refund:", error);
        toast.error("Failed to claim refund", { id: "claim-refund" });
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [walletClient, address, publicClient, triggerRefresh]
  );

  /**
   * Cancel an auction (only seller, only if no bids)
   */
  const cancelAuction = useCallback(
    async (auctionId: bigint): Promise<boolean> => {
      if (!walletClient || !address || !publicClient) {
        toast.error("Wallet not connected");
        return false;
      }

      setIsLoading(true);

      try {
        toast.loading("Cancelling auction...", { id: "cancel-auction" });

        const hash = await walletClient.writeContract({
          address: AUCTION_CONTRACT_ADDRESS,
          abi: sealedBidAuctionAbi,
          functionName: "cancelAuction",
          args: [auctionId],
        });

        await publicClient.waitForTransactionReceipt({ hash });

        toast.success("Auction cancelled successfully!", { id: "cancel-auction" });
        triggerRefresh();

        return true;
      } catch (error) {
        console.error("Failed to cancel auction:", error);
        toast.error("Failed to cancel auction", { id: "cancel-auction" });
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [walletClient, address, publicClient, triggerRefresh]
  );

  return {
    // State
    isLoading,

    // Contract addresses
    auctionContractAddress: AUCTION_CONTRACT_ADDRESS,
    nftContractAddress: NFT_CONTRACT_ADDRESS,
    tokenContractAddress: TOKEN_CONTRACT_ADDRESS,

    // Read functions
    getAuction,
    getTotalAuctions,
    getAllAuctions,
    hasBidOnAuction,
    hasClaimedRefund,
    getSettlementResult,
    isNftApproved,

    // Write functions
    approveNft,
    createAuction,
    placeBid,
    requestSettlement,
    finalizeSettlement,
    claimRefund,
    cancelAuction,
  };
}
