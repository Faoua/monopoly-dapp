const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MonopolyAssets", function () {
  async function deploy() {
    const [owner, alice, bob, charlie] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("MonopolyAssets");
    const c = await Factory.deploy();
    return { c, owner, alice, bob, charlie };
  }

  it("creates assets and getNextTokenId increases", async function () {
    const { c } = await deploy();

    expect(await c.getNextTokenId()).to.equal(1n);

    await c.createAsset("Gare du Nord", 1, 200, "ipfs://CID1");
    expect(await c.getNextTokenId()).to.equal(2n);

    await c.createAsset("Gare de Lyon", 1, 200, "ipfs://CID2");
    expect(await c.getNextTokenId()).to.equal(3n);
  });

  it("stores and retrieves IPFS hash correctly", async function () {
    const { c } = await deploy();

    const cid = "ipfs://bafk-test";
    await c.createAsset("IPFS Test Asset", 0, 150, cid);

    const asset = await c.getAsset(1);
    expect(asset.ipfsHash).to.equal(cid);
  });

  it("buyAsset mints to buyer when payment is correct", async function () {
    const { c, alice } = await deploy();

    await c.createAsset("Rue de la Paix", 0, 200, "ipfs://CID");

    await expect(
      c.connect(alice).buyAsset(1, { value: 200 })
    ).to.not.be.reverted;

    expect(await c.balanceOf(alice.address, 1)).to.equal(1n);
  });

  it("buyAsset reverts if incorrect payment", async function () {
    const { c, alice } = await deploy();

    await c.createAsset("A", 0, 200, "ipfs://CID");

    await expect(
      c.connect(alice).buyAsset(1, { value: 199 })
    ).to.be.revertedWith("Incorrect payment");
  });

  it("sets lastTransferAt on mint/buy", async function () {
    const { c, alice } = await deploy();

    await c.createAsset("Rue X", 0, 200, "ipfs://CID");

    const before = await c.getAsset(1);
    expect(before.lastTransferAt).to.equal(0n);

    await c.connect(alice).buyAsset(1, { value: 200 });

    const after = await c.getAsset(1);
    expect(after.lastTransferAt).to.be.gt(0n);
  });

  it("updates lastTransferAt on transfer", async function () {
    const { c, alice, bob } = await deploy();

    await c.createAsset("Rue Y", 0, 200, "ipfs://CID");
    await c.connect(alice).buyAsset(1, { value: 200 });

    // attendre lock 10 min (cooldown inclus)
    await ethers.provider.send("evm_increaseTime", [10 * 60]);
    await ethers.provider.send("evm_mine");

    const t1 = (await c.getAsset(1)).lastTransferAt;

    await ethers.provider.send("evm_increaseTime", [2]);
    await ethers.provider.send("evm_mine");

    await c.connect(alice).safeTransferFrom(alice.address, bob.address, 1, 1, "0x");

    const t2 = (await c.getAsset(1)).lastTransferAt;
    expect(t2).to.be.gt(t1);
  });

  it("enforces cooldown between two transfers by same sender", async function () {
    const { c, alice, bob, charlie } = await deploy();

    await c.createAsset("Rue A", 0, 200, "ipfs://CID");
    await c.connect(alice).buyAsset(1, { value: 200 });

    await ethers.provider.send("evm_increaseTime", [10 * 60]);
    await ethers.provider.send("evm_mine");

    await c.connect(alice).safeTransferFrom(alice.address, bob.address, 1, 1, "0x");

    await expect(
      c.connect(alice).safeTransferFrom(alice.address, charlie.address, 1, 1, "0x")
    ).to.be.revertedWith("Cooldown not passed");

    await ethers.provider.send("evm_increaseTime", [5 * 60]);
    await ethers.provider.send("evm_mine");

    await c.connect(alice).safeTransferFrom(alice.address, charlie.address, 1, 1, "0x");
  });

  it("locks a token for 10 minutes after receiving it", async function () {
    const { c, alice, bob } = await deploy();

    await c.createAsset("Rue Lock", 0, 200, "ipfs://CID");
    await c.connect(alice).buyAsset(1, { value: 200 });

    // cooldown OK (5 min) mais lock pas OK
    await ethers.provider.send("evm_increaseTime", [5 * 60]);
    await ethers.provider.send("evm_mine");

    await expect(
      c.connect(alice).safeTransferFrom(alice.address, bob.address, 1, 1, "0x")
    ).to.be.revertedWith("Token is locked");

    await ethers.provider.send("evm_increaseTime", [5 * 60]);
    await ethers.provider.send("evm_mine");

    await c.connect(alice).safeTransferFrom(alice.address, bob.address, 1, 1, "0x");
  });

  it("blocks owning more than 4 unique resources", async function () {
    const { c, alice } = await deploy();

    for (let i = 0; i < 5; i++) {
      await c.createAsset(`R${i + 1}`, 0, 200, `ipfs://CID${i}`);
    }

    // acheter 4 ressources uniques
    for (let id = 1; id <= 4; id++) {
      await c.connect(alice).buyAsset(id, { value: 200 });
      await ethers.provider.send("evm_increaseTime", [5 * 60]);
      await ethers.provider.send("evm_mine");
    }

    // la 5e doit échouer
    await expect(
      c.connect(alice).buyAsset(5, { value: 200 })
    ).to.be.revertedWith("Max resources reached");
  });

  it("allows receiving a new resource after transferring one away", async function () {
    const { c, alice, bob } = await deploy();

    for (let i = 0; i < 5; i++) {
      await c.createAsset(`R${i + 1}`, 0, 200, `ipfs://CID${i}`);
    }

    for (let id = 1; id <= 4; id++) {
      await c.connect(alice).buyAsset(id, { value: 200 });
      await ethers.provider.send("evm_increaseTime", [5 * 60]);
      await ethers.provider.send("evm_mine");
    }

    // attendre lock 10 min sur token #1
    await ethers.provider.send("evm_increaseTime", [10 * 60]);
    await ethers.provider.send("evm_mine");

    await c.connect(alice).safeTransferFrom(alice.address, bob.address, 1, 1, "0x");

    // cooldown avant un nouvel achat
    await ethers.provider.send("evm_increaseTime", [5 * 60]);
    await ethers.provider.send("evm_mine");

    await c.connect(alice).buyAsset(5, { value: 200 });
    expect(await c.uniqueOwnedCount(alice.address)).to.equal(4n);
  });

  it("tracks previous owners on transfers (not on mint/buy)", async function () {
    const { c, alice, bob, charlie } = await deploy();

    await c.createAsset("Rue Owners", 0, 200, "ipfs://CID");
    await c.connect(alice).buyAsset(1, { value: 200 });

    let owners = await c.getPreviousOwners(1);
    expect(owners.length).to.equal(0);

    await ethers.provider.send("evm_increaseTime", [10 * 60]);
    await ethers.provider.send("evm_mine");

    await c.connect(alice).safeTransferFrom(alice.address, bob.address, 1, 1, "0x");

    owners = await c.getPreviousOwners(1);
    expect(owners.length).to.equal(1);
    expect(owners[0]).to.equal(alice.address);

    await ethers.provider.send("evm_increaseTime", [10 * 60]);
    await ethers.provider.send("evm_mine");

    await c.connect(bob).safeTransferFrom(bob.address, charlie.address, 1, 1, "0x");

    owners = await c.getPreviousOwners(1);
    expect(owners.length).to.equal(2);
    expect(owners[0]).to.equal(alice.address);
    expect(owners[1]).to.equal(bob.address);
  });

  // ------------------- TRADE TESTS -------------------

  it("executes a fair trade when both approved", async function () {
    const { c, alice, bob } = await deploy();

    // id1 value=100, id2 value=200
    await c.createAsset("Prop 1", 0, 100, "ipfs://1");
    await c.createAsset("Prop 2", 0, 200, "ipfs://2");

    // alice achète 2x id1 => on fait 2 achats donc cooldown à respecter
    await c.connect(alice).buyAsset(1, { value: 100 });
    await ethers.provider.send("evm_increaseTime", [5 * 60]);
    await ethers.provider.send("evm_mine");
    await c.connect(alice).buyAsset(1, { value: 100 });

    // bob achète 1x id2
    await ethers.provider.send("evm_increaseTime", [5 * 60]);
    await ethers.provider.send("evm_mine");
    await c.connect(bob).buyAsset(2, { value: 200 });

    // approvals (contrat opérateur)
    await c.connect(alice).setApprovalForAll(await c.getAddress(), true);
    await c.connect(bob).setApprovalForAll(await c.getAddress(), true);

    // attendre lock 10 min
    await ethers.provider.send("evm_increaseTime", [10 * 60]);
    await ethers.provider.send("evm_mine");

    // Trade: alice donne 2x id1 (=200), bob donne 1x id2 (=200)
    await c.connect(alice).trade(bob.address, 1, 2, 2, 1);

    expect(await c.balanceOf(alice.address, 1)).to.equal(0n);
    expect(await c.balanceOf(alice.address, 2)).to.equal(1n);

    expect(await c.balanceOf(bob.address, 2)).to.equal(0n);
    expect(await c.balanceOf(bob.address, 1)).to.equal(2n);
  });

  it("reverts trade if not fair (value mismatch)", async function () {
    const { c, alice, bob } = await deploy();

    await c.createAsset("A", 0, 100, "ipfs://A"); // id1
    await c.createAsset("B", 0, 200, "ipfs://B"); // id2

    await c.connect(alice).buyAsset(1, { value: 100 });
    await ethers.provider.send("evm_increaseTime", [5 * 60]);
    await ethers.provider.send("evm_mine");
    await c.connect(bob).buyAsset(2, { value: 200 });

    await c.connect(alice).setApprovalForAll(await c.getAddress(), true);
    await c.connect(bob).setApprovalForAll(await c.getAddress(), true);

    await ethers.provider.send("evm_increaseTime", [10 * 60]);
    await ethers.provider.send("evm_mine");

    await expect(
      c.connect(alice).trade(bob.address, 1, 1, 2, 1)
    ).to.be.revertedWith("Trade not fair");
  });

  it("reverts trade if one party didn't approve the contract", async function () {
    const { c, alice, bob } = await deploy();

    await c.createAsset("A", 0, 100, "ipfs://A"); // id1
    await c.createAsset("B", 0, 100, "ipfs://B"); // id2

    await c.connect(alice).buyAsset(1, { value: 100 });
    await ethers.provider.send("evm_increaseTime", [5 * 60]);
    await ethers.provider.send("evm_mine");
    await c.connect(bob).buyAsset(2, { value: 100 });

    // Alice approuve, Bob non
    await c.connect(alice).setApprovalForAll(await c.getAddress(), true);

    await ethers.provider.send("evm_increaseTime", [10 * 60]);
    await ethers.provider.send("evm_mine");

    await expect(
      c.connect(alice).trade(bob.address, 1, 1, 2, 1)
    ).to.be.revertedWith("Counterparty not approved");
  });
});