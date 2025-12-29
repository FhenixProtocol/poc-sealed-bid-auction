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
