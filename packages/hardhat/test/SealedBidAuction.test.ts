import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { deployContracts, createAuctionFixture, createActiveAuctionFixture } from "./helpers/setup";

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

      it("should return false for seller", async function () {
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

        expect(await sealedBidAuction.hasBidOnAuction(0, seller.address)).to.be.false;
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

  // Note: bid, requestSettlement, finalizeSettlement, and claimRefund tests
  // require FHE mock setup which depends on cofhe-hardhat-plugin configuration.
  // The tests below are placeholders that verify the function signatures exist.

  describe("FHE Functions (require mock setup)", function () {
    describe("bid", function () {
      it("should have bid function defined", async function () {
        const { sealedBidAuction } = await deployContracts();
        expect(sealedBidAuction.bid).to.be.a("function");
      });
    });

    describe("requestSettlement", function () {
      it("should have requestSettlement function defined", async function () {
        const { sealedBidAuction } = await deployContracts();
        expect(sealedBidAuction.requestSettlement).to.be.a("function");
      });
    });

    describe("finalizeSettlement", function () {
      it("should have finalizeSettlement function defined", async function () {
        const { sealedBidAuction } = await deployContracts();
        expect(sealedBidAuction.finalizeSettlement).to.be.a("function");
      });
    });

    describe("claimRefund", function () {
      it("should have claimRefund function defined", async function () {
        const { sealedBidAuction } = await deployContracts();
        expect(sealedBidAuction.claimRefund).to.be.a("function");
      });
    });
  });
});
