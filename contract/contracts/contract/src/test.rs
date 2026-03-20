#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger, LedgerInfo};
use soroban_sdk::{Address, Env, Map};

#[test]
fn test_create_will() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let ben1 = Address::generate(&env);
    let ben2 = Address::generate(&env);

    let mut beneficiaries = Map::new(&env);
    beneficiaries.set(ben1.clone(), 500);
    beneficiaries.set(ben2.clone(), 500);

    client.create_will(&beneficiaries, &1000000);

    assert!(client.has_will());
    assert_eq!(client.get_release_time(&contract_id), 1000000);
    assert_eq!(client.get_share(&contract_id, &ben1), 500);
    assert_eq!(client.get_share(&contract_id, &ben2), 500);
}

#[test]
fn test_claim_inheritance_after_release() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let ben1 = Address::generate(&env);

    let mut beneficiaries = Map::new(&env);
    beneficiaries.set(ben1.clone(), 1000);

    client.create_will(&beneficiaries, &100);

    // Fast forward ledger time past release
    let ledger_info = LedgerInfo {
        timestamp: 200,
        protocol_version: 25,
        sequence_number: 1000,
        network_id: Default::default(),
        base_reserve: 10,
        min_persistent_entry_ttl: 4096,
        min_temp_entry_ttl: 1,
        max_entry_ttl: 6312000,
    };
    env.ledger().set(ledger_info);

    let share = client.claim_inheritance(&contract_id, &ben1);
    assert_eq!(share, 1000);
    assert!(client.has_claimed(&contract_id, &ben1));
}

#[test]
fn test_update_will_before_release() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let ben1 = Address::generate(&env);
    let ben2 = Address::generate(&env);

    let mut beneficiaries = Map::new(&env);
    beneficiaries.set(ben1.clone(), 500);

    client.create_will(&beneficiaries, &1000000);

    // Update before release time
    let mut new_beneficiaries = Map::new(&env);
    new_beneficiaries.set(ben1.clone(), 300);
    new_beneficiaries.set(ben2.clone(), 700);

    client.update_will(&new_beneficiaries);

    assert_eq!(client.get_share(&contract_id, &ben1), 300);
    assert_eq!(client.get_share(&contract_id, &ben2), 700);
}

#[test]
fn test_double_claim_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let ben1 = Address::generate(&env);

    let mut beneficiaries = Map::new(&env);
    beneficiaries.set(ben1.clone(), 1000);

    client.create_will(&beneficiaries, &100);

    let ledger_info = LedgerInfo {
        timestamp: 200,
        protocol_version: 25,
        sequence_number: 1000,
        network_id: Default::default(),
        base_reserve: 10,
        min_persistent_entry_ttl: 4096,
        min_temp_entry_ttl: 1,
        max_entry_ttl: 6312000,
    };
    env.ledger().set(ledger_info);

    client.claim_inheritance(&contract_id, &ben1);

    // Second claim should fail
    let result = client.try_claim_inheritance(&contract_id, &ben1);
    assert!(result.is_err());
}
