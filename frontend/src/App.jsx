import { ethers } from "ethers";
import MonopolyABI from "./abi/MonopolyAssets.json";
import { useState } from "react";
import "./App.css";

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

function App() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [assets, setAssets] = useState([]);

  // ==========================
  // CONNECT WALLET
  // ==========================
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("Installe Metamask !");
      return;
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    const monopolyContract = new ethers.Contract(
      CONTRACT_ADDRESS,
      MonopolyABI.abi,
      signer
    );

    setAccount(accounts[0]);
    setContract(monopolyContract);

    console.log("Contrat chargé :", monopolyContract);
    console.log("Wallet :", accounts[0]);
    console.log("Adresse contrat frontend :", monopolyContract.target);
  };

  // ==========================
  // LOAD ASSETS
  // ==========================
  const loadAssets = async () => {
    if (!contract || !account) return;

    const loadedAssets = [];

    for (let id = 1; id <= 5; id++) {
      try {
        const asset = await contract.getAsset(id);
        const balance = await contract.balanceOf(account, id);

        console.log("Asset", id, asset);

        const ipfsUrl = `https://ipfs.io/ipfs/${asset.ipfsHash}`;

        let metadata = null;

        try {
          const response = await fetch(ipfsUrl);
          if (response.ok) {
            metadata = await response.json();
          } else {
            console.log("IPFS primary failed", id);
          }
        } catch (e) {
          console.log("IPFS fetch crash", id);
        }

        console.log("Metadata asset", id, metadata);

        loadedAssets.push({
          id,
          name: asset.name,
          value: asset.value.toString(),
          type: asset.assetType,
          ipfs: asset.ipfsHash,
          owned: balance.toString(),
          metadata,
        });
      } catch (err) {
        console.log("Token inexistant :", id);
      }
    }

    console.log("LOADED ASSETS:", loadedAssets);
    setAssets(loadedAssets);
  };

  // ==========================
  // UI
  // ==========================
  return (
    <div className="App">
      <h1>🎲 Monopoly DApp</h1>

      {!account ? (
        <button onClick={connectWallet}>Connect Wallet</button>
      ) : (
        <>
          <p>Wallet connecté : {account}</p>
          <button onClick={loadAssets}>Charger les assets</button>
        </>
      )}

      <div className="assets">
        {assets.length === 0 && account && <p>Aucun asset trouvé.</p>}

        {assets.map((asset) => (
          <div key={asset.id} className="asset-card">
            <h3>{asset.name}</h3>

            <p>ID: {asset.id}</p>
            <p>Valeur: {asset.value}</p>
            <p>Possédé: {asset.owned}</p>
            <p>Type: {asset.type}</p>
            <p>CID: {asset.ipfs}</p>

            {asset.metadata?.image && (
              <img
                src={
                  asset.metadata.image.startsWith("http")
                    ? asset.metadata.image
                    : `https://gateway.pinata.cloud/ipfs/${asset.metadata.image}`
                }
                alt={asset.name}
                width="220"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = `https://cloudflare-ipfs.com/ipfs/${asset.metadata.image}`;
                }}
              />
            )}

            {asset.metadata?.description && <p>{asset.metadata.description}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
