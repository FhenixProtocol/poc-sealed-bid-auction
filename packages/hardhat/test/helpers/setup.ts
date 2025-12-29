import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

export async function deployContracts() {
  const [deployer, seller, bidder1, bidder2, bidder3] = await ethers.getSigners();

  // Deploy AuctionToken (FHERC20)
  const AuctionToken = await ethers.getContractFactory("AuctionToken");
  const auctionToken = await AuctionToken.deploy();
  await auctionToken.waitForDeployment();

  // Deploy AuctionNFT
  const AuctionNFT = await ethers.getContractFactory("AuctionNFT");
  const auctionNFT = await AuctionNFT.deploy();
  await auctionNFT.waitForDeployment();

  // Deploy SealedBidAuction
  const SealedBidAuction = await ethers.getContractFactory("SealedBidAuction");
  const sealedBidAuction = await SealedBidAuction.deploy();
  await sealedBidAuction.waitForDeployment();

  return {
    auctionToken,
    auctionNFT,
    sealedBidAuction,
    deployer,
    seller,
    bidder1,
    bidder2,
    bidder3,
  };
}

export async function createAuctionFixture() {
  const contracts = await deployContracts();
  const { auctionToken, auctionNFT, sealedBidAuction, seller, bidder1, bidder2 } = contracts;

  // Mint NFT to seller
  await auctionNFT.connect(seller).mint(seller.address, "ipfs://test-uri");
  const tokenId = 0;

  // Approve auction contract to transfer NFT
  await auctionNFT.connect(seller).approve(await sealedBidAuction.getAddress(), tokenId);

  // Mint tokens to bidders (1000 tokens each with 6 decimals)
  await auctionToken.mint(bidder1.address, 1000_000000n);
  await auctionToken.mint(bidder2.address, 1000_000000n);

  // Set auction contract as operator for bidders (24 hours from now)
  const futureTimestamp = Math.floor(Date.now() / 1000) + 86400;
  await auctionToken.connect(bidder1).setOperator(await sealedBidAuction.getAddress(), futureTimestamp);
  await auctionToken.connect(bidder2).setOperator(await sealedBidAuction.getAddress(), futureTimestamp);

  // Set up auction times
  const now = await time.latest();
  const startTime = now + 60; // 1 minute from now
  const endTime = now + 3600; // 1 hour from now

  return {
    ...contracts,
    tokenId,
    startTime,
    endTime,
  };
}

export async function createActiveAuctionFixture() {
  const fixture = await createAuctionFixture();
  const { auctionNFT, auctionToken, sealedBidAuction, seller, tokenId, startTime, endTime } = fixture;

  // Create the auction
  await sealedBidAuction
    .connect(seller)
    .createAuction(
      await auctionNFT.getAddress(),
      tokenId,
      await auctionToken.getAddress(),
      startTime,
      endTime
    );

  // Advance time to start of auction
  await time.increaseTo(startTime + 1);

  return {
    ...fixture,
    auctionId: 0n,
  };
}
