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
}
