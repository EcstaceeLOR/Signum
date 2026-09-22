import hardhatToolboxViemPlugin from '@nomicfoundation/hardhat-toolbox-viem';
import { defineConfig } from 'hardhat/config';

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    version: '0.8.35',
    settings: {
      viaIR: true,
      evmVersion: 'osaka',
      optimizer: { enabled: true, runs: 200 },
    },
  },
});
