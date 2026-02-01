const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("MonopolyAssetsModule", (m) => {
  const monopolyAssets = m.contract("MonopolyAssets");

  return { monopolyAssets };
});
