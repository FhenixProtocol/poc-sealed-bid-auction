import { expect } from "chai";
import { ethers } from "hardhat";
import { deployContracts } from "./helpers/setup";

describe("AuctionToken", function () {
  describe("Deployment", function () {
    it("should deploy successfully", async function () {
      const { auctionToken } = await deployContracts();
      expect(await auctionToken.getAddress()).to.be.properAddress;
    });

    it("should have correct name", async function () {
      const { auctionToken } = await deployContracts();
      expect(await auctionToken.name()).to.equal("Auction Token");
    });

    it("should have correct symbol", async function () {
      const { auctionToken } = await deployContracts();
      expect(await auctionToken.symbol()).to.equal("AUCT");
    });

    it("should have 6 decimals", async function () {
      const { auctionToken } = await deployContracts();
      expect(await auctionToken.decimals()).to.equal(6);
    });

    it("should return true for isFherc20", async function () {
      const { auctionToken } = await deployContracts();
      expect(await auctionToken.isFherc20()).to.be.true;
    });
  });

  describe("Minting", function () {
    it("should allow minting tokens", async function () {
      const { auctionToken, bidder1 } = await deployContracts();
      await expect(auctionToken.mint(bidder1.address, 1000_000000n))
        .to.not.be.reverted;
    });

    it("should mint to multiple addresses", async function () {
      const { auctionToken, bidder1, bidder2 } = await deployContracts();
      await auctionToken.mint(bidder1.address, 1000_000000n);
      await auctionToken.mint(bidder2.address, 500_000000n);
      // Note: balanceOf returns indicated balance, actual balance is encrypted
    });
  });

  describe("Operator Management", function () {
    it("should allow setting operator", async function () {
      const { auctionToken, bidder1, sealedBidAuction } = await deployContracts();
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400;

      await expect(
        auctionToken.connect(bidder1).setOperator(await sealedBidAuction.getAddress(), futureTimestamp)
      ).to.not.be.reverted;
    });

    it("should correctly report operator status", async function () {
      const { auctionToken, bidder1, sealedBidAuction } = await deployContracts();
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400;

      // Before setting operator
      expect(
        await auctionToken.isOperator(bidder1.address, await sealedBidAuction.getAddress())
      ).to.be.false;

      // After setting operator
      await auctionToken.connect(bidder1).setOperator(await sealedBidAuction.getAddress(), futureTimestamp);
      expect(
        await auctionToken.isOperator(bidder1.address, await sealedBidAuction.getAddress())
      ).to.be.true;
    });

    it("should emit OperatorSet event", async function () {
      const { auctionToken, bidder1, sealedBidAuction } = await deployContracts();
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400;

      await expect(
        auctionToken.connect(bidder1).setOperator(await sealedBidAuction.getAddress(), futureTimestamp)
      ).to.emit(auctionToken, "OperatorSet");
    });
  });

  describe("ERC20 Compatibility Reverts", function () {
    it("should revert on transfer()", async function () {
      const { auctionToken, bidder1, bidder2 } = await deployContracts();
      await auctionToken.mint(bidder1.address, 1000_000000n);

      await expect(
        auctionToken.connect(bidder1).transfer(bidder2.address, 100_000000n)
      ).to.be.revertedWithCustomError(auctionToken, "FHERC20IncompatibleFunction");
    });

    it("should revert on approve()", async function () {
      const { auctionToken, bidder1, bidder2 } = await deployContracts();

      await expect(
        auctionToken.connect(bidder1).approve(bidder2.address, 100_000000n)
      ).to.be.revertedWithCustomError(auctionToken, "FHERC20IncompatibleFunction");
    });

    it("should revert on transferFrom()", async function () {
      const { auctionToken, bidder1, bidder2, deployer } = await deployContracts();

      await expect(
        auctionToken.connect(deployer).transferFrom(bidder1.address, bidder2.address, 100_000000n)
      ).to.be.revertedWithCustomError(auctionToken, "FHERC20IncompatibleFunction");
    });

    it("should revert on allowance()", async function () {
      const { auctionToken, bidder1, bidder2 } = await deployContracts();

      await expect(
        auctionToken.allowance(bidder1.address, bidder2.address)
      ).to.be.revertedWithCustomError(auctionToken, "FHERC20IncompatibleFunction");
    });
  });
});
