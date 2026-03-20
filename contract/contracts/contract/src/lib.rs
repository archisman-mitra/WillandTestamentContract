#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror,
    Address, Env, Vec, String, symbol_short, token,
    log,
};

// ─── Storage Keys ────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Testator,
    InactivityPeriod,
    LastCheckIn,
    Beneficiaries,
    TotalDeposited,
    WillExecuted,
    WillRevoked,
    Token,
    SharesClaimed,
}

// ─── Data Structures ─────────────────────────────────────────────────────────

/// A single beneficiary entry in the will
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Beneficiary {
    /// Stellar address of the beneficiary
    pub address: Address,
    /// Human-readable name (stored on-chain for transparency)
    pub name: String,
    /// Allocation in basis points (1 bps = 0.01%). Total must equal 10_000
    pub share_bps: u32,
    /// Whether this beneficiary has already claimed their inheritance
    pub claimed: bool,
}

/// Full snapshot of the will's current state — returned by `get_will()`
#[contracttype]
#[derive(Clone, Debug)]
pub struct WillStatus {
    pub testator: Address,
    pub token: Address,
    pub inactivity_period_ledgers: u32,
    pub last_check_in_ledger: u32,
    pub total_deposited: i128,
    pub beneficiaries: Vec<Beneficiary>,
    pub is_executed: bool,
    pub is_revoked: bool,
    pub is_executable: bool,
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum WillError {
    NotInitialized          = 1,
    AlreadyInitialized      = 2,
    Unauthorized            = 3,
    WillIsRevoked           = 4,
    WillAlreadyExecuted     = 5,
    InactivityPeriodNotMet  = 6,
    BeneficiaryNotFound     = 7,
    AlreadyClaimed          = 8,
    InvalidTotalShares      = 9,
    TooManyBeneficiaries    = 10,
    DuplicateBeneficiary    = 11,
    ZeroDeposit             = 12,
    NoFundsToDistribute     = 13,
}

// ─── Maximum beneficiaries allowed ────────────────────────────────────────────
const MAX_BENEFICIARIES: u32 = 20;

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct WillContract;

#[contractimpl]
impl WillContract {

    // ── Initialization ────────────────────────────────────────────────────────

    /// Initialize the will.
    ///
    /// # Arguments
    /// * `testator`                  – The address of the person making the will.
    /// * `token`                     – The SAC-compatible token contract to distribute.
    /// * `inactivity_period_ledgers` – Ledgers of inactivity before the will can
    ///                                 be executed (~5 seconds per ledger on mainnet).
    ///                                 E.g. 3_110_400 ≈ 180 days.
    pub fn initialize(
        env: Env,
        testator: Address,
        token: Address,
        inactivity_period_ledgers: u32,
    ) -> Result<(), WillError> {
        if env.storage().instance().has(&DataKey::Testator) {
            return Err(WillError::AlreadyInitialized);
        }

        testator.require_auth();

        env.storage().instance().set(&DataKey::Testator, &testator);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::InactivityPeriod, &inactivity_period_ledgers);
        env.storage().instance().set(&DataKey::LastCheckIn, &env.ledger().sequence());
        env.storage().instance().set(&DataKey::WillExecuted, &false);
        env.storage().instance().set(&DataKey::WillRevoked, &false);
        env.storage().instance().set(&DataKey::TotalDeposited, &0i128);
        env.storage().instance().set(&DataKey::Beneficiaries, &Vec::<Beneficiary>::new(&env));

        log!(&env, "Will initialized by testator: {}", testator);
        Ok(())
    }

    // ── Testator Actions ──────────────────────────────────────────────────────

    /// Add or update a beneficiary.
    ///
    /// Can only be called by the testator while the will is active.
    /// The sum of all `share_bps` across beneficiaries must equal 10_000 after
    /// every modification — call `finalize_shares()` to validate, or simply
    /// ensure the invariant holds in your client before calling `execute_will`.
    pub fn add_beneficiary(
        env: Env,
        name: String,
        address: Address,
        share_bps: u32,
    ) -> Result<(), WillError> {
        let testator = Self::require_testator(&env)?;
        testator.require_auth();
        Self::require_active(&env)?;

        let mut beneficiaries: Vec<Beneficiary> =
            env.storage().instance().get(&DataKey::Beneficiaries).unwrap();

        // Reject duplicates
        for b in beneficiaries.iter() {
            if b.address == address {
                return Err(WillError::DuplicateBeneficiary);
            }
        }

        if beneficiaries.len() >= MAX_BENEFICIARIES {
            return Err(WillError::TooManyBeneficiaries);
        }

        beneficiaries.push_back(Beneficiary {
            address: address.clone(),
            name,
            share_bps,
            claimed: false,
        });

        env.storage().instance().set(&DataKey::Beneficiaries, &beneficiaries);
        log!(&env, "Beneficiary added: {}", address);
        Ok(())
    }

