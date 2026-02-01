const { ethers } = require("hardhat");

async function main() {
  const CONTRACT = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
  const assets = await ethers.getContractAt("MonopolyAssets", CONTRACT);

  const list = [
    {
      name: "Gare du Nord",
      type: 1, // STATION
      value: 200,
      ipfs: "ipfs://bafkreicb7qzk4fhzticsj6fec6wr5tfo7rc4wpsoseqk4jrpby7nw57pyy",
    },
    {
      name: "Gare de Lyon",
      type: 1, // STATION
      value: 200,
      ipfs: "ipfs://bafkreiflbn2hqi4ckppqt7lep5btispnjpba7xesg5ki3dzvwrmquwgmjm",
    },
  ];

  console.log("Seeding assets...");

  for (const a of list) {
    const tx = await assets.createAsset(a.name, a.type, a.value, a.ipfs);
    await tx.wait();
    console.log(`✅ Créé: ${a.name}`);
  }

  console.log("🎉 Seed terminé !");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});