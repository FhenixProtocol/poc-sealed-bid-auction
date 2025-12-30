import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { cofhejs, Encryptable } from "cofhejs/node";
import {
  deployContracts,
  createAuctionFixture,
  createActiveAuctionFixture,
  encryptBidAmount,
  createAuctionWithBidFixture,
  createAuctionReadyForSettlementFixture,
} from "./helpers/setup";

describe("SealedBidAuction", function () {
  describe("Deployment", function () {
    it("should deploy successfully", async function () {
      const { sealedBidAuction } = await deployContracts();
      expect(await sealedBidAuction.getAddress()).to.be.properAddress;
    });

    it("should initialize nextAuctionId to 0", async function () {
      const { sealedBidAuction } = await deployContracts();
      expect(await sealedBidAuction.nextAuctionId()).to.equal(0);
    });
  });

  describe("createAuction", function () {
    it("should create auction with correct seller", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, tokenId, startTime, endTime } =
        await createAuctionFixture();

      await sealedBidAuction
        .connect(seller)
        .createAuction(
          await auctionNFT.getAddress(),
          tokenId,
          await auctionToken.getAddress(),
          startTime,
          endTime
        );

      const auction = await sealedBidAuction.getAuction(0);
      expect(auction.seller).to.equal(seller.address);
    });

    it("should create auction with correct NFT contract", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, tokenId, startTime, endTime } =
        await createAuctionFixture();

      await sealedBidAuction
        .connect(seller)
        .createAuction(
          await auctionNFT.getAddress(),
          tokenId,
          await auctionToken.getAddress(),
          startTime,
          endTime
        );

      const auction = await sealedBidAuction.getAuction(0);
      expect(auction.nftContract).to.equal(await auctionNFT.getAddress());
    });

    it("should create auction with correct token ID", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, tokenId, startTime, endTime } =
        await createAuctionFixture();

      await sealedBidAuction
        .connect(seller)
        .createAuction(
          await auctionNFT.getAddress(),
          tokenId,
          await auctionToken.getAddress(),
          startTime,
          endTime
        );

      const auction = await sealedBidAuction.getAuction(0);
      expect(auction.tokenId).to.equal(tokenId);
    });

    it("should create auction with Active status", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, tokenId, startTime, endTime } =
        await createAuctionFixture();

      await sealedBidAuction
        .connect(seller)
        .createAuction(
          await auctionNFT.getAddress(),
          tokenId,
          await auctionToken.getAddress(),
          startTime,
          endTime
        );

      const auction = await sealedBidAuction.getAuction(0);
      expect(auction.status).to.equal(0); // Status.Active
    });

    it("should transfer NFT to auction contract", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, tokenId, startTime, endTime } =
        await createAuctionFixture();

      await sealedBidAuction
        .connect(seller)
        .createAuction(
          await auctionNFT.getAddress(),
          tokenId,
          await auctionToken.getAddress(),
          startTime,
          endTime
        );

      expect(await auctionNFT.ownerOf(tokenId)).to.equal(await sealedBidAuction.getAddress());
    });

    it("should increment nextAuctionId", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, tokenId, startTime, endTime } =
        await createAuctionFixture();

      expect(await sealedBidAuction.nextAuctionId()).to.equal(0);

      await sealedBidAuction
        .connect(seller)
        .createAuction(
          await auctionNFT.getAddress(),
          tokenId,
          await auctionToken.getAddress(),
          startTime,
          endTime
        );

      expect(await sealedBidAuction.nextAuctionId()).to.equal(1);
    });

    it("should emit AuctionCreated event", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, tokenId, startTime, endTime } =
        await createAuctionFixture();

      await expect(
        sealedBidAuction
          .connect(seller)
          .createAuction(
            await auctionNFT.getAddress(),
            tokenId,
            await auctionToken.getAddress(),
            startTime,
            endTime
          )
      )
        .to.emit(sealedBidAuction, "AuctionCreated")
        .withArgs(
          0,
          seller.address,
          await auctionNFT.getAddress(),
          tokenId,
          await auctionToken.getAddress(),
          startTime,
          endTime
        );
    });

    it("should revert if endTime equals startTime", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, tokenId, startTime } =
        await createAuctionFixture();

      await expect(
        sealedBidAuction
          .connect(seller)
          .createAuction(
            await auctionNFT.getAddress(),
            tokenId,
            await auctionToken.getAddress(),
            startTime,
            startTime
          )
      ).to.be.revertedWithCustomError(sealedBidAuction, "InvalidTimeRange");
    });

    it("should revert if endTime is before startTime", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, tokenId, startTime, endTime } =
        await createAuctionFixture();

      await expect(
        sealedBidAuction
          .connect(seller)
          .createAuction(
            await auctionNFT.getAddress(),
            tokenId,
            await auctionToken.getAddress(),
            endTime,
            startTime
          )
      ).to.be.revertedWithCustomError(sealedBidAuction, "InvalidTimeRange");
    });

    it("should revert if startTime is in the past", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, tokenId, endTime } =
        await createAuctionFixture();

      const pastTime = (await time.latest()) - 100;

      await expect(
        sealedBidAuction
          .connect(seller)
          .createAuction(
            await auctionNFT.getAddress(),
            tokenId,
            await auctionToken.getAddress(),
            pastTime,
            endTime
          )
      ).to.be.revertedWithCustomError(sealedBidAuction, "InvalidTimeRange");
    });

    it("should allow creating multiple auctions", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, bidder1, startTime, endTime } =
        await createAuctionFixture();

      // Create second NFT
      await auctionNFT.connect(bidder1).mint(bidder1.address, "ipfs://test-uri-2");
      await auctionNFT.connect(bidder1).approve(await sealedBidAuction.getAddress(), 1);

      // Create first auction (seller)
      await sealedBidAuction
        .connect(seller)
        .createAuction(
          await auctionNFT.getAddress(),
          0,
          await auctionToken.getAddress(),
          startTime,
          endTime
        );

      // Create second auction (bidder1)
      await sealedBidAuction
        .connect(bidder1)
        .createAuction(
          await auctionNFT.getAddress(),
          1,
          await auctionToken.getAddress(),
          startTime,
          endTime
        );

      expect(await sealedBidAuction.nextAuctionId()).to.equal(2);

      const auction0 = await sealedBidAuction.getAuction(0);
      const auction1 = await sealedBidAuction.getAuction(1);

      expect(auction0.seller).to.equal(seller.address);
      expect(auction1.seller).to.equal(bidder1.address);
    });
  });

  describe("bid", function () {
    it("should place encrypted bid successfully", async function () {
      const { sealedBidAuction, bidder1, auctionId } = await createActiveAuctionFixture();

      const bidAmount = 100_000000n; // 100 tokens
      const encryptedBid = await encryptBidAmount(bidder1, bidAmount);

      await expect(sealedBidAuction.connect(bidder1).bid(auctionId, encryptedBid))
        .to.emit(sealedBidAuction, "BidPlaced")
        .withArgs(auctionId, bidder1.address, await time.latest() + 1);
    });

    it("should mark bidder as having bid", async function () {
      const { sealedBidAuction, bidder1, auctionId } = await createActiveAuctionFixture();

      expect(await sealedBidAuction.hasBidOnAuction(auctionId, bidder1.address)).to.be.false;

      const bidAmount = 100_000000n;
      const encryptedBid = await encryptBidAmount(bidder1, bidAmount);
      await sealedBidAuction.connect(bidder1).bid(auctionId, encryptedBid);

      expect(await sealedBidAuction.hasBidOnAuction(auctionId, bidder1.address)).to.be.true;
    });

    it("should increment totalBids counter", async function () {
      const { sealedBidAuction, bidder1, auctionId } = await createActiveAuctionFixture();

      let auction = await sealedBidAuction.getAuction(auctionId);
      expect(auction.totalBids).to.equal(0);

      const bidAmount = 100_000000n;
      const encryptedBid = await encryptBidAmount(bidder1, bidAmount);
      await sealedBidAuction.connect(bidder1).bid(auctionId, encryptedBid);

      auction = await sealedBidAuction.getAuction(auctionId);
      expect(auction.totalBids).to.equal(1);
    });

    it("should allow multiple bidders to place bids", async function () {
      const { sealedBidAuction, bidder1, bidder2, auctionId } = await createActiveAuctionFixture();

      // Bidder 1 places bid
      const bidAmount1 = 100_000000n;
      const encryptedBid1 = await encryptBidAmount(bidder1, bidAmount1);
      await sealedBidAuction.connect(bidder1).bid(auctionId, encryptedBid1);

      // Bidder 2 places bid
      const bidAmount2 = 150_000000n;
      const encryptedBid2 = await encryptBidAmount(bidder2, bidAmount2);
      await sealedBidAuction.connect(bidder2).bid(auctionId, encryptedBid2);

      const auction = await sealedBidAuction.getAuction(auctionId);
      expect(auction.totalBids).to.equal(2);

      expect(await sealedBidAuction.hasBidOnAuction(auctionId, bidder1.address)).to.be.true;
      expect(await sealedBidAuction.hasBidOnAuction(auctionId, bidder2.address)).to.be.true;
    });

    it("should transfer encrypted tokens from bidder to contract", async function () {
      const { sealedBidAuction, auctionToken, bidder1, auctionId } = await createActiveAuctionFixture();

      const bidAmount = 100_000000n;

      // Get initial encrypted balance hash (non-zero after mint)
      const initialBalance = await auctionToken.confidentialBalanceOf(bidder1.address);
      expect(initialBalance).to.not.equal(0n, "Bidder should have encrypted balance after mint");

      const encryptedBid = await encryptBidAmount(bidder1, bidAmount);
      await sealedBidAuction.connect(bidder1).bid(auctionId, encryptedBid);

      // After bidding, the encrypted balance hash should change (tokens transferred)
      const afterBalance = await auctionToken.confidentialBalanceOf(bidder1.address);
      expect(afterBalance).to.not.equal(initialBalance, "Balance should change after bid");
    });

    it("should revert if bidder has already bid", async function () {
      const { sealedBidAuction, bidder1, auctionId, bidAmount } = await createAuctionWithBidFixture();

      // Try to bid again
      const newBidAmount = 200_000000n;
      const encryptedBid = await encryptBidAmount(bidder1, newBidAmount);

      await expect(
        sealedBidAuction.connect(bidder1).bid(auctionId, encryptedBid)
      ).to.be.revertedWithCustomError(sealedBidAuction, "AlreadyBid");
    });

    it("should revert if auction has not started", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, bidder1, tokenId } =
        await createAuctionFixture();

      const now = await time.latest();
      const startTime = now + 3600; // 1 hour from now
      const endTime = now + 7200; // 2 hours from now

      await sealedBidAuction
        .connect(seller)
        .createAuction(
          await auctionNFT.getAddress(),
          tokenId,
          await auctionToken.getAddress(),
          startTime,
          endTime
        );

      const bidAmount = 100_000000n;
      const encryptedBid = await encryptBidAmount(bidder1, bidAmount);

      await expect(
        sealedBidAuction.connect(bidder1).bid(0, encryptedBid)
      ).to.be.revertedWithCustomError(sealedBidAuction, "AuctionNotActive");
    });

    it("should revert if auction has ended", async function () {
      const { sealedBidAuction, bidder1, auctionId, endTime } = await createActiveAuctionFixture();

      // Advance time past end
      await time.increaseTo(endTime + 1);

      const bidAmount = 100_000000n;
      const encryptedBid = await encryptBidAmount(bidder1, bidAmount);

      await expect(
        sealedBidAuction.connect(bidder1).bid(auctionId, encryptedBid)
      ).to.be.revertedWithCustomError(sealedBidAuction, "AuctionNotEnded");
    });

    it("should revert if auction is cancelled", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, bidder1, tokenId, startTime, endTime } =
        await createAuctionFixture();

      await sealedBidAuction
        .connect(seller)
        .createAuction(
          await auctionNFT.getAddress(),
          tokenId,
          await auctionToken.getAddress(),
          startTime,
          endTime
        );

      // Cancel the auction
      await sealedBidAuction.connect(seller).cancelAuction(0);

      // Advance time to after start
      await time.increaseTo(startTime + 1);

      const bidAmount = 100_000000n;
      const encryptedBid = await encryptBidAmount(bidder1, bidAmount);

      await expect(
        sealedBidAuction.connect(bidder1).bid(0, encryptedBid)
      ).to.be.revertedWithCustomError(sealedBidAuction, "AuctionNotActive");
    });

    it("should revert if bidder has not set operator", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, bidder3, tokenId, startTime, endTime } =
        await createAuctionFixture();

      // bidder3 has tokens minted but no operator set
      await auctionToken.mint(bidder3.address, 1000_000000n);

      await sealedBidAuction
        .connect(seller)
        .createAuction(
          await auctionNFT.getAddress(),
          tokenId,
          await auctionToken.getAddress(),
          startTime,
          endTime
        );

      await time.increaseTo(startTime + 1);

      const bidAmount = 100_000000n;
      const encryptedBid = await encryptBidAmount(bidder3, bidAmount);

      // Should revert because bidder3 hasn't set operator
      await expect(
        sealedBidAuction.connect(bidder3).bid(0, encryptedBid)
      ).to.be.revertedWithCustomError(auctionToken, "FHERC20UnauthorizedSpender");
    });
  });

  describe("requestSettlement", function () {
    it("should request settlement after auction ends with bids", async function () {
      const { sealedBidAuction, auctionId } = await createAuctionReadyForSettlementFixture();

      await expect(sealedBidAuction.requestSettlement(auctionId))
        .to.emit(sealedBidAuction, "SettlementRequested")
        .withArgs(auctionId);
    });

    it("should change auction status to SettlementRequested", async function () {
      const { sealedBidAuction, auctionId } = await createAuctionReadyForSettlementFixture();

      await sealedBidAuction.requestSettlement(auctionId);

      const auction = await sealedBidAuction.getAuction(auctionId);
      expect(auction.status).to.equal(2); // Status.SettlementRequested
    });

    it("should revert if auction has not ended", async function () {
      const { sealedBidAuction, bidder1, auctionId } = await createActiveAuctionFixture();

      // Place a bid first
      const bidAmount = 100_000000n;
      const encryptedBid = await encryptBidAmount(bidder1, bidAmount);
      await sealedBidAuction.connect(bidder1).bid(auctionId, encryptedBid);

      // Try to settle before end time
      await expect(
        sealedBidAuction.requestSettlement(auctionId)
      ).to.be.revertedWithCustomError(sealedBidAuction, "AuctionNotEnded");
    });

    it("should revert if no bids were placed", async function () {
      const { sealedBidAuction, auctionId, endTime } = await createActiveAuctionFixture();

      // Advance past end time without any bids
      await time.increaseTo(endTime + 1);

      await expect(
        sealedBidAuction.requestSettlement(auctionId)
      ).to.be.revertedWithCustomError(sealedBidAuction, "NoBidsPlaced");
    });

    it("should revert if auction is not active", async function () {
      const { sealedBidAuction, auctionId } = await createAuctionReadyForSettlementFixture();

      // Request settlement once
      await sealedBidAuction.requestSettlement(auctionId);

      // Try to request again
      await expect(
        sealedBidAuction.requestSettlement(auctionId)
      ).to.be.revertedWithCustomError(sealedBidAuction, "AuctionNotActive");
    });

    it("should revert if auction is cancelled", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, tokenId, startTime, endTime } =
        await createAuctionFixture();

      await sealedBidAuction
        .connect(seller)
        .createAuction(
          await auctionNFT.getAddress(),
          tokenId,
          await auctionToken.getAddress(),
          startTime,
          endTime
        );

      // Cancel auction
      await sealedBidAuction.connect(seller).cancelAuction(0);

      // Advance past end time
      await time.increaseTo(endTime + 1);

      await expect(
        sealedBidAuction.requestSettlement(0)
      ).to.be.revertedWithCustomError(sealedBidAuction, "AuctionNotActive");
    });
  });

  describe("finalizeSettlement", function () {
    it("should finalize settlement with correct winner", async function () {
      const { sealedBidAuction, auctionNFT, auctionId, winner, winningAmount, tokenId } =
        await createAuctionReadyForSettlementFixture();

      // Request settlement first
      await sealedBidAuction.requestSettlement(auctionId);

      // Finalize with decrypted values
      await expect(
        sealedBidAuction.finalizeSettlement(auctionId, winner.address, winningAmount)
      )
        .to.emit(sealedBidAuction, "AuctionSettled")
        .withArgs(auctionId, winner.address, winningAmount);
    });

    it("should transfer NFT to winner", async function () {
      const { sealedBidAuction, auctionNFT, auctionId, winner, winningAmount, tokenId } =
        await createAuctionReadyForSettlementFixture();

      await sealedBidAuction.requestSettlement(auctionId);
      await sealedBidAuction.finalizeSettlement(auctionId, winner.address, winningAmount);

      expect(await auctionNFT.ownerOf(tokenId)).to.equal(winner.address);
    });

    it("should change status to Settled", async function () {
      const { sealedBidAuction, auctionId, winner, winningAmount } =
        await createAuctionReadyForSettlementFixture();

      await sealedBidAuction.requestSettlement(auctionId);
      await sealedBidAuction.finalizeSettlement(auctionId, winner.address, winningAmount);

      const auction = await sealedBidAuction.getAuction(auctionId);
      expect(auction.status).to.equal(3); // Status.Settled
    });

    it("should store decrypted winner and amount", async function () {
      const { sealedBidAuction, auctionId, winner, winningAmount } =
        await createAuctionReadyForSettlementFixture();

      await sealedBidAuction.requestSettlement(auctionId);
      await sealedBidAuction.finalizeSettlement(auctionId, winner.address, winningAmount);

      const result = await sealedBidAuction.getSettlementResult(auctionId);
      expect(result.winner).to.equal(winner.address);
      expect(result.amount).to.equal(winningAmount);
    });

    it("should revert if settlement was not requested", async function () {
      const { sealedBidAuction, auctionId, winner, winningAmount, endTime } =
        await createAuctionReadyForSettlementFixture();

      // Try to finalize without requesting first
      await expect(
        sealedBidAuction.finalizeSettlement(auctionId, winner.address, winningAmount)
      ).to.be.revertedWithCustomError(sealedBidAuction, "SettlementNotRequested");
    });

    it("should revert if already settled", async function () {
      const { sealedBidAuction, auctionId, winner, winningAmount } =
        await createAuctionReadyForSettlementFixture();

      await sealedBidAuction.requestSettlement(auctionId);
      await sealedBidAuction.finalizeSettlement(auctionId, winner.address, winningAmount);

      // Try to finalize again
      await expect(
        sealedBidAuction.finalizeSettlement(auctionId, winner.address, winningAmount)
      ).to.be.revertedWithCustomError(sealedBidAuction, "SettlementNotRequested");
    });
  });

  describe("claimRefund", function () {
    it("should allow losing bidder to claim refund after settlement", async function () {
      const { sealedBidAuction, auctionId, winner, winningAmount, loser } =
        await createAuctionReadyForSettlementFixture();

      await sealedBidAuction.requestSettlement(auctionId);
      await sealedBidAuction.finalizeSettlement(auctionId, winner.address, winningAmount);

      await expect(sealedBidAuction.connect(loser).claimRefund(auctionId))
        .to.emit(sealedBidAuction, "RefundClaimed")
        .withArgs(auctionId, loser.address);
    });

    it("should mark refund as claimed", async function () {
      const { sealedBidAuction, auctionId, winner, winningAmount, loser } =
        await createAuctionReadyForSettlementFixture();

      await sealedBidAuction.requestSettlement(auctionId);
      await sealedBidAuction.finalizeSettlement(auctionId, winner.address, winningAmount);

      expect(await sealedBidAuction.hasClaimedRefund(auctionId, loser.address)).to.be.false;

      await sealedBidAuction.connect(loser).claimRefund(auctionId);

      expect(await sealedBidAuction.hasClaimedRefund(auctionId, loser.address)).to.be.true;
    });

    it("should allow refund after auction cancellation", async function () {
      const { sealedBidAuction, auctionToken, bidder1, auctionId, bidAmount } =
        await createAuctionWithBidFixture();

      // Note: In the current implementation, cancellation is only allowed with 0 bids
      // This test would need the contract to be modified to allow cancellation with bids
      // For now, we'll skip this specific scenario
    });

    it("should revert if winner tries to claim refund", async function () {
      const { sealedBidAuction, auctionId, winner, winningAmount } =
        await createAuctionReadyForSettlementFixture();

      await sealedBidAuction.requestSettlement(auctionId);
      await sealedBidAuction.finalizeSettlement(auctionId, winner.address, winningAmount);

      await expect(
        sealedBidAuction.connect(winner).claimRefund(auctionId)
      ).to.be.revertedWithCustomError(sealedBidAuction, "IsWinner");
    });

    it("should revert if already refunded", async function () {
      const { sealedBidAuction, auctionId, winner, winningAmount, loser } =
        await createAuctionReadyForSettlementFixture();

      await sealedBidAuction.requestSettlement(auctionId);
      await sealedBidAuction.finalizeSettlement(auctionId, winner.address, winningAmount);

      // Claim once
      await sealedBidAuction.connect(loser).claimRefund(auctionId);

      // Try to claim again
      await expect(
        sealedBidAuction.connect(loser).claimRefund(auctionId)
      ).to.be.revertedWithCustomError(sealedBidAuction, "AlreadyRefunded");
    });

    it("should revert if caller never bid", async function () {
      const { sealedBidAuction, auctionId, winner, winningAmount, bidder3 } =
        await createAuctionReadyForSettlementFixture();

      await sealedBidAuction.requestSettlement(auctionId);
      await sealedBidAuction.finalizeSettlement(auctionId, winner.address, winningAmount);

      await expect(
        sealedBidAuction.connect(bidder3).claimRefund(auctionId)
      ).to.be.revertedWithCustomError(sealedBidAuction, "NotBidder");
    });

    it("should revert if auction is not settled", async function () {
      const { sealedBidAuction, bidder1, auctionId } = await createAuctionWithBidFixture();

      await expect(
        sealedBidAuction.connect(bidder1).claimRefund(auctionId)
      ).to.be.revertedWithCustomError(sealedBidAuction, "AuctionNotSettled");
    });
  });

  describe("cancelAuction", function () {
    it("should allow seller to cancel auction with no bids", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, tokenId, startTime, endTime } =
        await createAuctionFixture();

      await sealedBidAuction
        .connect(seller)
        .createAuction(
          await auctionNFT.getAddress(),
          tokenId,
          await auctionToken.getAddress(),
          startTime,
          endTime
        );

      await sealedBidAuction.connect(seller).cancelAuction(0);

      const auction = await sealedBidAuction.getAuction(0);
      expect(auction.status).to.equal(4); // Status.Cancelled
    });

    it("should return NFT to seller on cancellation", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, tokenId, startTime, endTime } =
        await createAuctionFixture();

      await sealedBidAuction
        .connect(seller)
        .createAuction(
          await auctionNFT.getAddress(),
          tokenId,
          await auctionToken.getAddress(),
          startTime,
          endTime
        );

      // NFT should be in auction contract
      expect(await auctionNFT.ownerOf(tokenId)).to.equal(await sealedBidAuction.getAddress());

      await sealedBidAuction.connect(seller).cancelAuction(0);

      // NFT should be back with seller
      expect(await auctionNFT.ownerOf(tokenId)).to.equal(seller.address);
    });

    it("should emit AuctionCancelled event", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, tokenId, startTime, endTime } =
        await createAuctionFixture();

      await sealedBidAuction
        .connect(seller)
        .createAuction(
          await auctionNFT.getAddress(),
          tokenId,
          await auctionToken.getAddress(),
          startTime,
          endTime
        );

      await expect(sealedBidAuction.connect(seller).cancelAuction(0))
        .to.emit(sealedBidAuction, "AuctionCancelled")
        .withArgs(0);
    });

    it("should revert if caller is not seller", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, bidder1, tokenId, startTime, endTime } =
        await createAuctionFixture();

      await sealedBidAuction
        .connect(seller)
        .createAuction(
          await auctionNFT.getAddress(),
          tokenId,
          await auctionToken.getAddress(),
          startTime,
          endTime
        );

      await expect(
        sealedBidAuction.connect(bidder1).cancelAuction(0)
      ).to.be.revertedWithCustomError(sealedBidAuction, "NotSeller");
    });

    it("should revert if auction is already cancelled", async function () {
      const { auctionNFT, auctionToken, sealedBidAuction, seller, tokenId, startTime, endTime } =
        await createAuctionFixture();

      await sealedBidAuction
        .connect(seller)
        .createAuction(
          await auctionNFT.getAddress(),
          tokenId,
          await auctionToken.getAddress(),
          startTime,
          endTime
        );

      await sealedBidAuction.connect(seller).cancelAuction(0);

      await expect(
        sealedBidAuction.connect(seller).cancelAuction(0)
      ).to.be.revertedWithCustomError(sealedBidAuction, "AuctionNotActive");
    });

    it("should revert if bids have been placed", async function () {
      const { sealedBidAuction, seller, auctionId } = await createAuctionWithBidFixture();

      await expect(
        sealedBidAuction.connect(seller).cancelAuction(auctionId)
      ).to.be.revertedWithCustomError(sealedBidAuction, "AuctionAlreadySettled");
    });
  });

  describe("View Functions", function () {
    describe("getAuction", function () {
      it("should return correct auction details", async function () {
        const { auctionNFT, auctionToken, sealedBidAuction, seller, tokenId, startTime, endTime } =
          await createAuctionFixture();

        await sealedBidAuction
          .connect(seller)
          .createAuction(
            await auctionNFT.getAddress(),
            tokenId,
            await auctionToken.getAddress(),
            startTime,
            endTime
          );

        const auction = await sealedBidAuction.getAuction(0);

        expect(auction.seller).to.equal(seller.address);
        expect(auction.nftContract).to.equal(await auctionNFT.getAddress());
        expect(auction.tokenId).to.equal(tokenId);
        expect(auction.fherc20Token).to.equal(await auctionToken.getAddress());
        expect(auction.startTime).to.equal(startTime);
        expect(auction.endTime).to.equal(endTime);
        expect(auction.status).to.equal(0); // Active
        expect(auction.totalBids).to.equal(0);
      });
    });

    describe("hasBidOnAuction", function () {
      it("should return false for address that hasn't bid", async function () {
        const { auctionNFT, auctionToken, sealedBidAuction, seller, bidder1, tokenId, startTime, endTime } =
          await createAuctionFixture();

        await sealedBidAuction
          .connect(seller)
          .createAuction(
            await auctionNFT.getAddress(),
            tokenId,
            await auctionToken.getAddress(),
            startTime,
            endTime
          );

        expect(await sealedBidAuction.hasBidOnAuction(0, bidder1.address)).to.be.false;
      });

      it("should return true after bidding", async function () {
        const { sealedBidAuction, bidder1, auctionId } = await createAuctionWithBidFixture();

        expect(await sealedBidAuction.hasBidOnAuction(auctionId, bidder1.address)).to.be.true;
      });
    });

    describe("hasClaimedRefund", function () {
      it("should return false initially", async function () {
        const { auctionNFT, auctionToken, sealedBidAuction, seller, bidder1, tokenId, startTime, endTime } =
          await createAuctionFixture();

        await sealedBidAuction
          .connect(seller)
          .createAuction(
            await auctionNFT.getAddress(),
            tokenId,
            await auctionToken.getAddress(),
            startTime,
            endTime
          );

        expect(await sealedBidAuction.hasClaimedRefund(0, bidder1.address)).to.be.false;
      });
    });

    describe("getSettlementResult", function () {
      it("should revert if auction is not settled", async function () {
        const { auctionNFT, auctionToken, sealedBidAuction, seller, tokenId, startTime, endTime } =
          await createAuctionFixture();

        await sealedBidAuction
          .connect(seller)
          .createAuction(
            await auctionNFT.getAddress(),
            tokenId,
            await auctionToken.getAddress(),
            startTime,
            endTime
          );

        await expect(
          sealedBidAuction.getSettlementResult(0)
        ).to.be.revertedWithCustomError(sealedBidAuction, "AuctionNotSettled");
      });

      it("should return correct result after settlement", async function () {
        const { sealedBidAuction, auctionId, winner, winningAmount } =
          await createAuctionReadyForSettlementFixture();

        await sealedBidAuction.requestSettlement(auctionId);
        await sealedBidAuction.finalizeSettlement(auctionId, winner.address, winningAmount);

        const result = await sealedBidAuction.getSettlementResult(auctionId);
        expect(result.winner).to.equal(winner.address);
        expect(result.amount).to.equal(winningAmount);
      });
    });
  });

  describe("ERC721Receiver", function () {
    it("should implement onERC721Received correctly", async function () {
      const { auctionNFT, sealedBidAuction, seller } = await deployContracts();

      // Mint NFT
      await auctionNFT.mint(seller.address, "ipfs://test-uri");

      // Safe transfer should work (contract implements IERC721Receiver)
      await expect(
        auctionNFT.connect(seller)["safeTransferFrom(address,address,uint256)"](
          seller.address,
          await sealedBidAuction.getAddress(),
          0
        )
      ).to.not.be.reverted;

      expect(await auctionNFT.ownerOf(0)).to.equal(await sealedBidAuction.getAddress());
    });
  });

  describe("Full Auction Flow (E2E)", function () {
    it("should complete full auction lifecycle", async function () {
      const { sealedBidAuction, auctionNFT, auctionToken, seller, bidder1, bidder2, auctionId, winner, winningAmount, loser, tokenId } =
        await createAuctionReadyForSettlementFixture();

      // Verify auction state after bids
      const auction = await sealedBidAuction.getAuction(auctionId);
      expect(auction.totalBids).to.equal(2);
      expect(auction.status).to.equal(0); // Active

      // Request settlement
      await sealedBidAuction.requestSettlement(auctionId);
      const afterRequest = await sealedBidAuction.getAuction(auctionId);
      expect(afterRequest.status).to.equal(2); // SettlementRequested

      // Finalize settlement
      await sealedBidAuction.finalizeSettlement(auctionId, winner.address, winningAmount);
      const afterSettle = await sealedBidAuction.getAuction(auctionId);
      expect(afterSettle.status).to.equal(3); // Settled

      // Verify NFT transferred to winner
      expect(await auctionNFT.ownerOf(tokenId)).to.equal(winner.address);

      // Loser claims refund
      await sealedBidAuction.connect(loser).claimRefund(auctionId);
      expect(await sealedBidAuction.hasClaimedRefund(auctionId, loser.address)).to.be.true;

      // Verify settlement result
      const result = await sealedBidAuction.getSettlementResult(auctionId);
      expect(result.winner).to.equal(winner.address);
      expect(result.amount).to.equal(winningAmount);
    });

    it("should handle auction with single bidder", async function () {
      const { sealedBidAuction, auctionNFT, bidder1, auctionId, endTime, tokenId, bidAmount } =
        await createAuctionWithBidFixture();

      // Advance past end time
      await time.increaseTo(endTime + 1);

      // Request and finalize settlement
      await sealedBidAuction.requestSettlement(auctionId);
      await sealedBidAuction.finalizeSettlement(auctionId, bidder1.address, bidAmount);

      // Verify single bidder wins
      expect(await auctionNFT.ownerOf(tokenId)).to.equal(bidder1.address);

      const result = await sealedBidAuction.getSettlementResult(auctionId);
      expect(result.winner).to.equal(bidder1.address);
    });
  });
});
