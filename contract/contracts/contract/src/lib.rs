#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Vec};

#[contracttype]
#[derive(Clone)]
pub struct Beneficiary {
    pub address: Address,
    pub share: i128,
}

#[contracttype]
pub enum DataKey {
    Owner,
    Beneficiaries,
    IsExecuted,
}

#[contract]
pub struct WillContract;

#[contractimpl]
impl WillContract {

    // Initialize contract with owner and beneficiaries
    pub fn init(env: Env, owner: Address, beneficiaries: Vec<Beneficiary>) {
        owner.require_auth();

        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().set(&DataKey::Beneficiaries, &beneficiaries);
        env.storage().instance().set(&DataKey::IsExecuted, &false);
    }

    // Update beneficiaries (only owner can do this)
    pub fn update_beneficiaries(env: Env, beneficiaries: Vec<Beneficiary>) {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();

        env.storage().instance().set(&DataKey::Beneficiaries, &beneficiaries);
    }

    // Execute the will (simulate distribution)
    pub fn execute(env: Env) {
        let executed: bool = env.storage().instance().get(&DataKey::IsExecuted).unwrap();

        if executed {
            panic!("Will already executed");
        }

        // In real use, you'd integrate token transfers here
        env.storage().instance().set(&DataKey::IsExecuted, &true);
    }

    // View beneficiaries
    pub fn get_beneficiaries(env: Env) -> Vec<Beneficiary> {
        env.storage().instance().get(&DataKey::Beneficiaries).unwrap()
    }

    // Check execution status
    pub fn is_executed(env: Env) -> bool {
        env.storage().instance().get(&DataKey::IsExecuted).unwrap()
    }
}