    /// Remove a beneficiary by address.
    pub fn remove_beneficiary(env: Env, address: Address) -> Result<(), WillError> {
        let testator = Self::require_testator(&env)?;
        testator.require_auth();
        Self::require_active(&env)?;

        let beneficiaries: Vec<Beneficiary> =
            env.storage().instance().get(&DataKey::Beneficiaries).unwrap();

        let mut updated = Vec::new(&env);
        let mut found = false;
        for b in beneficiaries.iter() {
            if b.address == address {
                found = true;
            } else {
                updated.push_back(b);
            }
        }

        if !found {
            return Err(WillError::BeneficiaryNotFound);
        }

        env.storage().instance().set(&DataKey::Beneficiaries, &updated);
        log!(&env, "Beneficiary removed: {}", address);
        Ok(())
    }

    /// Update the inactivity period.
    pub fn update_inactivity_period(env: Env, new_period_ledgers: u32) -> Result<(), WillError> {
        let testator = Self::require_testator(&env)?;
        testator.require_auth();
        Self::require_active(&env)?;

        env.storage().instance().set(&DataKey::InactivityPeriod, &new_period_ledgers);
        Ok(())
    }

    /// Testator checks in — resets the inactivity clock.
    ///
    /// The testator should call this regularly to prove they are alive.
    /// Failing to check in for `inactivity_period_ledgers` ledgers allows
    /// beneficiaries to trigger execution.
    pub fn check_in(env: Env) -> Result<u32, WillError> {
        let testator = Self::require_testator(&env)?;
        testator.require_auth();
        Self::require_active(&env)?;

        let current = env.ledger().sequence();
        env.storage().instance().set(&DataKey::LastCheckIn, &current);

        log!(&env, "Testator checked in at ledger: {}", current);
        Ok(current)
    }

    /// Deposit tokens into the will's escrow.
    ///
    /// Anyone can top-up the will (gifts, etc.), but typically the testator
    /// will deposit their assets here.
    pub fn deposit(env: Env, from: Address, amount: i128) -> Result<i128, WillError> {
        from.require_auth();
        Self::require_active(&env)?;

        if amount <= 0 {
            return Err(WillError::ZeroDeposit);
        }

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&from, &env.current_contract_address(), &amount);

        let prev: i128 = env.storage().instance().get(&DataKey::TotalDeposited).unwrap();
        let new_total = prev + amount;
        env.storage().instance().set(&DataKey::TotalDeposited, &new_total);

