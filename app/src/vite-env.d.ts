/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_NATIVE_CHAIN_ID?: string;
  readonly VITE_NETWORK_NAME?: string;
  readonly VITE_EVM_RPC_URL?: string;
  readonly VITE_REST_URL?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_EXPLORER_URL?: string;
  readonly VITE_FAUCET_URL?: string;
  readonly VITE_VAULT_ADDRESS?: string;
  readonly VITE_ASSET_ADDRESS?: string;
  readonly VITE_VAULT_DEPLOY_BLOCK?: string;
  readonly VITE_SOURCE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
