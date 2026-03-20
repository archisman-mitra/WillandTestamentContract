"use client";

import { useState, useCallback } from "react";
import {
  createWill,
  updateWill,
  claimInheritance,
  hasWill,
  getReleaseTime,
  getShare,
  hasClaimed,
  CONTRACT_ADDRESS,
} from "@/hooks/contract";
import { AnimatedCard } from "@/components/ui/animated-card";
import { Spotlight } from "@/components/ui/spotlight";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Icons ────────────────────────────────────────────────────

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function WillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

// ── Styled Input ─────────────────────────────────────────────

function Input({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-medium uppercase tracking-wider text-white/30">
        {label}
      </label>
      <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-px transition-all focus-within:border-[#7c6cf0]/30 focus-within:shadow-[0_0_20px_rgba(124,108,240,0.08)]">
        <input
          {...props}
          className="w-full rounded-[11px] bg-transparent px-4 py-3 font-mono text-sm text-white/90 placeholder:text-white/15 outline-none"
        />
      </div>
    </div>
  );
}

// ── Method Signature ─────────────────────────────────────────

function MethodSignature({
  name,
  params,
  color,
}: {
  name: string;
  params: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 font-mono text-sm">
      <span style={{ color }} className="font-semibold">fn</span>
      <span className="text-white/70">{name}</span>
      <span className="text-white/20 text-xs">{params}</span>
    </div>
  );
}

// ── Beneficiary Row ──────────────────────────────────────────

interface BeneficiaryRowProps {
  index: number;
  address: string;
  share: string;
  onAddressChange: (index: number, value: string) => void;
  onShareChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}

function BeneficiaryRow({
  index,
  address,
  share,
  onAddressChange,
  onShareChange,
  onRemove,
}: BeneficiaryRowProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <input
          type="text"
          value={address}
          onChange={(e) => onAddressChange(index, e.target.value)}
          placeholder={`Beneficiary ${index + 1} address (G...)`}
          className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 font-mono text-xs text-white/80 placeholder:text-white/20 outline-none focus:border-[#7c6cf0]/40 transition-colors"
        />
      </div>
      <div className="w-24">
        <input
          type="number"
          value={share}
          onChange={(e) => onShareChange(index, e.target.value)}
          placeholder="Share"
          className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 font-mono text-xs text-white/80 placeholder:text-white/20 outline-none focus:border-[#7c6cf0]/40 transition-colors"
        />
      </div>
      <button
        onClick={() => onRemove(index)}
        className="rounded-lg border border-[#f87171]/20 bg-[#f87171]/[0.05] p-2 text-[#f87171]/50 hover:text-[#f87171]/80 hover:border-[#f87171]/30 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

type Tab = "view" | "create" | "claim";

interface ContractUIProps {
  walletAddress: string | null;
  onConnect: () => void;
  isConnecting: boolean;
}

interface Beneficiary {
  address: string;
  share: string;
}

export default function ContractUI({ walletAddress, onConnect, isConnecting }: ContractUIProps) {
  const [activeTab, setActiveTab] = useState<Tab>("view");
  const [error, setError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // View tab state
  const [viewOwner, setViewOwner] = useState("");
  const [isViewing, setIsViewing] = useState(false);
  const [willData, setWillData] = useState<{
    hasWill: boolean;
    releaseTime: number;
    beneficiaries: Array<{ address: string; share: number; claimed: boolean }>;
  } | null>(null);

  // Create tab state
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([
    { address: "", share: "" },
  ]);
  const [releaseDays, setReleaseDays] = useState("365");
  const [isCreating, setIsCreating] = useState(false);

  // Claim tab state
  const [claimOwner, setClaimOwner] = useState("");
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<{ share: number; success: boolean } | null>(null);

  const truncate = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const handleAddBeneficiary = () => {
    setBeneficiaries([...beneficiaries, { address: "", share: "" }]);
  };

  const handleRemoveBeneficiary = (index: number) => {
    if (beneficiaries.length > 1) {
      setBeneficiaries(beneficiaries.filter((_, i) => i !== index));
    }
  };

  const handleAddressChange = (index: number, value: string) => {
    const updated = [...beneficiaries];
    updated[index].address = value;
    setBeneficiaries(updated);
  };

  const handleShareChange = (index: number, value: string) => {
    const updated = [...beneficiaries];
    updated[index].share = value;
    setBeneficiaries(updated);
  };

  const handleViewWill = useCallback(async () => {
    if (!viewOwner.trim()) return setError("Enter a will owner address");
    setError(null);
    setIsViewing(true);
    setWillData(null);

    try {
      const has = await hasWill(viewOwner.trim());
      const releaseTime = await getReleaseTime(viewOwner.trim());

      if (!has) {
        setWillData({ hasWill: false, releaseTime: 0, beneficiaries: [] });
        setIsViewing(false);
        return;
      }

      // For simplicity, we'll just show the release time
      setWillData({
        hasWill: true,
        releaseTime: releaseTime || 0,
        beneficiaries: [],
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setIsViewing(false);
    }
  }, [viewOwner]);

  const handleCreateWill = useCallback(async () => {
    if (!walletAddress) return setError("Connect wallet first");
    
    const validBeneficiaries = beneficiaries.filter(b => b.address.trim() && b.share.trim());
    if (validBeneficiaries.length === 0) return setError("Add at least one beneficiary");
    
    const now = Math.floor(Date.now() / 1000);
    const days = parseInt(releaseDays) || 365;
    const releaseTime = now + (days * 24 * 60 * 60);

    setError(null);
    setIsCreating(true);
    setTxStatus("Awaiting signature...");

    try {
      await createWill(
        walletAddress,
        validBeneficiaries.map(b => ({
          address: b.address.trim(),
          share: parseInt(b.share) || 0,
        })),
        releaseTime
      );
      setTxStatus("Will created on-chain!");
      setBeneficiaries([{ address: "", share: "" }]);
      setTimeout(() => setTxStatus(null), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      setTxStatus(null);
    } finally {
      setIsCreating(false);
    }
  }, [walletAddress, beneficiaries, releaseDays]);

  const handleClaim = useCallback(async () => {
    if (!walletAddress) return setError("Connect wallet first");
    if (!claimOwner.trim()) return setError("Enter the will owner's address");

    setError(null);
    setIsClaiming(true);
    setTxStatus("Awaiting signature...");
    setClaimResult(null);

    try {
      await claimInheritance(walletAddress, claimOwner.trim());
      const share = await getShare(claimOwner.trim(), walletAddress);
      setClaimResult({ share: share || 0, success: true });
      setTxStatus("Inheritance claimed on-chain!");
      setTimeout(() => setTxStatus(null), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Claim failed - release time may not have been reached");
      setTxStatus(null);
    } finally {
      setIsClaiming(false);
    }
  }, [walletAddress, claimOwner]);

  const tabs: { key: Tab; label: string; icon: React.ReactNode; color: string }[] = [
    { key: "view", label: "View Will", icon: <SearchIcon />, color: "#4fc3f7" },
    { key: "create", label: "Create Will", icon: <WillIcon />, color: "#7c6cf0" },
    { key: "claim", label: "Claim", icon: <GiftIcon />, color: "#34d399" },
  ];

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="w-full max-w-2xl animate-fade-in-up-delayed">
      {/* Toasts */}
      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-[#f87171]/15 bg-[#f87171]/[0.05] px-4 py-3 backdrop-blur-sm animate-slide-down">
          <span className="mt-0.5 text-[#f87171]"><AlertIcon /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#f87171]/90">Error</p>
            <p className="text-xs text-[#f87171]/50 mt-0.5 break-all">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="shrink-0 text-[#f87171]/30 hover:text-[#f87171]/70 text-lg leading-none">&times;</button>
        </div>
      )}

      {txStatus && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#34d399]/15 bg-[#34d399]/[0.05] px-4 py-3 backdrop-blur-sm shadow-[0_0_30px_rgba(52,211,153,0.05)] animate-slide-down">
          <span className="text-[#34d399]">
            {txStatus.includes("on-chain") ? <CheckIcon /> : <SpinnerIcon />}
          </span>
          <span className="text-sm text-[#34d399]/90">{txStatus}</span>
        </div>
      )}

      {/* Main Card */}
      <Spotlight className="rounded-2xl">
        <AnimatedCard className="p-0" containerClassName="rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#7c6cf0]/20 to-[#34d399]/20 border border-white/[0.06]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#7c6cf0]">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white/90">Will & Testament</h3>
                <p className="text-[10px] text-white/25 font-mono mt-0.5">{truncate(CONTRACT_ADDRESS)}</p>
              </div>
            </div>
            <Badge variant="info" className="text-[10px]">Soroban</Badge>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/[0.06] px-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => { setActiveTab(t.key); setError(null); setWillData(null); setClaimResult(null); }}
                className={cn(
                  "relative flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all",
                  activeTab === t.key ? "text-white/90" : "text-white/35 hover:text-white/55"
                )}
              >
                <span style={activeTab === t.key ? { color: t.color } : undefined}>{t.icon}</span>
                {t.label}
                {activeTab === t.key && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full transition-all"
                    style={{ background: `linear-gradient(to right, ${t.color}, ${t.color}66)` }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* View Will */}
            {activeTab === "view" && (
              <div className="space-y-5">
                <MethodSignature name="get_release_time" params="(owner: Address) -> u64" color="#4fc3f7" />
                <Input label="Will Owner Address" value={viewOwner} onChange={(e) => setViewOwner(e.target.value)} placeholder="G..." />
                <ShimmerButton onClick={handleViewWill} disabled={isViewing} shimmerColor="#4fc3f7" className="w-full">
                  {isViewing ? <><SpinnerIcon /> Searching...</> : <><SearchIcon /> View Will</>}
                </ShimmerButton>

                {willData && (
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden animate-fade-in-up">
                    <div className="border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-white/25">Will Details</span>
                      <Badge variant={willData.hasWill ? "success" : "warning"}>
                        {willData.hasWill ? "Active" : "No Will"}
                      </Badge>
                    </div>
                    <div className="p-4 space-y-3">
                      {willData.hasWill ? (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-white/35 flex items-center gap-2">
                              <ClockIcon /> Release Date
                            </span>
                            <span className="font-mono text-sm text-white/80">
                              {formatDate(willData.releaseTime)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-white/35">Status</span>
                            <span className="font-mono text-sm text-[#34d399]/80">Active &amp; Ready</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-4 text-white/40 text-sm">
                          No will found for this address
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Create Will */}
            {activeTab === "create" && (
              <div className="space-y-5">
                <MethodSignature name="create_will" params="(beneficiaries: Map, release_time: u64)" color="#7c6cf0" />
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium uppercase tracking-wider text-white/30">
                      Beneficiaries
                    </label>
                    <button
                      onClick={handleAddBeneficiary}
                      className="flex items-center gap-1.5 text-[10px] text-[#7c6cf0]/60 hover:text-[#7c6cf0]/90 transition-colors"
                    >
                      <UserPlusIcon /> Add Beneficiary
                    </button>
                  </div>
                  
                  <div className="space-y-2">
                    {beneficiaries.map((ben, index) => (
                      <BeneficiaryRow
                        key={index}
                        index={index}
                        address={ben.address}
                        share={ben.share}
                        onAddressChange={handleAddressChange}
                        onShareChange={handleShareChange}
                        onRemove={handleRemoveBeneficiary}
                      />
                    ))}
                  </div>
                </div>

                <Input
                  label="Release After (Days)"
                  type="number"
                  value={releaseDays}
                  onChange={(e) => setReleaseDays(e.target.value)}
                  placeholder="365"
                />
                
                <div className="rounded-xl border border-[#7c6cf0]/10 bg-[#7c6cf0]/[0.03] p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-[#7c6cf0]/60 mt-0.5"><ClockIcon /></span>
                    <div>
                      <p className="text-xs text-white/60">
                        After <span className="text-[#7c6cf0] font-semibold">{releaseDays || 365}</span> days, your beneficiaries can claim their inheritance shares.
                      </p>
                      <p className="text-[10px] text-white/30 mt-2">
                        Release date: {formatDate(Math.floor(Date.now() / 1000) + ((parseInt(releaseDays) || 365) * 24 * 60 * 60))}
                      </p>
                    </div>
                  </div>
                </div>

                {walletAddress ? (
                  <ShimmerButton onClick={handleCreateWill} disabled={isCreating} shimmerColor="#7c6cf0" className="w-full">
                    {isCreating ? <><SpinnerIcon /> Creating...</> : <><WillIcon /> Create Will</>}
                  </ShimmerButton>
                ) : (
                  <button
                    onClick={onConnect}
                    disabled={isConnecting}
                    className="w-full rounded-xl border border-dashed border-[#7c6cf0]/20 bg-[#7c6cf0]/[0.03] py-4 text-sm text-[#7c6cf0]/60 hover:border-[#7c6cf0]/30 hover:text-[#7c6cf0]/80 active:scale-[0.99] transition-all disabled:opacity-50"
                  >
                    Connect wallet to create a will
                  </button>
                )}
              </div>
            )}

            {/* Claim */}
            {activeTab === "claim" && (
              <div className="space-y-5">
                <MethodSignature name="claim_inheritance" params="(owner: Address, beneficiary: Address) -> i128" color="#34d399" />
                <Input label="Will Owner Address" value={claimOwner} onChange={(e) => setClaimOwner(e.target.value)} placeholder="G..." />
                
                <div className="rounded-xl border border-[#34d399]/10 bg-[#34d399]/[0.03] p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-[#34d399]/60 mt-0.5"><UsersIcon /></span>
                    <div>
                      <p className="text-xs text-white/60">
                        Enter the address of the will owner. Your share will be claimed from their will.
                      </p>
                      <p className="text-[10px] text-white/30 mt-2">
                        Make sure the release time has passed before claiming.
                      </p>
                    </div>
                  </div>
                </div>

                {claimResult?.success && (
                  <div className="rounded-xl border border-[#34d399]/20 bg-[#34d399]/[0.05] p-4 animate-fade-in-up">
                    <div className="flex items-center gap-3">
                      <span className="text-[#34d399]"><CheckIcon /></span>
                      <div>
                        <p className="text-sm text-[#34d399]/90 font-medium">Inheritance Claimed!</p>
                        <p className="text-xs text-white/50 mt-1">Share: {claimResult.share}</p>
                      </div>
                    </div>
                  </div>
                )}

                {walletAddress ? (
                  <ShimmerButton onClick={handleClaim} disabled={isClaiming} shimmerColor="#34d399" className="w-full">
                    {isClaiming ? <><SpinnerIcon /> Claiming...</> : <><GiftIcon /> Claim Inheritance</>}
                  </ShimmerButton>
                ) : (
                  <button
                    onClick={onConnect}
                    disabled={isConnecting}
                    className="w-full rounded-xl border border-dashed border-[#34d399]/20 bg-[#34d399]/[0.03] py-4 text-sm text-[#34d399]/60 hover:border-[#34d399]/30 hover:text-[#34d399]/80 active:scale-[0.99] transition-all disabled:opacity-50"
                  >
                    Connect wallet to claim inheritance
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-white/[0.04] px-6 py-3 flex items-center justify-between">
            <p className="text-[10px] text-white/15">Will & Testament &middot; Soroban</p>
            <div className="flex items-center gap-2">
              {["Create", "Wait", "Claim"].map((s, i) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                  <span className="font-mono text-[9px] text-white/15">{s}</span>
                  {i < 2 && <span className="text-white/10 text-[8px]">&rarr;</span>}
                </span>
              ))}
            </div>
          </div>
        </AnimatedCard>
      </Spotlight>
    </div>
  );
}
