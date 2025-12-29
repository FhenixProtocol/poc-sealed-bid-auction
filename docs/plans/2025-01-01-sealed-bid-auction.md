# Sealed Bid Auction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a PoC sealed bid auction system using FHE where bids are encrypted, and only the winner is revealed at settlement.

**Architecture:** Single contract managing multiple auctions via auction IDs. Bidders deposit FHERC20 tokens as encrypted bids. Two-step settlement: request decryption of winner (eaddress), then finalize transfers. Losers claim refunds of their encrypted deposits.

**Tech Stack:** Solidity 0.8.25, @fhenixprotocol/cofhe-contracts (FHE), fhenix-confidential-contracts (FHERC20), OpenZeppelin (ERC721, IERC721Receiver), Hardhat + Chai for testing

---

## Task 1: Create AuctionToken (FHERC20 for demo)

**Files:**
- Create: `packages/hardhat/contracts/AuctionToken.sol`

**Step 1: Create the FHERC20 token contract**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { FHERC20 } from "fhenix-confidential-contracts/contracts/FHERC20.sol";
import { FHE, euint64 } from "@fhenixprotocol/cofhe-contracts/FHE.sol";

/// @title AuctionToken
/// @notice A simple FHERC20 token for the sealed bid auction demo
contract AuctionToken is FHERC20 {
    constructor() FHERC20("Auction Token", "AUCT", 6) {}

    /// @notice Mint tokens to an address (for demo purposes)
    /// @param to The address to mint to
    /// @param amount The amount to mint (in 6 decimal precision)
    function mint(address to, uint64 amount) external {
        _mint(to, amount);
    }

    /// @notice Get the encrypted balance of an account
    /// @param account The account to query
    /// @return The encrypted balance
    function encryptedBalanceOf(address account) external view returns (euint64) {
        return _encBalances[account];
    }
}
```

**Step 2: Verify the contract compiles**

Run: `cd packages/hardhat && npx hardhat compile`
Expected: Compilation successful with no errors

**Step 3: Commit**

```bash
git add packages/hardhat/contracts/AuctionToken.sol
git commit -m "feat: add AuctionToken FHERC20 for demo"
```

---

## Task 2: Create AuctionNFT (ERC721 for demo)

**Files:**
- Create: `packages/hardhat/contracts/AuctionNFT.sol`

**Step 1: Create the ERC721 token contract**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721URIStorage } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/// @title AuctionNFT
/// @notice A simple ERC721 for the sealed bid auction demo
contract AuctionNFT is ERC721, ERC721URIStorage {
    uint256 private _nextTokenId;

    constructor() ERC721("Auction NFT", "ANFT") {}

    /// @notice Mint a new NFT
    /// @param to The address to mint to
    /// @param uri The token URI (metadata)
    /// @return tokenId The ID of the minted token
    function mint(address to, string memory uri) external returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _mint(to, tokenId);
        _setTokenURI(tokenId, uri);
    }

    // Required overrides
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
```

**Step 2: Verify the contract compiles**

Run: `cd packages/hardhat && npx hardhat compile`
Expected: Compilation successful with no errors

**Step 3: Commit**

```bash
git add packages/hardhat/contracts/AuctionNFT.sol
git commit -m "feat: add AuctionNFT ERC721 for demo"
```

---

## Task 3: Create SealedBidAuction contract - Data structures and events

**Files:**
- Create: `packages/hardhat/contracts/SealedBidAuction.sol`

