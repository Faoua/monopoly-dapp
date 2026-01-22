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

## IPFS Integration

Les métadonnées des assets (nom, description, image, valeur) sont stockées off-chain sur IPFS sous forme de fichiers JSON.

Le smart contract stocke uniquement le hash IPFS (CID) via le champ `ipfsHash` afin de garantir l'intégrité et la traçabilité des ressources.

### Exemple IPFS

Les fichiers de métadonnées sont uploadés via Pinata.
Chaque asset référence un CID IPFS utilisé lors de la création
du token dans le smart contract.


## Intégration d’IPFS

### Pourquoi IPFS

Le stockage de métadonnées riches directement sur la blockchain est coûteux en gaz.

IPFS est utilisé afin de stocker les métadonnées des ressources en dehors de la blockchain,

tout en garantissant l’intégrité des données grâce à l’adressage par le contenu.

### Données stockées sur IPFS

Chaque ressource est associée à un fichier de métadonnées au format JSON stocké sur IPFS,

contenant notamment :

* le nom de la ressource
* le type de ressource
* la valeur associée
* une description
* une image
* les timestamps (création et dernier transfert)
* l’historique des anciens propriétaires

### Lien avec la blockchain

Le smart contract stocke uniquement le CID (hash IPFS) via le champ `ipfsHash`

de la structure `AssetInfo`.

Ce CID permet à n’importe quel client ou front-end de récupérer les métadonnées

associées à une ressource via l’URL :

**ipfs://bafkreidkkcqmcihgfdbmmj5fchomwwhpi6lnlcfip5gukyrcs2gois47qa**

### Avantages

* Réduction des coûts en gaz
* Métadonnées immuables
* Stockage décentralisé
* Séparation claire entre la logique on-chain et les données off-chain
