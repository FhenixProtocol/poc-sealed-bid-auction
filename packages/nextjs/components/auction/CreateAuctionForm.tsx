"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { Plus, Calendar, Clock, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuction } from "@/hooks/useAuction";

/**
 * Form component for creating new auctions
 * Handles NFT contract, token ID, payment token, and auction timing
 */
export const CreateAuctionForm = () => {
  const { address } = useAccount();
  const { createAuction, nftContractAddress, tokenContractAddress, isLoading } = useAuction();

  // Form state
  const [nftContract, setNftContract] = useState<string>(nftContractAddress || "");
  const [tokenId, setTokenId] = useState<string>("");
  const [paymentToken, setPaymentToken] = useState<string>(tokenContractAddress || "");
  const [startDate, setStartDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");

  const isWalletConnected = !!address;

  /**
   * Reset all form fields to initial values
   */
  const resetForm = useCallback(() => {
    setNftContract(nftContractAddress || "");
    setTokenId("");
    setPaymentToken(tokenContractAddress || "");
    setStartDate("");
    setStartTime("");
    setEndDate("");
    setEndTime("");
  }, [nftContractAddress, tokenContractAddress]);

  /**
   * Validate form inputs before submission
   */
  const validateForm = (): boolean => {
    // Check all fields are filled
    if (!nftContract.trim()) {
      toast.error("NFT contract address is required");
      return false;
    }

    if (!tokenId.trim()) {
      toast.error("Token ID is required");
      return false;
    }

    if (!paymentToken.trim()) {
      toast.error("Payment token address is required");
      return false;
    }

    if (!startDate || !startTime) {
      toast.error("Start date and time are required");
      return false;
    }

    if (!endDate || !endTime) {
      toast.error("End date and time are required");
      return false;
    }

    // Parse dates
    const startDateTime = new Date(`${startDate}T${startTime}`);
    const endDateTime = new Date(`${endDate}T${endTime}`);
    const now = new Date();

    // Validate start time is in the future
    if (startDateTime <= now) {
      toast.error("Start time must be in the future");
      return false;
    }

    // Validate end time is after start time
    if (endDateTime <= startDateTime) {
      toast.error("End time must be after start time");
      return false;
    }

    // Validate addresses (basic hex check)
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(nftContract)) {
      toast.error("Invalid NFT contract address format");
      return false;
    }

    if (!addressRegex.test(paymentToken)) {
      toast.error("Invalid payment token address format");
      return false;
    }

    // Validate token ID is a positive number
    const tokenIdNum = parseInt(tokenId, 10);
    if (isNaN(tokenIdNum) || tokenIdNum < 0) {
      toast.error("Token ID must be a valid non-negative number");
      return false;
    }

    return true;
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isWalletConnected) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!validateForm()) {
      return;
    }

    // Convert dates to Unix timestamps
    const startTimestamp = BigInt(Math.floor(new Date(`${startDate}T${startTime}`).getTime() / 1000));
    const endTimestamp = BigInt(Math.floor(new Date(`${endDate}T${endTime}`).getTime() / 1000));

    const result = await createAuction(
      nftContract as `0x${string}`,
      BigInt(tokenId),
      paymentToken as `0x${string}`,
      startTimestamp,
      endTimestamp
    );

    if (result !== null) {
      resetForm();
    }
  };

  return (
    <div className="bg-base-200 border border-base-300 p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary/10 border border-primary/30">
          <Plus className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-lg font-display font-bold text-base-content uppercase tracking-wide">
          Create New Auction
        </h2>
      </div>

      {/* Wallet not connected warning */}
      {!isWalletConnected && (
        <div className="alert alert-warning mb-6">
          <span className="font-display uppercase tracking-wide text-sm">
            Please connect your wallet to create an auction
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* NFT Contract Address */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-pixel uppercase tracking-widest text-xs">
              NFT Contract Address
            </span>
          </label>
          <input
            type="text"
            placeholder="0x..."
            value={nftContract}
            onChange={(e) => setNftContract(e.target.value)}
            disabled={!isWalletConnected || isLoading}
            className="input input-bordered font-mono text-sm"
          />
        </div>

        {/* Token ID */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-pixel uppercase tracking-widest text-xs">
              Token ID
            </span>
          </label>
          <input
            type="number"
            placeholder="0"
            min="0"
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value)}
            disabled={!isWalletConnected || isLoading}
            className="input input-bordered font-mono text-sm"
          />
        </div>

        {/* Payment Token Address */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-pixel uppercase tracking-widest text-xs">
              Payment Token Address
            </span>
          </label>
          <input
            type="text"
            placeholder="0x..."
            value={paymentToken}
            onChange={(e) => setPaymentToken(e.target.value)}
            disabled={!isWalletConnected || isLoading}
            className="input input-bordered font-mono text-sm"
          />
        </div>

        {/* Start Date/Time */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-pixel uppercase tracking-widest text-xs flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              Start Date & Time
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={!isWalletConnected || isLoading}
              className="input input-bordered font-mono text-sm"
            />
            <div className="relative">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={!isWalletConnected || isLoading}
                className="input input-bordered font-mono text-sm w-full"
              />
              <Clock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/30 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* End Date/Time */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-pixel uppercase tracking-widest text-xs flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              End Date & Time
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={!isWalletConnected || isLoading}
              className="input input-bordered font-mono text-sm"
            />
            <div className="relative">
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={!isWalletConnected || isLoading}
                className="input input-bordered font-mono text-sm w-full"
              />
              <Clock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/30 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={!isWalletConnected || isLoading}
            className="btn btn-primary w-full font-display uppercase tracking-wide"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating Auction...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Create Auction
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