**Step 1: Create contract with data structures, events, and errors**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { FHE, euint64, eaddress, InEuint64, ebool } from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import { FHERC20 } from "fhenix-confidential-contracts/contracts/FHERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// @title SealedBidAuction
/// @notice A sealed bid auction using FHE for bid privacy
contract SealedBidAuction is IERC721Receiver {
    // ============ Enums ============

    enum Status {
        Active,
        Ended,
        SettlementRequested,
        Settled,
        Cancelled
    }

    // ============ Structs ============

    struct Auction {
        address seller;
        address nftContract;
        uint256 tokenId;
        address fherc20Token;
        uint256 startTime;
        uint256 endTime;
        Status status;
        // Encrypted state
        euint64 highestBid;
        eaddress highestBidder;
        // Settlement results (after decryption)
        address decryptedWinner;
        uint64 decryptedAmount;
        // Tracking
        uint256 totalBids;
    }

    // ============ State Variables ============

    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => mapping(address => euint64)) public bidderDeposits;
    mapping(uint256 => mapping(address => bool)) public hasRefunded;
    mapping(uint256 => mapping(address => bool)) public hasBid;

    uint256 public nextAuctionId;

    // ============ Events ============

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address nftContract,
        uint256 tokenId,
        address fherc20Token,
        uint256 startTime,
        uint256 endTime
    );

    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 timestamp
    );

    event SettlementRequested(uint256 indexed auctionId);

    event AuctionSettled(
        uint256 indexed auctionId,
        address indexed winner,
        uint64 amount
    );

    event RefundClaimed(
        uint256 indexed auctionId,
        address indexed bidder
    );

    event AuctionCancelled(uint256 indexed auctionId);

    // ============ Errors ============

    error AuctionNotActive();
    error AuctionNotEnded();
    error AuctionAlreadySettled();
    error SettlementNotRequested();
    error DecryptionNotReady();
    error NotSeller();
    error NotBidder();
    error IsWinner();
    error AlreadyRefunded();
    error InvalidTimeRange();
    error NoBidsPlaced();
    error AlreadyBid();
    error AuctionNotSettled();

    // ============ ERC721 Receiver ============

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
```

**Step 2: Verify the contract compiles**

Run: `cd packages/hardhat && npx hardhat compile`
Expected: Compilation successful with no errors

**Step 3: Commit**

```bash
git add packages/hardhat/contracts/SealedBidAuction.sol
git commit -m "feat: add SealedBidAuction data structures and events"
```

---

## Task 4: Implement createAuction function

**Files:**
- Modify: `packages/hardhat/contracts/SealedBidAuction.sol`

**Step 1: Add createAuction function after the onERC721Received function**

Add this function to the contract:

```solidity
    // ============ Auction Creation ============

    /// @notice Create a new auction
    /// @param nftContract The ERC721 contract address
    /// @param tokenId The token ID to auction
    /// @param fherc20Token The FHERC20 token for payments
    /// @param startTime When bidding opens (unix timestamp)
    /// @param endTime When bidding closes (unix timestamp)
    /// @return auctionId The ID of the created auction
    function createAuction(
        address nftContract,
        uint256 tokenId,
        address fherc20Token,
        uint256 startTime,
        uint256 endTime
    ) external returns (uint256 auctionId) {
        if (endTime <= startTime) revert InvalidTimeRange();
        if (startTime < block.timestamp) revert InvalidTimeRange();

        // Transfer NFT to this contract
        IERC721(nftContract).safeTransferFrom(msg.sender, address(this), tokenId);

        auctionId = nextAuctionId++;

        Auction storage auction = auctions[auctionId];
        auction.seller = msg.sender;
        auction.nftContract = nftContract;
        auction.tokenId = tokenId;
        auction.fherc20Token = fherc20Token;
        auction.startTime = startTime;
        auction.endTime = endTime;
        auction.status = Status.Active;
        auction.highestBid = FHE.asEuint64(0);
        auction.highestBidder = FHE.asEaddress(address(0));

        emit AuctionCreated(
            auctionId,
            msg.sender,
            nftContract,
            tokenId,
            fherc20Token,
            startTime,
            endTime
        );
    }
```

**Step 2: Verify the contract compiles**

Run: `cd packages/hardhat && npx hardhat compile`
Expected: Compilation successful with no errors

**Step 3: Commit**

```bash
git add packages/hardhat/contracts/SealedBidAuction.sol
git commit -m "feat: implement createAuction function"
```

---

## Task 5: Implement bid function

**Files:**
- Modify: `packages/hardhat/contracts/SealedBidAuction.sol`

**Step 1: Add bid function after createAuction**

Add this function to the contract:

```solidity
    // ============ Bidding ============

    /// @notice Place an encrypted bid
    /// @dev Bidder must call fherc20.setOperator(auctionContract, until) before bidding
    /// @param auctionId The auction to bid on
    /// @param encryptedAmount The encrypted bid amount
    function bid(uint256 auctionId, InEuint64 calldata encryptedAmount) external {
        Auction storage auction = auctions[auctionId];

        if (auction.status != Status.Active) revert AuctionNotActive();
        if (block.timestamp < auction.startTime) revert AuctionNotActive();
        if (block.timestamp >= auction.endTime) revert AuctionNotEnded();
        if (hasBid[auctionId][msg.sender]) revert AlreadyBid();

        // Convert input to euint64
        euint64 bidAmount = FHE.asEuint64(encryptedAmount);

        // Transfer encrypted tokens from bidder to contract
        // Bidder must have set this contract as operator beforehand
        FHERC20(auction.fherc20Token).confidentialTransferFrom(
            msg.sender,
            address(this),
            bidAmount
        );

        // Store deposit for later refund
        bidderDeposits[auctionId][msg.sender] = bidAmount;
        hasBid[auctionId][msg.sender] = true;

        // Compare and update winner using FHE operations
        ebool isHigher = FHE.gt(bidAmount, auction.highestBid);
        auction.highestBid = FHE.select(isHigher, bidAmount, auction.highestBid);
        auction.highestBidder = FHE.select(
            isHigher,
            FHE.asEaddress(msg.sender),
            auction.highestBidder
        );

        // Update permissions for the encrypted values
        FHE.allowThis(auction.highestBid);
        FHE.allowThis(auction.highestBidder);

        auction.totalBids++;

        emit BidPlaced(auctionId, msg.sender, block.timestamp);
    }
