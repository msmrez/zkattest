// Generates a fresh deployer keypair for pallet-revive and prints all the address
// formats you might need to fund it from your main Polkadot wallet.
//
// Run:
//   cd spike
//   npm install ethers @polkadot/keyring @polkadot/util
//   node generate-deployer.mjs
//
// SAVE THE PRIVATE KEY. You'll set it as PRIVATE_KEY env var when running deploy.mjs.

import { Wallet } from 'ethers';
import { encodeAddress } from '@polkadot/keyring';
import { hexToU8a } from '@polkadot/util';

const wallet = Wallet.createRandom();

// pallet-revive's H160 → AccountId32 mapping:
// the 20 H160 bytes followed by 12 bytes of 0xEE filler.
// Source: polkadot-sdk substrate/frame/revive — fallback account mapping.
const accountId = new Uint8Array(32);
accountId.set(hexToU8a(wallet.address), 0);
for (let i = 20; i < 32; i++) accountId[i] = 0xEE;

const ss58Polkadot = encodeAddress(accountId, 0);
const ss58Kusama   = encodeAddress(accountId, 2);
const ss58Generic  = encodeAddress(accountId, 42);

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  Fresh deployer keypair for pallet-revive');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('  PRIVATE KEY  (save this — passed to deploy.mjs as PRIVATE_KEY)');
console.log('  ' + wallet.privateKey);
console.log('');
console.log('  H160 address (Ethereum-style; works in modern Polkadot wallets)');
console.log('  ' + wallet.address);
console.log('');
console.log('  Same account, SS58 format (paste this if your wallet rejects 0x)');
console.log('    Polkadot Asset Hub:  ' + ss58Polkadot);
console.log('    Kusama Asset Hub:    ' + ss58Kusama);
console.log('    Westend / generic:   ' + ss58Generic);
console.log('');
console.log('  TO FUND: from your main Polkadot wallet (5CZm...), switch to');
console.log('  Asset Hub and send ~0.5 DOT to either format above. Both reach');
console.log('  the same account. The H160 is preferred if your wallet accepts it.');
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