        log!(&env, "Deposited {} tokens. Total: {}", amount, new_total);
        Ok(new_total)
    }

    /// Permanently revoke the will and return all funds to the testator.
    pub fn revoke(env: Env) -> Result<(), WillError> {
        let testator = Self::require_testator(&env)?;
        testator.require_auth();
        Self::require_active(&env)?;

        // Return all deposited funds to testator
        let balance = Self::contract_balance(&env);
        if balance > 0 {
            let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
            let token_client = token::Client::new(&env, &token_addr);
            token_client.transfer(&env.current_contract_address(), &testator, &balance);
        }

        env.storage().instance().set(&DataKey::WillRevoked, &true);
        log!(&env, "Will revoked by testator. {} tokens returned.", balance);
        Ok(())
    }

    // ── Execution ─────────────────────────────────────────────────────────────

    /// Execute the will — callable by anyone once inactivity period has elapsed.
    ///
    /// Validates that:
    ///   1. The will is not revoked or already executed.
    ///   2. The inactivity period has passed since the last check-in.
    ///   3. Total beneficiary shares equal exactly 10_000 bps.
    ///   4. There are funds to distribute.
    ///
    /// After execution, each beneficiary can independently call `claim()`.
    pub fn execute_will(env: Env) -> Result<(), WillError> {
        Self::require_active(&env)?;

        // Validate inactivity period
        let last_check_in: u32 = env.storage().instance().get(&DataKey::LastCheckIn).unwrap();
        let period: u32 = env.storage().instance().get(&DataKey::InactivityPeriod).unwrap();
        let current = env.ledger().sequence();

        if current < last_check_in + period {
            return Err(WillError::InactivityPeriodNotMet);
        }

        // Validate shares sum to 100%
        let beneficiaries: Vec<Beneficiary> =
            env.storage().instance().get(&DataKey::Beneficiaries).unwrap();

        let total_bps: u32 = beneficiaries.iter().map(|b| b.share_bps).sum();
        if total_bps != 10_000 {
            return Err(WillError::InvalidTotalShares);
        }

        // Ensure there are funds
        let balance = Self::contract_balance(&env);
        if balance <= 0 {
            return Err(WillError::NoFundsToDistribute);
        }

        env.storage().instance().set(&DataKey::WillExecuted, &true);
        env.storage().instance().set(&DataKey::TotalDeposited, &balance);

        log!(&env, "Will executed at ledger {}. Total balance: {}", current, balance);
        Ok(())
    }

    /// Beneficiary claims their share after the will has been executed.
    pub fn claim(env: Env, beneficiary_address: Address) -> Result<i128, WillError> {
        beneficiary_address.require_auth();

        // Will must be executed
        let executed: bool = env.storage().instance().get(&DataKey::WillExecuted).unwrap_or(false);
        if !executed {
            return Err(WillError::WillAlreadyExecuted); // reuse — will not yet executable
        }

        let mut beneficiaries: Vec<Beneficiary> =
            env.storage().instance().get(&DataKey::Beneficiaries).unwrap();

        let total_deposited: i128 = env.storage().instance().get(&DataKey::TotalDeposited).unwrap();
        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);

        let mut payout: i128 = 0;
        let mut found = false;
        let mut updated = Vec::new(&env);

        for mut b in beneficiaries.iter() {
            if b.address == beneficiary_address {
                found = true;
                if b.claimed {
                    return Err(WillError::AlreadyClaimed);
                }
                payout = (total_deposited * b.share_bps as i128) / 10_000;
                b.claimed = true;
            }
            updated.push_back(b);
        }

        if !found {
            return Err(WillError::BeneficiaryNotFound);
        }

        if payout > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &beneficiary_address,
                &payout,
            );
        }

        env.storage().instance().set(&DataKey::Beneficiaries, &updated);
        log!(&env, "Beneficiary {} claimed {} tokens.", beneficiary_address, payout);
        Ok(payout)
    }

    // ── View Functions ────────────────────────────────────────────────────────

    /// Returns the complete will status.
    pub fn get_will(env: Env) -> Result<WillStatus, WillError> {
        let testator: Address = env.storage().instance()
            .get(&DataKey::Testator)
            .ok_or(WillError::NotInitialized)?;

        let token: Address        = env.storage().instance().get(&DataKey::Token).unwrap();
        let period: u32           = env.storage().instance().get(&DataKey::InactivityPeriod).unwrap();
        let last_check_in: u32    = env.storage().instance().get(&DataKey::LastCheckIn).unwrap();
        let total_deposited: i128 = env.storage().instance().get(&DataKey::TotalDeposited).unwrap();
        let is_executed: bool     = env.storage().instance().get(&DataKey::WillExecuted).unwrap_or(false);
        let is_revoked: bool      = env.storage().instance().get(&DataKey::WillRevoked).unwrap_or(false);
        let beneficiaries: Vec<Beneficiary> = env.storage().instance().get(&DataKey::Beneficiaries).unwrap();

        let current = env.ledger().sequence();
        let is_executable = !is_executed
            && !is_revoked
            && current >= last_check_in + period;

        Ok(WillStatus {
            testator,
            token,
            inactivity_period_ledgers: period,
            last_check_in_ledger: last_check_in,
            total_deposited,
            beneficiaries,
            is_executed,
            is_revoked,
            is_executable,
        })
    }

    /// Returns the current contract token balance.
    pub fn get_balance(env: Env) -> i128 {
        Self::contract_balance(&env)
    }

    /// Returns all beneficiaries.
    pub fn get_beneficiaries(env: Env) -> Result<Vec<Beneficiary>, WillError> {
        env.storage().instance()
            .get(&DataKey::Beneficiaries)
            .ok_or(WillError::NotInitialized)
    }

    /// Returns how many ledgers remain before the will becomes executable.
    /// Returns 0 if the inactivity period has already elapsed.
    pub fn ledgers_until_executable(env: Env) -> Result<u32, WillError> {
        Self::require_active(&env)?;
        let last_check_in: u32 = env.storage().instance().get(&DataKey::LastCheckIn).unwrap();
        let period: u32        = env.storage().instance().get(&DataKey::InactivityPeriod).unwrap();
        let current            = env.ledger().sequence();
        let deadline           = last_check_in + period;
        Ok(if current >= deadline { 0 } else { deadline - current })
    }

    // ── Internal Helpers ──────────────────────────────────────────────────────

    fn require_testator(env: &Env) -> Result<Address, WillError> {
        env.storage().instance()
            .get(&DataKey::Testator)
            .ok_or(WillError::NotInitialized)
    }

    fn require_active(env: &Env) -> Result<(), WillError> {
        if env.storage().instance().get::<DataKey, bool>(&DataKey::WillRevoked).unwrap_or(false) {
            return Err(WillError::WillIsRevoked);
        }
        if env.storage().instance().get::<DataKey, bool>(&DataKey::WillExecuted).unwrap_or(false) {
            return Err(WillError::WillAlreadyExecuted);
        }
        Ok(())
    }

    fn contract_balance(env: &Env) -> i128 {
        let token_addr: Option<Address> = env.storage().instance().get(&DataKey::Token);
        match token_addr {
            Some(addr) => {
                let client = token::Client::new(env, &addr);
                client.balance(&env.current_contract_address())
            }
            None => 0,
        }
    }
}