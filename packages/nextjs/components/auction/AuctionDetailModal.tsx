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
          auction={auction}
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
