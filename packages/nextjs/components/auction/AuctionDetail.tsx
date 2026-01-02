"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import {
  ArrowLeft,
  Clock,
  Users,
  Gavel,
  CheckCircle,
  XCircle,
  Loader2,
  Trophy,
  Banknote,
  RefreshCw,
} from "lucide-react";
import { PlaceBidModal } from "./PlaceBidModal";
import { useAuction } from "@/hooks/useAuction";
import {
  AuctionData,
  AuctionStatus,
  SettlementResult,
  getStatusColor,
  getStatusLabel,
} from "@/utils/auctionContracts";

interface AuctionDetailProps {
  auctionId: bigint;
  onBack: () => void;
}

/**
 * Format an address for display (truncated)
 */
function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format token amount (6 decimals) to display string
 */
function formatTokenAmount(amount: bigint): string {
  const divisor = BigInt(1_000_000);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;
  const fractionalStr = fractionalPart.toString().padStart(6, "0");
  return `${integerPart}.${fractionalStr}`;
}

/**
 * Detailed view of a single auction with actions
 */
export const AuctionDetail = ({ auctionId, onBack }: AuctionDetailProps) => {
  const { address } = useAccount();
  const {
    getAuction,
    hasBidOnAuction,
    hasClaimedRefund,
    getSettlementResult,
    requestSettlement,
    claimRefund,
    cancelAuction,
    isLoading,
  } = useAuction();

  // State
  const [auction, setAuction] = useState<AuctionData | null>(null);
  const [userHasBid, setUserHasBid] = useState(false);
  const [userHasRefunded, setUserHasRefunded] = useState(false);
  const [settlementResult, setSettlementResult] = useState<SettlementResult | null>(null);
  const [showBidModal, setShowBidModal] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  /**
   * Load all auction data
   */
  const loadAuctionData = useCallback(async () => {
    setIsLoadingData(true);

    try {
      // Load auction details
      const auctionData = await getAuction(auctionId);
      setAuction(auctionData);

      if (!auctionData) {
        return;
      }

      // Load user-specific data if connected
      if (address) {
        const [hasBid, hasRefund] = await Promise.all([
          hasBidOnAuction(auctionId, address),
          hasClaimedRefund(auctionId, address),
        ]);
        setUserHasBid(hasBid);
        setUserHasRefunded(hasRefund);
      }

      // Load settlement result if settled
      if (auctionData.status === AuctionStatus.Settled) {
        const result = await getSettlementResult(auctionId);
        setSettlementResult(result);
      }
    } catch (error) {
      console.error("Failed to load auction data:", error);
    } finally {
      setIsLoadingData(false);
    }
  }, [auctionId, address, getAuction, hasBidOnAuction, hasClaimedRefund, getSettlementResult]);

  // Load data on mount and when dependencies change
  useEffect(() => {
    loadAuctionData();
  }, [loadAuctionData]);

  /**
   * Handle refresh button click
   */
  const handleRefresh = () => {
    loadAuctionData();
  };

  /**
   * Handle request settlement action
   */
  const handleRequestSettlement = async () => {
    const success = await requestSettlement(auctionId);
    if (success) {
      loadAuctionData();
    }
  };

  /**
   * Handle claim refund action
   */
  const handleClaimRefund = async () => {
    const success = await claimRefund(auctionId);
    if (success) {
      loadAuctionData();
    }
  };

  /**
   * Handle cancel auction action
   */
  const handleCancelAuction = async () => {
    const success = await cancelAuction(auctionId);
    if (success) {
      loadAuctionData();
    }
  };

  /**
   * Handle bid modal close
   */
  const handleBidModalClose = () => {
    setShowBidModal(false);
    loadAuctionData();
  };

  // Derived state
  const isSeller = auction && address && auction.seller.toLowerCase() === address.toLowerCase();
  const isWinner =
    settlementResult && address && settlementResult.winner.toLowerCase() === address.toLowerCase();
  const now = BigInt(Math.floor(Date.now() / 1000));
  const isAuctionEnded = auction && now >= auction.endTime;
  const isAuctionActive = auction && auction.status === AuctionStatus.Active;

  // Determine which action buttons to show
  const showPlaceBid =
    auction &&
    isAuctionActive &&
    !isAuctionEnded &&
    !userHasBid &&
    !isSeller;

  const showRequestSettlement =
    auction &&
    isAuctionEnded &&
    isAuctionActive &&
    auction.totalBids > BigInt(0);

  const showClaimRefund =
    auction &&
    auction.status === AuctionStatus.Settled &&
    userHasBid &&
    !userHasRefunded &&
    !isWinner;

  const showCancelAuction =
    auction &&
    isSeller &&
    isAuctionActive &&
    auction.totalBids === BigInt(0);

  // Loading state
  if (isLoadingData && !auction) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
        <p className="text-base-content/70 font-display uppercase tracking-wide">
          Loading auction details...
        </p>
      </div>
    );
  }

  // Auction not found
  if (!auction) {
    return (
      <div className="flex flex-col items-center justify-center py-16 border border-base-300 bg-base-200">
        <XCircle className="w-12 h-12 text-error mb-4" />
        <p className="text-base-content/70 font-display uppercase tracking-wide mb-4">
          Auction not found
        </p>
        <button onClick={onBack} className="btn btn-ghost btn-sm font-display uppercase tracking-wide">
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="btn btn-ghost btn-sm font-display uppercase tracking-wide"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 border border-primary/30">
              <Gavel className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-display font-bold text-base-content uppercase tracking-wide">
              Auction #{auctionId.toString()}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isLoadingData}
            className="btn btn-ghost btn-sm gap-2 font-display uppercase tracking-wide"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingData ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <span
            className={`badge ${getStatusColor(auction.status)} badge-md font-display uppercase tracking-wide`}
          >
            {getStatusLabel(auction.status)}
          </span>
        </div>
      </div>

      {/* Main content - 3 column grid on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {/* NFT Details Card */}
          <div className="bg-base-200 border border-base-300 p-5">
            <h3 className="text-sm font-display uppercase tracking-widest text-base-content/50 mb-4">
              NFT Details
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-pixel text-base-content/50 uppercase tracking-widest">
                  NFT Contract:
                </span>
                <span className="text-sm font-mono text-base-content">
                  {truncateAddress(auction.nftContract)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-pixel text-base-content/50 uppercase tracking-widest">
                  Token ID:
                </span>
                <span className="text-sm font-mono text-base-content">
                  {auction.tokenId.toString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-pixel text-base-content/50 uppercase tracking-widest">
                  Seller:
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-base-content">
                    {truncateAddress(auction.seller)}
                  </span>
                  {isSeller && (
                    <span className="badge badge-primary badge-xs font-display uppercase">You</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Timing Card */}
          <div className="bg-base-200 border border-base-300 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-display uppercase tracking-widest text-base-content/50">
                Timing
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-pixel text-base-content/50 uppercase tracking-widest">
                  Start Time:
                </span>
                <span className="text-sm font-mono text-base-content">
                  {new Date(Number(auction.startTime) * 1000).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-pixel text-base-content/50 uppercase tracking-widest">
                  End Time:
                </span>
                <span className="text-sm font-mono text-base-content">
                  {new Date(Number(auction.endTime) * 1000).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Settlement Result Card (only if settled) */}
          {auction.status === AuctionStatus.Settled && settlementResult && (
            <div className="bg-base-200 border border-primary/30 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-display uppercase tracking-widest text-primary">
                  Settlement Result
                </h3>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-pixel text-base-content/50 uppercase tracking-widest">
                    Winner:
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-base-content">
                      {truncateAddress(settlementResult.winner)}
                    </span>
                    {isWinner && (
                      <span className="badge badge-success badge-xs font-display uppercase">You</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-pixel text-base-content/50 uppercase tracking-widest">
                    Winning Bid:
                  </span>
                  <div className="flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-success" />
                    <span className="text-sm font-mono text-success font-bold">
                      {formatTokenAmount(settlementResult.amount)} tokens
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right column (1/3 width) */}
        <div className="space-y-6">
          {/* Bid Stats Card */}
          <div className="bg-base-200 border border-base-300 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-display uppercase tracking-widest text-base-content/50">
                Bid Stats
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-pixel text-base-content/50 uppercase tracking-widest">
                  Total Bids:
                </span>
                <span className="text-lg font-mono text-base-content font-bold">
                  {auction.totalBids.toString()}
                </span>
              </div>
              {userHasBid && (
                <div className="flex items-center gap-2 text-success pt-2 border-t border-base-300">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm font-display uppercase tracking-wide">
                    You have placed a bid
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons Card */}
          {(showPlaceBid || showRequestSettlement || showClaimRefund || showCancelAuction) && (
            <div className="bg-base-200 border border-base-300 p-5">
              <h3 className="text-sm font-display uppercase tracking-widest text-base-content/50 mb-4">
                Actions
              </h3>
              <div className="space-y-3">
                {/* Place Bid Button */}
                {showPlaceBid && (
                  <button
                    onClick={() => setShowBidModal(true)}
                    disabled={isLoading}
                    className="btn btn-primary w-full font-display uppercase tracking-wide"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Gavel className="w-4 h-4" />
                    )}
                    Place Bid
                  </button>
                )}

                {/* Request Settlement Button */}
                {showRequestSettlement && (
                  <button
                    onClick={handleRequestSettlement}
                    disabled={isLoading}
                    className="btn btn-success w-full font-display uppercase tracking-wide"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    Request Settlement
                  </button>
                )}

                {/* Claim Refund Button */}
                {showClaimRefund && (
                  <button
                    onClick={handleClaimRefund}
                    disabled={isLoading}
                    className="btn btn-info w-full font-display uppercase tracking-wide"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Banknote className="w-4 h-4" />
                    )}
                    Claim Refund
                  </button>
                )}

                {/* Cancel Auction Button */}
                {showCancelAuction && (
                  <button
                    onClick={handleCancelAuction}
                    disabled={isLoading}
                    className="btn btn-error w-full font-display uppercase tracking-wide"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    Cancel Auction
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Place Bid Modal */}
      {auction && (
        <PlaceBidModal
          auction={auction}
          isOpen={showBidModal}
          onClose={handleBidModalClose}
        />
      )}
    </div>
  );
};
