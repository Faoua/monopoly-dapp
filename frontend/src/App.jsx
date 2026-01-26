import { ethers } from "ethers";
import MonopolyABI from "./abi/MonopolyAssets.json";
import { useState } from "react";
import "./App.css";

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

function App() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [assets, setAssets] = useState([]);

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

    setAccount(accounts[0]);

    const monopolyContract = new ethers.Contract(
      CONTRACT_ADDRESS,
      MonopolyABI.abi,
      signer
    );

    setContract(monopolyContract);

    console.log("Contrat chargé :", monopolyContract);
    console.log("Wallet :", accounts[0]);
    console.log("Adresse contrat frontend :", monopolyContract.target);
  };

  const loadAssets = async () => {
    if (!contract) return;

    const loadedAssets = [];

    for (let id = 1; id <= 5; id++) {
      try {
        const asset = await contract.getAsset(id);

        console.log("Asset", id, asset);

        const ipfsUrl = `https://ipfs.io/ipfs/${asset.ipfsHash}`;

        let metadata = null;

        try {
          const response = await fetch(ipfsUrl);
          if (response.ok) {
            metadata = await response.json();
          }
        } catch (e) {
          console.log("IPFS failed for", id);
        }

        loadedAssets.push({
          id,
          name: asset.name,
          value: asset.value.toString(),
          type: asset.assetType,
          ipfs: asset.ipfsHash,
          metadata,
        });
      } catch (err) {
        console.log("Token inexistant :", id);
      }
    }

    console.log("LOADED ASSETS:", loadedAssets);
    setAssets(loadedAssets);
  };
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
        {assets.map((asset) => (
          <div key={asset.id} className="asset-card">
            <h3>{asset.name}</h3>
            <p>ID: {asset.id}</p>
            <p>Valeur: {asset.value}</p>
            <p>Type: {asset.type}</p>
            <p>CID: {asset.ipfs}</p>

            {asset.metadata?.image && (
              <img
                src={`https://ipfs.io/ipfs/${asset.metadata.image}`}
                alt={asset.name}
                width="200"
              />
            )}

            <p>{asset.metadata?.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
