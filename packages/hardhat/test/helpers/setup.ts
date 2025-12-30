import hre, { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { cofhejs, Encryptable } from "cofhejs/node";

export async function deployContracts() {
  const [deployer, seller, bidder1, bidder2, bidder3] = await ethers.getSigners();

  // Initialize cofhe with deployer for initial setup
  await hre.cofhe.initializeWithHardhatSigner(deployer);

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

/**
 * Helper to encrypt a bid amount for a specific bidder
 * @param bidder The signer placing the bid
 * @param amount The amount to encrypt (in token base units)
 */
export async function encryptBidAmount(bidder: any, amount: bigint) {
  // Initialize cofhejs with the bidder's signer
  await hre.cofhe.expectResultSuccess(await hre.cofhe.initializeWithHardhatSigner(bidder));

  // Encrypt the amount
  const encResult = await cofhejs.encrypt([Encryptable.uint64(amount)] as const);
  const [encryptedInput] = await hre.cofhe.expectResultSuccess(encResult);

  return encryptedInput;
}

/**
 * Creates a fixture with an active auction where bidder1 has already placed a bid
 */
export async function createAuctionWithBidFixture() {
  const fixture = await createActiveAuctionFixture();
  const { auctionToken, sealedBidAuction, bidder1, auctionId } = fixture;

  // Encrypt bid amount for bidder1 (100 tokens with 6 decimals)
  const bidAmount = 100_000000n;
  const encryptedBid = await encryptBidAmount(bidder1, bidAmount);

  // Place the bid
  await sealedBidAuction.connect(bidder1).bid(auctionId, encryptedBid);

  return {
    ...fixture,
    bidAmount,
  };
}

/**
 * Creates a fixture with an auction that has multiple bids and is ready for settlement
 */
export async function createAuctionReadyForSettlementFixture() {
  const fixture = await createActiveAuctionFixture();
  const { auctionToken, sealedBidAuction, bidder1, bidder2, auctionId, endTime } = fixture;

  // Place bids from both bidders
  const bidAmount1 = 100_000000n; // 100 tokens
  const bidAmount2 = 150_000000n; // 150 tokens (higher bid)

  const encryptedBid1 = await encryptBidAmount(bidder1, bidAmount1);
  await sealedBidAuction.connect(bidder1).bid(auctionId, encryptedBid1);

  const encryptedBid2 = await encryptBidAmount(bidder2, bidAmount2);
  await sealedBidAuction.connect(bidder2).bid(auctionId, encryptedBid2);

  // Advance time past auction end
  await time.increaseTo(endTime + 1);

  return {
    ...fixture,
    bidAmount1,
    bidAmount2,
    winner: bidder2, // Higher bidder wins
    winningAmount: bidAmount2,
    loser: bidder1,
    losingAmount: bidAmount1,
  };
}
