import { ethers } from "ethers";
import MonopolyABI from "./abi/MonopolyAssets.json";
import { useEffect, useState } from "react";
import "./App.css";

const CONTRACT_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

// Hardhat local = souvent 31337, parfois 1337 selon MetaMask/config
const ALLOWED_CHAIN_IDS = [31337, 1337];

function App() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);

  const [assets, setAssets] = useState([]);
  const [debug, setDebug] = useState("");
  const [loading, setLoading] = useState(false);

  // --------------------
  // IPFS helpers
  // --------------------
  const ipfsToCid = (val) => {
    if (!val) return "";
    return val.startsWith("ipfs://") ? val.replace("ipfs://", "") : val;
  };

  const toGatewayUrl = (ipfsOrCid, gatewayBase = "https://ipfs.io/ipfs/") => {
    const v = ipfsOrCid ?? "";
    if (typeof v !== "string") return "";
    if (v.startsWith("http://") || v.startsWith("https://")) return v;
    const cid = ipfsToCid(v);
    return `${gatewayBase}${cid}`;
  };

  const readableError = (e) => {
    return (
      e?.info?.error?.message ||
      e?.data?.message ||
      e?.error?.message ||
      e?.reason ||
      e?.shortMessage ||
      e?.message ||
      "Erreur inconnue"
    );
  };

  // --------------------
  // MetaMask events
  // --------------------
  useEffect(() => {
    if (!window.ethereum) return;

    const onAccountsChanged = (accs) => {
      if (!accs || accs.length === 0) {
        setAccount(null);
        setContract(null);
        setAssets([]);
        setDebug("⚠️ Wallet déconnecté dans MetaMask.");
        return;
      }
      setAccount(accs[0]);
      setDebug("");
    };

    const onChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged", onChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", onAccountsChanged);
      window.ethereum.removeListener("chainChanged", onChainChanged);
    };
  }, []);

  // --------------------
  // CONNECT
  // --------------------
  const connectWallet = async () => {
    try {
      setDebug("");
      setLoading(true);

      if (!window.ethereum) {
        alert("Installe MetaMask !");
        return;
      }

      const prov = new ethers.BrowserProvider(window.ethereum);

      // Vérifie le réseau
      const network = await prov.getNetwork();
      const chainId = Number(network.chainId);

      if (!ALLOWED_CHAIN_IDS.includes(chainId)) {
        setDebug(
          `⚠️ Mauvais réseau.\n` +
            `Mets MetaMask sur "Localhost 8545" (chainId 31337 ou 1337).\n` +
            `Ton chainId actuel = ${chainId}.`
        );
        return;
      }

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      const signer = await prov.getSigner();

      // Vérifie que l'adresse est bien un contrat
      const code = await prov.getCode(CONTRACT_ADDRESS);
      if (!code || code === "0x") {
        setDebug(
          `⚠️ L'adresse ${CONTRACT_ADDRESS} n'est pas un contrat sur ce réseau.\n` +
            `👉 Si tu as redémarré "hardhat node", redeploy + update l'adresse dans le front.`
        );
        return;
      }

      const monopolyContract = new ethers.Contract(
        CONTRACT_ADDRESS,
        MonopolyABI.abi,
        signer
      );

      setAccount(accounts[0]);
      setContract(monopolyContract);

      // auto-load
      await loadAssets(monopolyContract, accounts[0]);
    } catch (e) {
      console.error(e);
      setDebug(`❌ connectWallet: ${readableError(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // --------------------
  // LOAD ASSETS
  // --------------------
  const loadAssets = async (c = contract, acc = account) => {
    try {
      if (!c || !acc) return;
      setDebug("");
      setLoading(true);

      const loaded = [];

      const nextId = await c.getNextTokenId(); // BigInt
      const max = Number(nextId);

      for (let id = 1; id < max; id++) {
        try {
          const asset = await c.getAsset(id);
          const balance = await c.balanceOf(acc, id);

          const metadataUrl = toGatewayUrl(asset.ipfsHash);
          let metadata = null;
          try {
            const res = await fetch(metadataUrl);
            if (res.ok) metadata = await res.json();
          } catch {
            // ignore
          }

          loaded.push({
            id,
            name: asset.name,
            valueWei: asset.value, // BigInt
            valueStr: asset.value.toString(),
            valueEth: ethers.formatEther(asset.value),
            type: asset.assetType,
            ipfs: asset.ipfsHash,
            owned: balance.toString(),
            metadata,
          });
        } catch (e) {
          console.log("load asset failed for id", id, e);
        }
      }

      setAssets(loaded);
      if (loaded.length === 0) {
        setDebug("ℹ️ Aucun asset trouvé. As-tu bien exécuté ton script seedAssets ?");
      }
    } catch (e) {
      console.error(e);
      setDebug(`❌ loadAssets: ${readableError(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // --------------------
  // BUY (Option B)
  // --------------------
  const buy = async (asset) => {
    try {
      if (!contract || !account) return;

      setDebug("");
      setLoading(true);

      // buyAsset payable => value = prix exact
      const tx = await contract.buyAsset(asset.id, { value: asset.valueWei });
      await tx.wait();

      await loadAssets();
    } catch (e) {
      console.error(e);
      setDebug(`❌ Achat impossible: ${readableError(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // --------------------
  // UI
  // --------------------
  return (
    <div className="App">
      <h1>🎲 Monopoly DApp</h1>

      {!account ? (
        <button onClick={connectWallet} disabled={loading}>
          {loading ? "Connexion..." : "Connect Wallet"}
        </button>
      ) : (
        <>
          <p>Wallet connecté : {account}</p>
          <button onClick={() => loadAssets()} disabled={loading}>
            {loading ? "Chargement..." : "Charger les assets"}
          </button>
        </>
      )}

      {debug && (
        <p
          style={{
            maxWidth: 900,
            margin: "12px auto",
            padding: 12,
            border: "1px solid #ddd",
            whiteSpace: "pre-wrap",
          }}
        >
          {debug}
        </p>
      )}

      <div className="assets">
        {assets.length === 0 && account && <p>Aucun asset trouvé.</p>}

        {assets.map((asset) => {
          const imgVal = asset.metadata?.image;
          const imgUrl = imgVal
            ? toGatewayUrl(imgVal, "https://cloudflare-ipfs.com/ipfs/")
            : "";

          return (
            <div key={asset.id} className="asset-card">
              <h3>{asset.name}</h3>

              <p>ID: {asset.id}</p>
              <p>Prix (wei): {asset.valueStr}</p>
              <p>Prix (ETH): {asset.valueEth}</p>
              <p>Possédé: {asset.owned}</p>
              <p>Type: {String(asset.type)}</p>

              {imgUrl && (
                <img
                  src={imgUrl}
                  alt={asset.name}
                  width="220"
                  onError={(e) => {
                    const cid = ipfsToCid(imgVal);
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = `https://cloudflare-ipfs.com/ipfs/${cid}`;
                  }}
                />
              )}

              {asset.metadata?.description && <p>{asset.metadata.description}</p>}

              <button onClick={() => buy(asset)} disabled={loading} style={{ marginTop: 10 }}>
                {loading ? "..." : "Acheter"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default App;
