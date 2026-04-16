// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {
    FHE,
    euint64,
    eaddress,
    InEuint64,
    ebool
} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {FHERC20} from "fhenix-confidential-contracts/contracts/FHERC20/FHERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {
    IERC721Receiver
} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

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
        string name;
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
        // Ciphertext hashes captured at settlement request time — used by frontend
        bytes32 highestBidCtHash;
        bytes32 highestBidderCtHash;
        // Tracking
        uint256 totalBids;
    }

    /// @notice View struct for returning auction details (avoids stack too deep)
    struct AuctionView {
        string name;
        address seller;
        address nftContract;
        uint256 tokenId;
        address fherc20Token;
        uint256 startTime;
        uint256 endTime;
        Status status;
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
        string name,
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

    event SettlementRequested(
        uint256 indexed auctionId,
        bytes32 highestBidderCtHash,
        bytes32 highestBidCtHash
    );

    event AuctionSettled(
        uint256 indexed auctionId,
        address indexed winner,
        uint64 amount
    );

    event RefundClaimed(uint256 indexed auctionId, address indexed bidder);

    event AuctionCancelled(uint256 indexed auctionId);

    // ============ Errors ============

    error AuctionNotActive();
    error AuctionNotEnded();
    error AuctionAlreadySettled();
    error SettlementNotRequested();
    error NotSeller();
    error NotBidder();
    error IsWinner();
    error AlreadyRefunded();
    error InvalidTimeRange();
    error NoBidsPlaced();
    error AlreadyBid();
    error AuctionNotSettled();
    error NameRequired();
    error NameTooLong();
    error InvalidDecryptionProof();

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
    /// @param name The auction name (max 32 characters)
    /// @param nftContract The ERC721 contract address
    /// @param tokenId The token ID to auction
    /// @param fherc20Token The FHERC20 token for payments
    /// @param startTime When bidding opens (unix timestamp)
    /// @param endTime When bidding closes (unix timestamp)
    /// @return auctionId The ID of the created auction
    function createAuction(
        string calldata name,
        address nftContract,
        uint256 tokenId,
        address fherc20Token,
        uint256 startTime,
        uint256 endTime
    ) external returns (uint256 auctionId) {
        if (bytes(name).length == 0) revert NameRequired();
        if (bytes(name).length > 32) revert NameTooLong();
        if (endTime <= startTime) revert InvalidTimeRange();
        if (startTime < block.timestamp) revert InvalidTimeRange();

        // Transfer NFT to this contract
        IERC721(nftContract).safeTransferFrom(
            msg.sender,
            address(this),
            tokenId
        );

        auctionId = nextAuctionId++;

        Auction storage auction = auctions[auctionId];
        auction.name = name;
        auction.seller = msg.sender;
        auction.nftContract = nftContract;
        auction.tokenId = tokenId;
        auction.fherc20Token = fherc20Token;
        auction.startTime = startTime;
        auction.endTime = endTime;
        auction.status = Status.Active;
        auction.highestBid = FHE.asEuint64(0);
        auction.highestBidder = FHE.asEaddress(address(0));

        // Grant this contract ACL permission on the initial encrypted values
        FHE.allowThis(auction.highestBid);
        FHE.allowThis(auction.highestBidder);

        emit AuctionCreated(
            auctionId,
            msg.sender,
            name,
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
    function bid(
        uint256 auctionId,
        InEuint64 calldata encryptedAmount
    ) external {
        Auction storage auction = auctions[auctionId];

        if (auction.status != Status.Active) revert AuctionNotActive();
        if (block.timestamp < auction.startTime) revert AuctionNotActive();
        if (block.timestamp >= auction.endTime) revert AuctionNotEnded();
        if (hasBid[auctionId][msg.sender]) revert AlreadyBid();

        // Convert input to euint64
        euint64 bidAmount = FHE.asEuint64(encryptedAmount);

        // Grant the token ACL permission on the bid amount
        // This is required for the token's _update function to compare against the bidder's balance
        FHE.allow(bidAmount, auction.fherc20Token);

        // Transfer encrypted tokens from bidder to contract
        // Bidder must have set this contract as operator beforehand
        // The returned 'transferred' value has ACL permission for this contract (msg.sender in token context)
        euint64 transferred = FHERC20(auction.fherc20Token)
            .confidentialTransferFrom(msg.sender, address(this), bidAmount);

        // Store deposit for later refund (use the transferred value which has proper ACL)
        bidderDeposits[auctionId][msg.sender] = transferred;
        hasBid[auctionId][msg.sender] = true;

        // Persist ACL for this contract so we can use `transferred` in future transactions
        FHE.allowThis(transferred);
        // Grant the bidder ACL permission to view their own bid amount
        FHE.allow(transferred, msg.sender);

        // Compare and update winner using FHE operations
        // Use 'transferred' which has ACL permission for this contract
        ebool isHigher = FHE.gt(transferred, auction.highestBid);
        auction.highestBid = FHE.select(
            isHigher,
            transferred,
            auction.highestBid
        );
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

    /// @notice Request settlement — marks the encrypted winner/amount for off-chain
    /// decryption via the Threshold Network. Anyone can then call
    /// {finalizeSettlement} with the decrypted values + proofs.
    /// @param auctionId The auction to settle
    function requestSettlement(uint256 auctionId) external {
        Auction storage auction = auctions[auctionId];

        if (auction.status != Status.Active) revert AuctionNotActive();
        if (block.timestamp < auction.endTime) revert AuctionNotEnded();
        if (auction.totalBids == 0) revert NoBidsPlaced();

        auction.status = Status.SettlementRequested;

        // Mark encrypted values for public (client-side) decryption via Threshold Network.
        FHE.allowPublic(auction.highestBidder);
        FHE.allowPublic(auction.highestBid);

        // Capture ctHashes so the frontend can feed them to `decryptForTx` even
        // after refreshing the page between request and finalize.
        bytes32 bidderCt = eaddress.unwrap(auction.highestBidder);
        bytes32 amountCt = euint64.unwrap(auction.highestBid);
        auction.highestBidderCtHash = bidderCt;
        auction.highestBidCtHash = amountCt;

        emit SettlementRequested(auctionId, bidderCt, amountCt);
    }

    /// @notice Finalize settlement with client-provided decrypted values + proofs
    /// @param auctionId The auction to finalize
    /// @param winner The decrypted winner address
    /// @param amount The decrypted winning bid amount
    /// @param winnerProof Threshold Network signature over (highestBidderCtHash, winner)
    /// @param amountProof Threshold Network signature over (highestBidCtHash, amount)
    function finalizeSettlement(
        uint256 auctionId,
        address winner,
        uint64 amount,
        bytes calldata winnerProof,
        bytes calldata amountProof
    ) external {
        Auction storage auction = auctions[auctionId];

        if (auction.status != Status.SettlementRequested)
            revert SettlementNotRequested();

        // Verify the Threshold Network proofs — reverts on invalid proofs
        if (!FHE.verifyDecryptResult(auction.highestBidder, winner, winnerProof))
            revert InvalidDecryptionProof();
        if (!FHE.verifyDecryptResult(auction.highestBid, amount, amountProof))
            revert InvalidDecryptionProof();

        // Store decrypted values
        auction.decryptedWinner = winner;
        auction.decryptedAmount = amount;

        // Transfer winner's deposit to seller (encrypted transfer)
        euint64 winningDeposit = bidderDeposits[auctionId][winner];
        // Grant the token ACL permission on the deposit amount
        FHE.allow(winningDeposit, auction.fherc20Token);
        FHERC20(auction.fherc20Token).confidentialTransfer(
            auction.seller,
            winningDeposit
        );

        // Transfer NFT to winner
        IERC721(auction.nftContract).safeTransferFrom(
            address(this),
            winner,
            auction.tokenId
        );

        auction.status = Status.Settled;

        emit AuctionSettled(auctionId, winner, amount);
    }

    // ============ Refunds ============

    /// @notice Claim refund for a losing bid
    /// @param auctionId The auction to claim refund from
    function claimRefund(uint256 auctionId) external {
        Auction storage auction = auctions[auctionId];

        if (
            auction.status != Status.Settled &&
            auction.status != Status.Cancelled
        ) {
            revert AuctionNotSettled();
        }
        if (!hasBid[auctionId][msg.sender]) revert NotBidder();
        if (hasRefunded[auctionId][msg.sender]) revert AlreadyRefunded();

        // Winner cannot claim refund (their deposit went to seller)
        if (
            auction.status == Status.Settled &&
            msg.sender == auction.decryptedWinner
        ) {
            revert IsWinner();
        }

        hasRefunded[auctionId][msg.sender] = true;

        // Transfer encrypted deposit back to bidder
        euint64 deposit = bidderDeposits[auctionId][msg.sender];
        // Grant the token ACL permission on the deposit amount
        FHE.allow(deposit, auction.fherc20Token);
        FHERC20(auction.fherc20Token).confidentialTransfer(msg.sender, deposit);

        emit RefundClaimed(auctionId, msg.sender);
    }

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

    // ============ View Functions ============

    /// @notice Get auction details
    /// @param auctionId The auction to query
    /// @return auctionView The auction details as a struct
    function getAuction(
        uint256 auctionId
    ) external view returns (AuctionView memory auctionView) {
        Auction storage auction = auctions[auctionId];
        return AuctionView({
            name: auction.name,
            seller: auction.seller,
            nftContract: auction.nftContract,
            tokenId: auction.tokenId,
            fherc20Token: auction.fherc20Token,
            startTime: auction.startTime,
            endTime: auction.endTime,
            status: auction.status,
            totalBids: auction.totalBids
        });
    }

    /// @notice Get settlement results (only available after settlement)
    /// @param auctionId The auction to query
    /// @return winner The winning bidder address
    /// @return amount The winning bid amount
    function getSettlementResult(
        uint256 auctionId
    ) external view returns (address winner, uint64 amount) {
        Auction storage auction = auctions[auctionId];
        if (auction.status != Status.Settled) revert AuctionNotSettled();
        return (auction.decryptedWinner, auction.decryptedAmount);
    }

    /// @notice Check if an address has bid on an auction
    /// @param auctionId The auction to check
    /// @param bidder The bidder address
    /// @return True if the address has bid
    function hasBidOnAuction(
        uint256 auctionId,
        address bidder
    ) external view returns (bool) {
        return hasBid[auctionId][bidder];
    }

    /// @notice Check if an address has claimed their refund
    /// @param auctionId The auction to check
    /// @param bidder The bidder address
    /// @return True if the address has claimed their refund
    function hasClaimedRefund(
        uint256 auctionId,
        address bidder
    ) external view returns (bool) {
        return hasRefunded[auctionId][bidder];
    }

    /// @notice Get the ciphertext hashes captured when settlement was requested.
    /// Frontend uses these to call `decryptForTx()` off-chain before finalizing.
    /// @param auctionId The auction to query
    /// @return bidderCt The ctHash of the encrypted winner address
    /// @return amountCt The ctHash of the encrypted winning amount
    function getSettlementCtHashes(
        uint256 auctionId
    ) external view returns (bytes32 bidderCt, bytes32 amountCt) {
        Auction storage auction = auctions[auctionId];
        if (
            auction.status != Status.SettlementRequested &&
            auction.status != Status.Settled
        ) {
            revert SettlementNotRequested();
        }
        return (auction.highestBidderCtHash, auction.highestBidCtHash);
    }

    /// @notice Get the encrypted bid deposit for a bidder
    /// @dev The bidder can unseal this value using their permit
    /// @param auctionId The auction to query
    /// @param bidder The bidder address
    /// @return deposit The encrypted bid amount (ciphertext hash)
    function getBidderDeposit(
        uint256 auctionId,
        address bidder
    ) external view returns (euint64 deposit) {
        return bidderDeposits[auctionId][bidder];
    }
}
