import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployAuction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
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

  // Deploy AuctionNFT (ERC721)
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

  console.log("\n=== Deployment Summary ===");
  console.log("AuctionToken:", auctionToken.address);
  console.log("AuctionNFT:", auctionNFT.address);
  console.log("SealedBidAuction:", sealedBidAuction.address);
};

export default deployAuction;

deployAuction.tags = ["AuctionToken", "AuctionNFT", "SealedBidAuction"];