```

**Step 2: Verify the contract compiles**

Run: `cd packages/hardhat && npx hardhat compile`
Expected: Compilation successful with no errors

**Step 3: Commit**

```bash
git add packages/hardhat/contracts/SealedBidAuction.sol
git commit -m "feat: implement bid function with FHE comparison"
```

---

## Task 6: Implement requestSettlement function

**Files:**
- Modify: `packages/hardhat/contracts/SealedBidAuction.sol`

**Step 1: Add requestSettlement function after bid**

Add this function to the contract:

```solidity
    // ============ Settlement ============

    /// @notice Request settlement - initiates async decryption
    /// @param auctionId The auction to settle
    function requestSettlement(uint256 auctionId) external {
        Auction storage auction = auctions[auctionId];

        if (auction.status != Status.Active) revert AuctionNotActive();
        if (block.timestamp < auction.endTime) revert AuctionNotEnded();
        if (auction.totalBids == 0) revert NoBidsPlaced();

        auction.status = Status.SettlementRequested;

        // Request decryption of winner address and amount
        // These are async operations on Fhenix
        FHE.decrypt(auction.highestBidder);
        FHE.decrypt(auction.highestBid);

        emit SettlementRequested(auctionId);
    }
```

**Step 2: Verify the contract compiles**

Run: `cd packages/hardhat && npx hardhat compile`
Expected: Compilation successful with no errors

**Step 3: Commit**

```bash
git add packages/hardhat/contracts/SealedBidAuction.sol
git commit -m "feat: implement requestSettlement with async decryption"
```

---

## Task 7: Implement finalizeSettlement function

**Files:**
- Modify: `packages/hardhat/contracts/SealedBidAuction.sol`

**Step 1: Add finalizeSettlement function after requestSettlement**

Add this function to the contract:

```solidity
    /// @notice Finalize settlement after decryption is complete
    /// @param auctionId The auction to finalize
    /// @param winner The decrypted winner address (from callback/oracle)
    /// @param amount The decrypted winning amount (from callback/oracle)
    function finalizeSettlement(
        uint256 auctionId,
        address winner,
        uint64 amount
    ) external {
        Auction storage auction = auctions[auctionId];

        if (auction.status != Status.SettlementRequested) revert SettlementNotRequested();

        // Store decrypted values
        auction.decryptedWinner = winner;
        auction.decryptedAmount = amount;

        // Transfer winner's deposit to seller (encrypted transfer)
        euint64 winningDeposit = bidderDeposits[auctionId][winner];
        FHERC20(auction.fherc20Token).confidentialTransfer(auction.seller, winningDeposit);

        // Transfer NFT to winner
        IERC721(auction.nftContract).safeTransferFrom(
            address(this),
            winner,
            auction.tokenId
        );

        auction.status = Status.Settled;

        emit AuctionSettled(auctionId, winner, amount);
    }
