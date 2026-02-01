// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MonopolyAssets is ERC1155, Ownable, ReentrancyGuard {
    enum AssetType { PROPERTY, STATION, UTILITY, HOUSE, HOTEL }

    // Cooldown global (5 minutes)
    uint256 public constant COOLDOWN_SECONDS = 5 minutes;
    mapping(address => uint256) public lastActionAt;

    // Lock après acquisition (10 minutes)
    uint256 public constant LOCK_SECONDS = 10 minutes;
    mapping(address => mapping(uint256 => uint256)) public lockedUntil;

    // Max 4 ressources uniques (tokenIds différents)
    uint256 public constant MAX_UNIQUE_RESOURCES = 4;
    mapping(address => uint256) public uniqueOwnedCount;
    mapping(address => mapping(uint256 => bool)) private _ownsId;

    struct AssetInfo {
        string name;
        AssetType assetType;
        uint256 value;          // prix/valeur (en wei dans buyAsset)
        string ipfsHash;        // ipfs://CID du JSON metadata
        uint256 createdAt;
        uint256 lastTransferAt;
    }

    uint256 private nextTokenId = 1;
    mapping(uint256 => AssetInfo) private assets;

    // Historique des anciens propriétaires (par tokenId)
    mapping(uint256 => address[]) private _previousOwners;

    event AssetCreated(uint256 indexed tokenId, string name, AssetType assetType, uint256 value, string ipfsHash);
    event AssetMinted(address indexed to, uint256 indexed tokenId, uint256 amount);

    event TradeExecuted(
        address indexed maker,
        address indexed counterparty,
        uint256 idGive,
        uint256 amountGive,
        uint256 idWant,
        uint256 amountWant
    );

    event AssetBought(
        address indexed buyer,
        uint256 indexed tokenId,
        uint256 amount,
        uint256 paid
    );

    constructor() ERC1155("") Ownable(msg.sender) {}

    // ---------------- Admin / création ----------------

    function createAsset(
        string calldata name,
        AssetType assetType,
        uint256 value,
        string calldata ipfsHash
    ) external onlyOwner returns (uint256 tokenId) {
        require(bytes(name).length > 0, "Name required");
        require(value > 0, "Value must be > 0");
        require(bytes(ipfsHash).length > 0, "IPFS required");

        tokenId = nextTokenId++;
        assets[tokenId] = AssetInfo({
            name: name,
            assetType: assetType,
            value: value,
            ipfsHash: ipfsHash,
            createdAt: block.timestamp,
            lastTransferAt: 0
        });

        emit AssetCreated(tokenId, name, assetType, value, ipfsHash);
    }

    function mintTo(address to, uint256 tokenId, uint256 amount) external onlyOwner {
        require(to != address(0), "Zero address");
        require(assets[tokenId].createdAt != 0, "Asset not found");
        require(amount > 0, "Amount must be > 0");

        _mint(to, tokenId, amount, "");
        emit AssetMinted(to, tokenId, amount);
    }

    // ✅ pour le front : IDs existants = 1..(getNextTokenId()-1)
    function getNextTokenId() external view returns (uint256) {
        return nextTokenId;
    }

    // ---------------- Lecture ----------------

    function getAsset(uint256 tokenId) external view returns (AssetInfo memory) {
        require(assets[tokenId].createdAt != 0, "Asset not found");
        return assets[tokenId];
    }

    function getPreviousOwners(uint256 tokenId) external view returns (address[] memory) {
        require(assets[tokenId].createdAt != 0, "Asset not found");
        return _previousOwners[tokenId];
    }

    // ---------------- Achat (Option B) ----------------
    // L'utilisateur paye msg.value == value, et reçoit 1 token.
    function buyAsset(uint256 tokenId) external payable nonReentrant {
        require(assets[tokenId].createdAt != 0, "Asset not found");
        require(msg.value == assets[tokenId].value, "Incorrect payment");

        // mint vers l'acheteur (déclenche cooldown + lock via _update hook)
        _mint(msg.sender, tokenId, 1, "");

        // transfert des fonds au owner
        (bool ok, ) = owner().call{value: msg.value}("");
        require(ok, "Payment transfer failed");

        emit AssetBought(msg.sender, tokenId, 1, msg.value);
    }

    // ---- TRADE (valeur totale égale) ----
    function trade(
        address counterparty,
        uint256 idGive,
        uint256 amountGive,
        uint256 idWant,
        uint256 amountWant
    ) external {
        require(counterparty != address(0), "Zero counterparty");
        require(counterparty != msg.sender, "Same address");
        require(amountGive > 0 && amountWant > 0, "Amount must be > 0");

        require(assets[idGive].createdAt != 0, "Give asset not found");
        require(assets[idWant].createdAt != 0, "Want asset not found");

        require(balanceOf(msg.sender, idGive) >= amountGive, "Insufficient give balance");
        require(balanceOf(counterparty, idWant) >= amountWant, "Counterparty insufficient balance");

        require(isApprovedForAll(msg.sender, address(this)), "Maker not approved");
        require(isApprovedForAll(counterparty, address(this)), "Counterparty not approved");

        uint256 giveTotal = assets[idGive].value * amountGive;
        uint256 wantTotal = assets[idWant].value * amountWant;
        require(giveTotal == wantTotal, "Trade not fair");

        _safeTransferFrom(msg.sender, counterparty, idGive, amountGive, "");
        _safeTransferFrom(counterparty, msg.sender, idWant, amountWant, "");

        emit TradeExecuted(msg.sender, counterparty, idGive, amountGive, idWant, amountWant);
    }

    // ---------------- Internals ----------------

    function _checkCooldown(address user) internal view {
        if (user == address(0)) return;
        require(block.timestamp >= lastActionAt[user] + COOLDOWN_SECONDS, "Cooldown not passed");
    }

    function _checkLock(address from, uint256 id) internal view {
        if (from == address(0)) return;
        require(block.timestamp >= lockedUntil[from][id], "Token is locked");
    }

    function _afterBalanceChange(address user, uint256 id) internal {
        if (user == address(0)) return;

        uint256 bal = balanceOf(user, id);
        bool owns = _ownsId[user][id];

        if (!owns && bal > 0) {
            require(uniqueOwnedCount[user] + 1 <= MAX_UNIQUE_RESOURCES, "Max resources reached");
            _ownsId[user][id] = true;
            uniqueOwnedCount[user] += 1;
        }

        if (owns && bal == 0) {
            _ownsId[user][id] = false;
            uniqueOwnedCount[user] -= 1;
        }
    }

    function _recordPreviousOwner(uint256 id, address from) internal {
        if (from == address(0)) return;
        if (assets[id].createdAt == 0) return;

        address[] storage arr = _previousOwners[id];
        if (arr.length == 0 || arr[arr.length - 1] != from) {
            arr.push(from);
        }
    }

    // Hook ERC1155 : mint/transfer/burn
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        // Cooldown : mint => receiver, transfer => sender
        if (from == address(0)) {
            _checkCooldown(to);
        } else {
            _checkCooldown(from);
        }

        // Lock : uniquement sur transfer (pas mint)
        if (from != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                _checkLock(from, ids[i]);
            }
        }

        super._update(from, to, ids, values);

        // lastTransferAt sur mint ou transfer (ignore burn)
        if (to != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                if (assets[ids[i]].createdAt != 0) {
                    assets[ids[i]].lastTransferAt = block.timestamp;
                }
            }
        }

        // Enregistrer l'action
        if (from == address(0)) {
            lastActionAt[to] = block.timestamp;
        } else {
            lastActionAt[from] = block.timestamp;
        }

        // Lock au receveur après acquisition (mint ou réception transfert)
        if (to != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                lockedUntil[to][ids[i]] = block.timestamp + LOCK_SECONDS;
            }
        }

        // previousOwners : seulement sur transfert (from et to non-zero)
        if (from != address(0) && to != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                _recordPreviousOwner(ids[i], from);
            }
        }

        // Limite max 4 ressources uniques
        for (uint256 i = 0; i < ids.length; i++) {
            _afterBalanceChange(from, ids[i]);
            _afterBalanceChange(to, ids[i]);
        }
    }
}
