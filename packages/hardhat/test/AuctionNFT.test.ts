import { expect } from "chai";
import { ethers } from "hardhat";
import { deployContracts } from "./helpers/setup";

describe("AuctionNFT", function () {
  describe("Deployment", function () {
    it("should deploy successfully", async function () {
      const { auctionNFT } = await deployContracts();
      expect(await auctionNFT.getAddress()).to.be.properAddress;
    });

    it("should have correct name", async function () {
      const { auctionNFT } = await deployContracts();
      expect(await auctionNFT.name()).to.equal("Auction NFT");
    });

    it("should have correct symbol", async function () {
      const { auctionNFT } = await deployContracts();
      expect(await auctionNFT.symbol()).to.equal("ANFT");
    });
  });

  describe("Minting", function () {
    it("should mint NFT with correct owner", async function () {
      const { auctionNFT, seller } = await deployContracts();
      await auctionNFT.mint(seller.address, "ipfs://test-uri");

      expect(await auctionNFT.ownerOf(0)).to.equal(seller.address);
    });

    it("should mint NFT with correct URI", async function () {
      const { auctionNFT, seller } = await deployContracts();
      await auctionNFT.mint(seller.address, "ipfs://test-uri");

      expect(await auctionNFT.tokenURI(0)).to.equal("ipfs://test-uri");
    });

    it("should increment token IDs", async function () {
      const { auctionNFT, seller, bidder1 } = await deployContracts();

      await auctionNFT.mint(seller.address, "ipfs://uri-0");
      await auctionNFT.mint(bidder1.address, "ipfs://uri-1");

      expect(await auctionNFT.ownerOf(0)).to.equal(seller.address);
      expect(await auctionNFT.ownerOf(1)).to.equal(bidder1.address);
    });

    it("should return correct token ID", async function () {
      const { auctionNFT, seller } = await deployContracts();

      // First mint
      const tx1 = await auctionNFT.mint(seller.address, "ipfs://uri-0");
      await tx1.wait();

      // Second mint
      const tx2 = await auctionNFT.mint(seller.address, "ipfs://uri-1");
      await tx2.wait();

      expect(await auctionNFT.tokenURI(0)).to.equal("ipfs://uri-0");
      expect(await auctionNFT.tokenURI(1)).to.equal("ipfs://uri-1");
    });

    it("should emit Transfer event on mint", async function () {
      const { auctionNFT, seller } = await deployContracts();

      await expect(auctionNFT.mint(seller.address, "ipfs://test-uri"))
        .to.emit(auctionNFT, "Transfer")
        .withArgs(ethers.ZeroAddress, seller.address, 0);
    });
  });

  describe("Transfers", function () {
    it("should allow owner to transfer", async function () {
      const { auctionNFT, seller, bidder1 } = await deployContracts();
      await auctionNFT.mint(seller.address, "ipfs://test-uri");

      await auctionNFT.connect(seller).transferFrom(seller.address, bidder1.address, 0);

      expect(await auctionNFT.ownerOf(0)).to.equal(bidder1.address);
    });

    it("should allow approved operator to transfer", async function () {
      const { auctionNFT, seller, bidder1, deployer } = await deployContracts();
      await auctionNFT.mint(seller.address, "ipfs://test-uri");

      await auctionNFT.connect(seller).approve(deployer.address, 0);
      await auctionNFT.connect(deployer).transferFrom(seller.address, bidder1.address, 0);

      expect(await auctionNFT.ownerOf(0)).to.equal(bidder1.address);
    });

    it("should revert transfer from non-owner/non-approved", async function () {
      const { auctionNFT, seller, bidder1, bidder2 } = await deployContracts();
      await auctionNFT.mint(seller.address, "ipfs://test-uri");

      await expect(
        auctionNFT.connect(bidder1).transferFrom(seller.address, bidder2.address, 0)
      ).to.be.reverted;
    });
  });

  describe("supportsInterface", function () {
    it("should support ERC721 interface", async function () {
      const { auctionNFT } = await deployContracts();
      // ERC721 interface ID: 0x80ac58cd
      expect(await auctionNFT.supportsInterface("0x80ac58cd")).to.be.true;
    });

    it("should support ERC721Metadata interface", async function () {
      const { auctionNFT } = await deployContracts();
      // ERC721Metadata interface ID: 0x5b5e139f
      expect(await auctionNFT.supportsInterface("0x5b5e139f")).to.be.true;
    });

    it("should support ERC165 interface", async function () {
      const { auctionNFT } = await deployContracts();
      // ERC165 interface ID: 0x01ffc9a7
      expect(await auctionNFT.supportsInterface("0x01ffc9a7")).to.be.true;
    });
  });
});