```

**Step 2: Verify the contract compiles**

Run: `cd packages/hardhat && npx hardhat compile`
Expected: Compilation successful with no errors

**Step 3: Commit**

```bash
git add packages/hardhat/contracts/SealedBidAuction.sol
git commit -m "feat: implement finalizeSettlement with transfers"
```

---

## Task 8: Implement claimRefund function

**Files:**
- Modify: `packages/hardhat/contracts/SealedBidAuction.sol`

**Step 1: Add claimRefund function after finalizeSettlement**

Add this function to the contract:

```solidity
    // ============ Refunds ============

    /// @notice Claim refund for a losing bid
    /// @param auctionId The auction to claim refund from
    function claimRefund(uint256 auctionId) external {
        Auction storage auction = auctions[auctionId];

        if (auction.status != Status.Settled && auction.status != Status.Cancelled) {
            revert AuctionNotSettled();
        }
        if (!hasBid[auctionId][msg.sender]) revert NotBidder();
        if (hasRefunded[auctionId][msg.sender]) revert AlreadyRefunded();

        // Winner cannot claim refund (their deposit went to seller)
        if (auction.status == Status.Settled && msg.sender == auction.decryptedWinner) {
            revert IsWinner();
        }

        hasRefunded[auctionId][msg.sender] = true;

        // Transfer encrypted deposit back to bidder
        euint64 deposit = bidderDeposits[auctionId][msg.sender];
        FHERC20(auction.fherc20Token).confidentialTransfer(msg.sender, deposit);

        emit RefundClaimed(auctionId, msg.sender);
    }
```

**Step 2: Verify the contract compiles**

Run: `cd packages/hardhat && npx hardhat compile`
Expected: Compilation successful with no errors

**Step 3: Commit**

```bash
git add packages/hardhat/contracts/SealedBidAuction.sol
git commit -m "feat: implement claimRefund for losing bidders"
```

---

## Task 9: Implement cancelAuction function

**Files:**
- Modify: `packages/hardhat/contracts/SealedBidAuction.sol`

**Step 1: Add cancelAuction function after claimRefund**

Add this function to the contract:

```solidity
    // ============ Cancellation ============

    /// @notice Cancel an auction (only seller, only if no bids)
    /// @param auctionId The auction to cancel
    function cancelAuction(uint256 auctionId) external {
        Auction storage auction = auctions[auctionId];

        if (msg.sender != auction.seller) revert NotSeller();
        if (auction.status != Status.Active) revert AuctionNotActive();
        if (auction.totalBids > 0) revert AuctionAlreadySettled();

        auction.status = Status.Cancelled;

        // Return NFT to seller
        IERC721(auction.nftContract).safeTransferFrom(
            address(this),
            auction.seller,
            auction.tokenId
        );

        emit AuctionCancelled(auctionId);
    }
```

**Step 2: Verify the contract compiles**

Run: `cd packages/hardhat && npx hardhat compile`
Expected: Compilation successful with no errors

**Step 3: Commit**

```bash
git add packages/hardhat/contracts/SealedBidAuction.sol
git commit -m "feat: implement cancelAuction for seller"
```

---

## Task 10: Add view functions

**Files:**
- Modify: `packages/hardhat/contracts/SealedBidAuction.sol`

**Step 1: Add view functions at the end of the contract**

Add these functions to the contract:

```solidity
    // ============ View Functions ============

    /// @notice Get auction details
    /// @param auctionId The auction to query
    /// @return seller The seller address
    /// @return nftContract The NFT contract address
    /// @return tokenId The token ID
    /// @return fherc20Token The payment token address
    /// @return startTime The auction start time
    /// @return endTime The auction end time
    /// @return status The auction status
    /// @return totalBids The total number of bids
    function getAuction(uint256 auctionId)
        external
        view
        returns (
            address seller,
            address nftContract,
            uint256 tokenId,
            address fherc20Token,
            uint256 startTime,
            uint256 endTime,
            Status status,
            uint256 totalBids
        )
    {
        Auction storage auction = auctions[auctionId];
        return (
            auction.seller,
            auction.nftContract,
            auction.tokenId,
            auction.fherc20Token,
            auction.startTime,
            auction.endTime,
            auction.status,
            auction.totalBids
        );
    }

    /// @notice Get settlement results (only available after settlement)
    /// @param auctionId The auction to query
    /// @return winner The winning bidder address
    /// @return amount The winning bid amount
    function getSettlementResult(uint256 auctionId)
        external
        view
        returns (address winner, uint64 amount)
    {
        Auction storage auction = auctions[auctionId];
        if (auction.status != Status.Settled) revert AuctionNotSettled();
        return (auction.decryptedWinner, auction.decryptedAmount);
    }

    /// @notice Check if an address has bid on an auction
    /// @param auctionId The auction to check
    /// @param bidder The bidder address
    /// @return True if the address has bid
    function hasBidOnAuction(uint256 auctionId, address bidder) external view returns (bool) {
        return hasBid[auctionId][bidder];
    }

    /// @notice Check if an address has claimed their refund
    /// @param auctionId The auction to check
    /// @param bidder The bidder address
    /// @return True if the address has claimed their refund
    function hasClaimedRefund(uint256 auctionId, address bidder) external view returns (bool) {
        return hasRefunded[auctionId][bidder];
    }
}
```

**Step 2: Verify the contract compiles**

Run: `cd packages/hardhat && npx hardhat compile`
Expected: Compilation successful with no errors

**Step 3: Commit**

```bash
git add packages/hardhat/contracts/SealedBidAuction.sol
git commit -m "feat: add view functions for auction queries"
```

---

## Task 11: Create deployment script

**Files:**
- Create: `packages/hardhat/deploy/01_deploy_auction.ts`

**Step 1: Create deployment script**

```typescript
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Deploy AuctionToken (FHERC20)
  const auctionToken = await deploy("AuctionToken", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });
  console.log("AuctionToken deployed to:", auctionToken.address);

  // Deploy AuctionNFT
  const auctionNFT = await deploy("AuctionNFT", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });
  console.log("AuctionNFT deployed to:", auctionNFT.address);

  // Deploy SealedBidAuction
  const sealedBidAuction = await deploy("SealedBidAuction", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });
  console.log("SealedBidAuction deployed to:", sealedBidAuction.address);
};

