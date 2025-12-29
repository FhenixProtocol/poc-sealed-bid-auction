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
}
