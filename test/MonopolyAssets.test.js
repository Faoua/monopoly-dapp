const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MonopolyAssets", function () {
  it("creates an asset and mints it", async function () {
    const [owner, alice] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("MonopolyAssets");
    const assets = await Factory.deploy();

    await assets.createAsset("Gare du Nord", 1, 200, "QmCID123");

    const info = await assets.getAsset(1);
    expect(info.name).to.equal("Gare du Nord");
    expect(info.value).to.equal(200);

    await assets.mintTo(alice.address, 1, 1);
    expect(await assets.balanceOf(alice.address, 1)).to.equal(1);
  });

  it("sets lastTransferAt on mint", async function () {
    const [owner, alice] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("MonopolyAssets");
    const assets = await Factory.deploy();

    await assets.createAsset("Rue de la Paix", 0, 400, "QmCID999");

    const infoBefore = await assets.getAsset(1);
    expect(infoBefore.lastTransferAt).to.equal(0);

    await assets.mintTo(alice.address, 1, 1);

    const infoAfter = await assets.getAsset(1);
    expect(infoAfter.lastTransferAt).to.be.gt(0);
  });

  it("updates lastTransferAt on transfer", async function () {
    const [owner, alice, bob] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("MonopolyAssets");
    const assets = await Factory.deploy();

    await assets.createAsset("Avenue des Champs-Elysees", 0, 350, "QmCID777");
    await assets.mintTo(alice.address, 1, 1);

    // attendre lock 10 min (cooldown 5 min inclus)
    await ethers.provider.send("evm_increaseTime", [10 * 60]);
    await ethers.provider.send("evm_mine");

    const t1 = (await assets.getAsset(1)).lastTransferAt;

    await ethers.provider.send("evm_increaseTime", [2]);
    await ethers.provider.send("evm_mine");

    await assets.connect(alice).safeTransferFrom(alice.address, bob.address, 1, 1, "0x");

    const t2 = (await assets.getAsset(1)).lastTransferAt;
    expect(t2).to.be.gt(t1);
  });

  it("enforces cooldown between two transfers by same sender", async function () {
    const [owner, alice, bob, charlie] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("MonopolyAssets");
    const assets = await Factory.deploy();

    await assets.createAsset("Rue A", 0, 100, "Qm1");
    await assets.mintTo(alice.address, 1, 2);

    // attendre lock 10 min avant 1er transfert
    await ethers.provider.send("evm_increaseTime", [10 * 60]);
    await ethers.provider.send("evm_mine");

    await assets.connect(alice).safeTransferFrom(alice.address, bob.address, 1, 1, "0x");

    await expect(
      assets.connect(alice).safeTransferFrom(alice.address, charlie.address, 1, 1, "0x")
    ).to.be.revertedWith("Cooldown not passed");

    await ethers.provider.send("evm_increaseTime", [5 * 60]);
    await ethers.provider.send("evm_mine");

    await assets.connect(alice).safeTransferFrom(alice.address, charlie.address, 1, 1, "0x");
  });

  it("enforces cooldown on consecutive mints to same receiver", async function () {
    const [owner, alice] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("MonopolyAssets");
    const assets = await Factory.deploy();

    await assets.createAsset("Rue B", 0, 120, "Qm2");
    await assets.createAsset("Rue C", 0, 130, "Qm3");

    await assets.mintTo(alice.address, 1, 1);

    await expect(assets.mintTo(alice.address, 2, 1)).to.be.revertedWith("Cooldown not passed");

    await ethers.provider.send("evm_increaseTime", [5 * 60]);
    await ethers.provider.send("evm_mine");

    await assets.mintTo(alice.address, 2, 1);
  });

  it("blocks owning more than 4 unique resources", async function () {
    const [owner, alice] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("MonopolyAssets");
    const assets = await Factory.deploy();

    for (let i = 0; i < 5; i++) {
      await assets.createAsset(`Ressource ${i + 1}`, 0, 100 + i, `QmCID${i}`);
    }

    for (let id = 1; id <= 4; id++) {
      await assets.mintTo(alice.address, id, 1);
      await ethers.provider.send("evm_increaseTime", [5 * 60]);
      await ethers.provider.send("evm_mine");
    }

    await expect(assets.mintTo(alice.address, 5, 1)).to.be.revertedWith("Max resources reached");
  });

  it("allows receiving a new resource after transferring one away", async function () {
    const [owner, alice, bob] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("MonopolyAssets");
    const assets = await Factory.deploy();

    for (let i = 0; i < 5; i++) {
      await assets.createAsset(`Ressource ${i + 1}`, 0, 200 + i, `QmCIDx${i}`);
    }

    for (let id = 1; id <= 4; id++) {
      await assets.mintTo(alice.address, id, 1);
      await ethers.provider.send("evm_increaseTime", [5 * 60]);
      await ethers.provider.send("evm_mine");
    }

    // attendre lock 10 min sur token #1 acquis via mint
    await ethers.provider.send("evm_increaseTime", [10 * 60]);
    await ethers.provider.send("evm_mine");

    await assets.connect(alice).safeTransferFrom(alice.address, bob.address, 1, 1, "0x");

    // cooldown avant un nouveau mint vers Alice
    await ethers.provider.send("evm_increaseTime", [5 * 60]);
    await ethers.provider.send("evm_mine");

    await assets.mintTo(alice.address, 5, 1);
    expect(await assets.uniqueOwnedCount(alice.address)).to.equal(4);
  });

  it("locks a token for 10 minutes after receiving it", async function () {
    const [owner, alice, bob] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("MonopolyAssets");
    const assets = await Factory.deploy();

    await assets.createAsset("Rue Lock", 0, 300, "QmLOCK");
    await assets.mintTo(alice.address, 1, 1);

    // cooldown OK mais lock pas OK
    await ethers.provider.send("evm_increaseTime", [5 * 60]);
    await ethers.provider.send("evm_mine");

    await expect(
      assets.connect(alice).safeTransferFrom(alice.address, bob.address, 1, 1, "0x")
    ).to.be.revertedWith("Token is locked");

    await ethers.provider.send("evm_increaseTime", [5 * 60]);
    await ethers.provider.send("evm_mine");

    await assets.connect(alice).safeTransferFrom(alice.address, bob.address, 1, 1, "0x");
  });

  it("locks again after a user receives a transfer", async function () {
    const [owner, alice, bob, charlie] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("MonopolyAssets");
    const assets = await Factory.deploy();

    await assets.createAsset("Rue Transfer Lock", 0, 310, "QmLOCK2");
    await assets.mintTo(alice.address, 1, 1);

    await ethers.provider.send("evm_increaseTime", [10 * 60]);
    await ethers.provider.send("evm_mine");

    await assets.connect(alice).safeTransferFrom(alice.address, bob.address, 1, 1, "0x");

    await expect(
      assets.connect(bob).safeTransferFrom(bob.address, charlie.address, 1, 1, "0x")
    ).to.be.revertedWith("Token is locked");

    await ethers.provider.send("evm_increaseTime", [10 * 60]);
    await ethers.provider.send("evm_mine");

    await assets.connect(bob).safeTransferFrom(bob.address, charlie.address, 1, 1, "0x");
  });

  it("tracks previous owners on transfers (not on mint)", async function () {
    const [owner, alice, bob, charlie] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("MonopolyAssets");
    const assets = await Factory.deploy();

    await assets.createAsset("Rue Owners", 0, 500, "QmOWNERS");
    await assets.mintTo(alice.address, 1, 1);

    let owners = await assets.getPreviousOwners(1);
    expect(owners.length).to.equal(0);

    await ethers.provider.send("evm_increaseTime", [10 * 60]);
    await ethers.provider.send("evm_mine");

    await assets.connect(alice).safeTransferFrom(alice.address, bob.address, 1, 1, "0x");

    owners = await assets.getPreviousOwners(1);
    expect(owners.length).to.equal(1);
    expect(owners[0]).to.equal(alice.address);

    await ethers.provider.send("evm_increaseTime", [10 * 60]);
    await ethers.provider.send("evm_mine");

    await assets.connect(bob).safeTransferFrom(bob.address, charlie.address, 1, 1, "0x");

    owners = await assets.getPreviousOwners(1);
    expect(owners.length).to.equal(2);
    expect(owners[0]).to.equal(alice.address);
    expect(owners[1]).to.equal(bob.address);
  });

  // ------------------- TRADE TESTS -------------------

  it("executes a fair trade when both approved", async function () {
    const [owner, alice, bob] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("MonopolyAssets");
    const assets = await Factory.deploy();

    // id1 value=100, id2 value=200
    await assets.createAsset("Prop 1", 0, 100, "Qm1");
    await assets.createAsset("Prop 2", 0, 200, "Qm2");

    // mint: alice a 2x id1 (=200), bob a 1x id2 (=200)
    await assets.mintTo(alice.address, 1, 2);

    // respecter cooldown entre mints vers bob
    await ethers.provider.send("evm_increaseTime", [5 * 60]);
    await ethers.provider.send("evm_mine");

    await assets.mintTo(bob.address, 2, 1);

    // approvals (contrat opérateur)
    await assets.connect(alice).setApprovalForAll(await assets.getAddress(), true);
    await assets.connect(bob).setApprovalForAll(await assets.getAddress(), true);

    // attendre lock 10 min sur les tokens reçus via mint (pour que le transfert soit autorisé)
    await ethers.provider.send("evm_increaseTime", [10 * 60]);
    await ethers.provider.send("evm_mine");

    // Trade: alice donne 2x id1, bob donne 1x id2
    await assets.connect(alice).trade(bob.address, 1, 2, 2, 1);

    expect(await assets.balanceOf(alice.address, 1)).to.equal(0);
    expect(await assets.balanceOf(alice.address, 2)).to.equal(1);

    expect(await assets.balanceOf(bob.address, 2)).to.equal(0);
    expect(await assets.balanceOf(bob.address, 1)).to.equal(2);
  });

  it("reverts trade if not fair (value mismatch)", async function () {
    const [owner, alice, bob] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("MonopolyAssets");
    const assets = await Factory.deploy();

    await assets.createAsset("A", 0, 100, "QmA"); // id1
    await assets.createAsset("B", 0, 200, "QmB"); // id2

    await assets.mintTo(alice.address, 1, 1);

    await ethers.provider.send("evm_increaseTime", [5 * 60]);
    await ethers.provider.send("evm_mine");

    await assets.mintTo(bob.address, 2, 1);

    await assets.connect(alice).setApprovalForAll(await assets.getAddress(), true);
    await assets.connect(bob).setApprovalForAll(await assets.getAddress(), true);

    await ethers.provider.send("evm_increaseTime", [10 * 60]);
    await ethers.provider.send("evm_mine");

    // alice donne 1x100, bob donne 1x200 => pas fair
    await expect(
      assets.connect(alice).trade(bob.address, 1, 1, 2, 1)
    ).to.be.revertedWith("Trade not fair");
  });

  it("reverts trade if one party didn't approve the contract", async function () {
    const [owner, alice, bob] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("MonopolyAssets");
    const assets = await Factory.deploy();

    await assets.createAsset("A", 0, 100, "QmA"); // id1
    await assets.createAsset("B", 0, 100, "QmB"); // id2

    await assets.mintTo(alice.address, 1, 1);

    await ethers.provider.send("evm_increaseTime", [5 * 60]);
    await ethers.provider.send("evm_mine");

    await assets.mintTo(bob.address, 2, 1);

    // Alice approuve, Bob non
    await assets.connect(alice).setApprovalForAll(await assets.getAddress(), true);

    await ethers.provider.send("evm_increaseTime", [10 * 60]);
    await ethers.provider.send("evm_mine");

    await expect(
      assets.connect(alice).trade(bob.address, 1, 1, 2, 1)
    ).to.be.revertedWith("Counterparty not approved");
  });
});

it("stores and retrieves IPFS hash correctly", async function () {
  const [owner] = await ethers.getSigners();

  const Factory = await ethers.getContractFactory("MonopolyAssets");
  const assets = await Factory.deploy();

  const cid = "QmTESTCIDIPFS123456";

  await assets.createAsset("IPFS Test Asset", 0, 150, cid);

  const asset = await assets.getAsset(1);

  expect(asset.ipfsHash).to.equal(cid);
});