export default func;
func.tags = ["Auction"];
```

**Step 2: Test deployment compiles (dry run)**

Run: `cd packages/hardhat && npx hardhat compile`
Expected: Compilation successful with no errors

**Step 3: Commit**

```bash
git add packages/hardhat/deploy/01_deploy_auction.ts
git commit -m "feat: add deployment script for auction contracts"
```

---

## Task 12: Create comprehensive test suite

**Files:**
- Create: `packages/hardhat/test/helpers/setup.ts`
- Create: `packages/hardhat/test/AuctionToken.test.ts`
- Create: `packages/hardhat/test/AuctionNFT.test.ts`
- Create: `packages/hardhat/test/SealedBidAuction.test.ts`

**Step 1: Create test helpers directory and setup file**

```bash
mkdir -p packages/hardhat/test/helpers
```

```typescript
// packages/hardhat/test/helpers/setup.ts
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
```

**Step 2: Create AuctionToken tests**

```typescript
// packages/hardhat/test/AuctionToken.test.ts
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
```

**Step 3: Create AuctionNFT tests**

```typescript
// packages/hardhat/test/AuctionNFT.test.ts
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
```

**Step 4: Create SealedBidAuction tests**

```typescript
// packages/hardhat/test/SealedBidAuction.test.ts
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
```

**Step 5: Verify test files are created**

Run: `ls -la packages/hardhat/test/`
Expected: `helpers/`, `AuctionToken.test.ts`, `AuctionNFT.test.ts`, `SealedBidAuction.test.ts`

Run: `ls -la packages/hardhat/test/helpers/`
Expected: `setup.ts`

**Step 6: Run tests to verify they pass**

Run: `cd packages/hardhat && npx hardhat test`
Expected: All tests pass (FHE-dependent tests may be skipped/marked as pending)

**Step 7: Commit**

```bash
git add packages/hardhat/test/
git commit -m "test: add comprehensive test suite for all contracts"
```

---

## Task 13: Final compilation and verification

**Files:**
- All contracts in `packages/hardhat/contracts/`

**Step 1: Clean and recompile all contracts**

Run: `cd packages/hardhat && npx hardhat clean && npx hardhat compile`
Expected: All 3 contracts compile successfully

**Step 2: Verify all contracts are present**

Run: `ls packages/hardhat/contracts/`
Expected: `AuctionNFT.sol`, `AuctionToken.sol`, `SealedBidAuction.sol`

**Step 3: Run full test suite**

Run: `cd packages/hardhat && npx hardhat test`
Expected: All tests pass

**Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete sealed bid auction MVP with tests"
```

---

## Summary

This plan implements:

1. **AuctionToken.sol** - FHERC20 token for encrypted payments
2. **AuctionNFT.sol** - ERC721 for demo assets
3. **SealedBidAuction.sol** - Main auction contract with:
   - Multi-auction support via auction IDs
   - Encrypted bid submission using FHERC20
   - FHE comparison to track highest bid (eaddress for winner)
   - Two-step settlement (request decryption → finalize)
   - Refund system for losing bidders
   - Cancel function for sellers

**Frontend requirements for integration:**
- Bidders must call `fherc20.setOperator(auctionContract, futureTimestamp)` before bidding
- Use `cofhejs.encrypt([Encryptable.uint64(amount)])` to encrypt bid amounts
- Settlement requires an oracle/callback to provide decrypted winner and amount
