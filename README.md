# Sealed Bid Auction with FHE

A privacy-preserving sealed bid auction system built on [Fhenix](https://fhenix.io) using Fully Homomorphic Encryption (FHE). Bids remain encrypted throughout the entire auction lifecycle, ensuring complete bid privacy until settlement.

## Features

- **Encrypted Bids**: All bids are encrypted using FHE - no one (including the contract owner) can see bid amounts until the auction ends
- **Privacy-Preserving Comparison**: Winner determination happens entirely on encrypted data using homomorphic operations
- **2-Step Settlement**: Asynchronous decryption flow (request settlement -> finalize when ready)
- **Bid Reveal**: Bidders can view their own encrypted bid amount using their personal permit
- **FHERC20 Payments**: Uses confidential ERC20 tokens for encrypted payments
- **NFT Auctions**: Supports ERC721 NFT auctions with automatic escrow

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Frontend (Next.js)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │   Wallet    │  │   cofhejs   │  │    wagmi    │  │  Rainbow   │ │
│  │  Connect    │  │ (FHE client)│  │   (hooks)   │  │    Kit     │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Smart Contracts                              │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ SealedBidAuction│  │  AuctionNFT  │  │    AuctionToken        │ │
│  │   (FHE Logic)   │  │   (ERC721)   │  │      (FHERC20)         │ │
│  └─────────────────┘  └──────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Fhenix Network (CoFHE)                          │
│         Handles FHE operations, decryption, and key management      │
└─────────────────────────────────────────────────────────────────────┘
```

## Auction Lifecycle

1. **Create Auction**: Seller deposits NFT and sets auction parameters
2. **Bidding Phase**: Bidders place encrypted bids (each bid is a confidential FHERC20 transfer)
3. **End Auction**: Bidding closes at the specified end time
4. **Request Settlement**: Anyone can trigger async decryption of the winner
5. **Finalize Settlement**: Once decryption is ready, transfer NFT to winner and funds to seller
6. **Claim Refunds**: Losing bidders can claim their encrypted deposits back

## Tech Stack

| Layer | Technology |
|-------|------------|
| Smart Contracts | Solidity 0.8.25, Hardhat, `@fhenixprotocol/cofhe-contracts` |
| FHE Client | `cofhejs` |
| Frontend | Next.js 14, React 18, TypeScript |
| Web3 | wagmi, viem, RainbowKit |
| Styling | Tailwind CSS, DaisyUI |
| Package Manager | pnpm (monorepo) |

## Project Structure

```
sealed-bid-auction/
├── packages/
│   ├── hardhat/              # Smart contracts
│   │   ├── contracts/
│   │   │   ├── SealedBidAuction.sol   # Main auction contract
│   │   │   ├── AuctionNFT.sol         # ERC721 for testing
│   │   │   └── AuctionToken.sol       # FHERC20 payment token
│   │   ├── test/                       # Contract tests
│   │   └── deploy/                     # Deployment scripts
│   │
│   └── nextjs/               # Frontend application
│       ├── app/              # Next.js app router
│       ├── components/       # React components
│       │   └── auction/      # Auction-specific components
│       ├── hooks/            # Custom React hooks
│       └── utils/            # Utilities and ABIs
```

## Getting Started

### Prerequisites

- Node.js >= 20.18.3
- pnpm 9.x

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd sealed-bid-auction

# Install dependencies
pnpm install
```

### Local Development

```bash
# Start the local Hardhat chain with CoFHE mocks
pnpm chain

# In another terminal, deploy contracts
pnpm deploy

# Start the frontend
pnpm start
```

The frontend will be available at [http://localhost:3000](http://localhost:3000).

### Running Tests

```bash
# Run all contract tests
pnpm test

# Run tests with verbose output
pnpm hardhat:test
```

## Available Scripts

### Root Level

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start both frontend and hardhat chain concurrently |
| `pnpm start` | Start the frontend development server |
| `pnpm chain` | Start the local Hardhat network |
| `pnpm deploy` | Deploy contracts to the local network |
| `pnpm test` | Run contract tests |
| `pnpm compile` | Compile smart contracts |

### Frontend (packages/nextjs)

| Command | Description |
|---------|-------------|
| `pnpm next:dev` | Start Next.js dev server |
| `pnpm next:build` | Build for production |
| `pnpm next:lint` | Run ESLint |
| `pnpm next:check-types` | TypeScript type checking |

### Contracts (packages/hardhat)

| Command | Description |
|---------|-------------|
| `pnpm hardhat:test` | Run Hardhat tests |
| `pnpm hardhat:format` | Format Solidity files |
| `pnpm hardhat:lint` | Lint contracts |

## Contracts

### SealedBidAuction

The main auction contract that handles:
- Auction creation with NFT escrow
- Encrypted bid placement using FHERC20 tokens
- FHE comparison for winner determination
- 2-step async settlement (request -> finalize)
- Refund claims for losing bidders

Key functions:
- `createAuction(nftContract, tokenId, fherc20Token, startTime, endTime)`
- `bid(auctionId, encryptedAmount)` - Place an encrypted bid
- `requestSettlement(auctionId)` - Trigger async decryption
- `finalizeSettlement(auctionId)` - Complete settlement after decryption
- `claimRefund(auctionId)` - Claim refund for losing bid
- `getBidderDeposit(auctionId, bidder)` - Get encrypted bid amount (for unsealing)

### AuctionToken (FHERC20)

A confidential ERC20 token that supports:
- Public balance (`balanceOf`) and confidential balance (`confidentialBalanceOf`)
- `shield()` - Convert public tokens to encrypted
- `unshield()` - Convert encrypted tokens to public (async)
- `confidentialTransfer()` - Transfer encrypted tokens
- `setOperator()` - Authorize contracts to transfer on your behalf

### AuctionNFT (ERC721)

A simple ERC721 for testing auctions:
- `mint(to, uri)` - Mint new NFTs
- Standard ERC721 functions

## How FHE Works in This Project

### Encrypted Bidding

1. Bidder sets the auction contract as an operator on their FHERC20 tokens
2. Bidder encrypts their bid amount using `cofhejs.encrypt()`
3. Contract transfers encrypted tokens from bidder
4. Contract compares encrypted bids homomorphically (`FHE.gt()`)
5. Winner is tracked as encrypted address (`eaddress`)

### Settlement Flow

1. Anyone calls `requestSettlement()` after auction ends
2. Contract calls `FHE.decrypt()` on winner address and amount
3. Decryption happens asynchronously on Fhenix network
4. Once ready, `finalizeSettlement()` retrieves decrypted values
5. NFT transfers to winner, funds transfer to seller

### Viewing Your Bid

Bidders can view their own encrypted bid:
1. Contract grants ACL permission to bidder on their deposit
2. Frontend fetches the encrypted ciphertext hash via `getBidderDeposit()`
3. Bidder calls `cofhejs.unseal()` with their permit to decrypt

## Environment Variables

### Frontend (packages/nextjs/.env.local)

```env
NEXT_PUBLIC_AUCTION_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_TOKEN_CONTRACT_ADDRESS=0x...
```

### Contracts (packages/hardhat/.env)

```env
DEPLOYER_PRIVATE_KEY=0x...
```

## Network Configuration

The project supports:
- **Local**: Hardhat network with CoFHE mocks
- **Testnet**: Arbitrum Sepolia (arb-sepolia)

## Contributing

Contributions are welcome! Please read the documentation in the `/ai` folder for FHE development patterns and best practices.

## License

MIT