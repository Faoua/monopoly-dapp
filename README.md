# Monopoly DApp — Smart Contract & Tests

Ce projet implémente la partie smart contract d’une DApp Web3 inspirée du jeu Monopoly.

Les ressources du jeu (propriétés, gares, utilités, maisons, hôtels) sont représentées par des tokens ERC-1155, avec des regle metier appliquées on chain.

Ce dépôt couvre :
le smart contract
les règles métier
les tests unitaires Hardhat
 à completer...

## Stack technique
Solidity ^0.8.28
Hardhat
OpenZeppelin ERC-1155
Tests : Hardhat + Chai
Réseau : Hardhat local
Métadonnées : IPFS reste à faire
Front-end + cnx Metamask


## Installation

### Prérequis
Node.js ≥ 18
npm

### Installation
npm install

## lancer les tests
npx hardhat test

Les tests couvrent :
création des assets
mint
transferts
cooldown
lock temporel
limite de ressources
échanges (trade)
gestion des erreurs (reverts)

# ABI
l'ABI du contrat disponible dans:
artifacts/contracts/MonopolyAssets.sol/MonopolyAssets.json
