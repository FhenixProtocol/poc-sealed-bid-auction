# Sealed Bid Auction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a PoC sealed bid auction system using FHE where bids are encrypted, and only the winner is revealed at settlement.

**Architecture:** Single contract managing multiple auctions via auction IDs. Bidders deposit FHERC20 tokens as encrypted bids. Two-step settlement: request decryption of winner (eaddress), then finalize transfers. Losers claim refunds of their encrypted deposits.

**Tech Stack:** Solidity 0.8.25, @fhenixprotocol/cofhe-contracts (FHE), fhenix-confidential-contracts (FHERC20), OpenZeppelin (ERC721, IERC721Receiver)

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

## Task 12: Final compilation and verification

**Files:**
- All contracts in `packages/hardhat/contracts/`

**Step 1: Clean and recompile all contracts**

Run: `cd packages/hardhat && npx hardhat clean && npx hardhat compile`
Expected: All 3 contracts compile successfully

**Step 2: Verify all contracts are present**

Run: `ls packages/hardhat/contracts/`
Expected: `AuctionNFT.sol`, `AuctionToken.sol`, `SealedBidAuction.sol`

**Step 3: Final commit**

```bash
git add .
git commit -m "feat: complete sealed bid auction MVP contracts"
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
