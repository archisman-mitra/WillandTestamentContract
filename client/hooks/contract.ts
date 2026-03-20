"use client";

import {
  Contract,
  Networks,
  TransactionBuilder,
  Keypair,
  xdr,
  Address,
  nativeToScVal,
  scValToNative,
  rpc,
} from "@stellar/stellar-sdk";
import {
  isConnected,
  getAddress,
  signTransaction,
  setAllowed,
  isAllowed,
  requestAccess,
} from "@stellar/freighter-api";

// ============================================================
// CONSTANTS — Update these for your contract
// ============================================================

/** Your deployed Soroban contract ID */
export const CONTRACT_ADDRESS =
  "CDJVMAX34YRCQ5JFC6SIOQOVSUY6XWEFYJOLF3SBCKU7CMI3IAP6HPWN";

/** Network passphrase (testnet by default) */
export const NETWORK_PASSPHRASE = Networks.TESTNET;

/** Soroban RPC URL */
export const RPC_URL = "https://soroban-testnet.stellar.org";

/** Horizon URL */
export const HORIZON_URL = "https://horizon-testnet.stellar.org";

/** Network name for Freighter */
export const NETWORK = "TESTNET";

// ============================================================
// RPC Server Instance
// ============================================================

const server = new rpc.Server(RPC_URL);

// ============================================================
// Wallet Helpers
// ============================================================

export async function checkConnection(): Promise<boolean> {
  const result = await isConnected();
  return result.isConnected;
}

export async function connectWallet(): Promise<string> {
  const connResult = await isConnected();
  if (!connResult.isConnected) {
    throw new Error("Freighter extension is not installed or not available.");
  }

  const allowedResult = await isAllowed();
  if (!allowedResult.isAllowed) {
    await setAllowed();
    await requestAccess();
  }

  const { address } = await getAddress();
  if (!address) {
    throw new Error("Could not retrieve wallet address from Freighter.");
  }
  return address;
}

export async function getWalletAddress(): Promise<string | null> {
  try {
    const connResult = await isConnected();
    if (!connResult.isConnected) return null;

    const allowedResult = await isAllowed();
    if (!allowedResult.isAllowed) return null;

    const { address } = await getAddress();
    return address || null;
  } catch {
    return null;
  }
}

// ============================================================
// Contract Interaction Helpers
// ============================================================

/**
 * Build, simulate, and optionally sign + submit a Soroban contract call.
 */
export async function callContract(
  method: string,
  params: xdr.ScVal[] = [],
  caller: string,
  sign: boolean = true
) {
  const contract = new Contract(CONTRACT_ADDRESS);
  const account = await server.getAccount(caller);

  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...params))
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(
      `Simulation failed: ${(simulated as rpc.Api.SimulateTransactionErrorResponse).error}`
    );
  }

  if (!sign) {
    return simulated;
  }

  const prepared = rpc.assembleTransaction(tx, simulated).build();

  const { signedTxXdr } = await signTransaction(prepared.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  const txToSubmit = TransactionBuilder.fromXDR(
    signedTxXdr,
    NETWORK_PASSPHRASE
  );

  const result = await server.sendTransaction(txToSubmit);

  if (result.status === "ERROR") {
    throw new Error(`Transaction submission failed: ${result.status}`);
  }

  let getResult = await server.getTransaction(result.hash);
  while (getResult.status === "NOT_FOUND") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    getResult = await server.getTransaction(result.hash);
  }

  if (getResult.status === "FAILED") {
    throw new Error("Transaction failed on chain.");
  }

  return getResult;
}

/**
 * Read-only contract call (does not require signing).
 */
export async function readContract(
  method: string,
  params: xdr.ScVal[] = [],
  caller?: string
) {
  const account =
    caller || Keypair.random().publicKey();
  const sim = await callContract(method, params, account, false);
  if (
    rpc.Api.isSimulationSuccess(sim as rpc.Api.SimulateTransactionResponse) &&
    (sim as rpc.Api.SimulateTransactionSuccessResponse).result
  ) {
    return scValToNative(
      (sim as rpc.Api.SimulateTransactionSuccessResponse).result!.retval
    );
  }
  return null;
}

// ============================================================
// ScVal Conversion Helpers
// ============================================================

export function toScValString(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: "string" });
}

export function toScValU32(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: "u32" });
}

export function toScValI128(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "i128" });
}

export function toScValAddress(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

export function toScValBool(value: boolean): xdr.ScVal {
  return nativeToScVal(value, { type: "bool" });
}

// ============================================================
// Will & Testament — Contract Methods
// ============================================================

/**
 * Create a will with beneficiaries and a release timestamp.
 * Callers become the will owner.
 * 
 * @param caller - The will owner's address
 * @param beneficiaries - Array of {address, share} pairs
 * @param releaseTimestamp - Unix timestamp when inheritance can be claimed
 */
export async function createWill(
  caller: string,
  beneficiaries: Array<{ address: string; share: number }>,
  releaseTimestamp: number
) {
  const benMap = new Map<string, number>();
  beneficiaries.forEach(b => benMap.set(b.address, b.share));
  
  // Convert Map to the expected ScVal format
  const benScVal = nativeToScVal(
    Object.fromEntries(benMap),
    { type: "map" }
  );
  
  return callContract(
    "create_will",
    [benScVal, toScValU32(releaseTimestamp)],
    caller,
    true
  );
}

/**
 * Update beneficiaries before release time.
 * @param caller - The will owner's address
 * @param beneficiaries - Array of {address, share} pairs
 */
export async function updateWill(
  caller: string,
  beneficiaries: Array<{ address: string; share: number }>
) {
  const benMap = new Map<string, number>();
  beneficiaries.forEach(b => benMap.set(b.address, b.share));
  
  const benScVal = nativeToScVal(
    Object.fromEntries(benMap),
    { type: "map" }
  );
  
  return callContract(
    "update_will",
    [benScVal],
    caller,
    true
  );
}

/**
 * Beneficiary claims their inheritance share.
 * @param caller - The beneficiary's address
 * @param owner - The will owner's address
 */
export async function claimInheritance(caller: string, owner: string) {
  return callContract(
    "claim_inheritance",
    [toScValAddress(owner), toScValAddress(caller)],
    caller,
    true
  );
}

/**
 * Check if a will exists for the given owner.
 */
export async function hasWill(owner: string) {
  return readContract(
    "has_will",
    [],
    owner
  );
}

/**
 * Get the release time for a will.
 */
export async function getReleaseTime(owner: string) {
  return readContract(
    "get_release_time",
    [toScValAddress(owner)],
    owner
  );
}

/**
 * Get beneficiary share amount.
 */
export async function getShare(owner: string, beneficiary: string) {
  return readContract(
    "get_share",
    [toScValAddress(owner), toScValAddress(beneficiary)],
    owner
  );
}

/**
 * Check if a beneficiary has claimed from a will.
 */
export async function hasClaimed(owner: string, beneficiary: string) {
  return readContract(
    "has_claimed",
    [toScValAddress(owner), toScValAddress(beneficiary)],
    owner
  );
}

export { nativeToScVal, scValToNative, Address, xdr };
