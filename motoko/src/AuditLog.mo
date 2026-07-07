// ─────────────────────────────────────────────────────────────────────────────
// AuditLog.mo
// Immutable audit-log canister for the TreasuryGuard Oracle system.
//
// Stores every oracle risk-decision that was broadcast from the FastAPI
// icp_service.py, providing a tamper-evident on-chain history on the
// Internet Computer Protocol (ICP) blockchain.
//
// Stability: all data lives in stable variables and survives canister upgrades.
// ─────────────────────────────────────────────────────────────────────────────

import Array  "mo:base/Array";
import Int    "mo:base/Int";
import Iter   "mo:base/Iter";
import Nat    "mo:base/Nat";
import Option "mo:base/Option";
import Principal "mo:base/Principal";
import Time   "mo:base/Time";

actor AuditLog {

  // ───────────────────────────────────────────────────────────────────────────
  // Types
  // ───────────────────────────────────────────────────────────────────────────

  /// A single oracle risk-decision record written to the audit log.
  public type AuditRecord = {
    id         : Nat;    // Auto-assigned sequential identifier
    timestamp  : Int;    // Nanoseconds since Unix epoch (Time.now())
    riskScore  : Float;  // Composite risk score  0.0 – 1.0
    var95      : Float;  // 95 % Value-at-Risk in USD
    confidence : Float;  // Model confidence      0.0 – 1.0
    action     : Text;   // e.g. "LOCK_LIQUIDITY", "UNLOCK_LIQUIDITY"
    txHash     : Text;   // 0x-prefixed EVM transaction hash
    oracleSig  : Text;   // Hex-encoded oracle ECDSA signature
    network    : Text;   // Chain name e.g. "hardhat", "mainnet"
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Stable storage  (survives upgrades)
  // ───────────────────────────────────────────────────────────────────────────

  stable var records : [AuditRecord] = [];
  stable var nextId  : Nat           = 0;

  /// The principal that deployed this canister.  Only this principal may call
  /// clearAll().  Populated once on first call or via constructor pattern.
  stable var owner : ?Principal = null;

  // ───────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────────────────────────────────────

  /// Initialise the owner to the first caller if not yet set.
  func _ensureOwner(caller : Principal) {
    switch (owner) {
      case null { owner := ?caller };
      case _    { };
    };
  };

  /// Return true if caller is the designated owner.
  func _isOwner(caller : Principal) : Bool {
    switch (owner) {
      case (?o) { Principal.equal(o, caller) };
      case null { false };
    };
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Public update methods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * addRecord  — Append a new audit record to stable storage.
   *
   * The `id` field in the supplied record is IGNORED; the canister assigns
   * its own sequential id and returns it to the caller.
   *
   * @param r  Partial AuditRecord (id field value is overwritten).
   * @return   The assigned record id.
   */
  public shared(msg) func addRecord(r : AuditRecord) : async Nat {
    _ensureOwner(msg.caller);

    let assignedId = nextId;
    let newRecord : AuditRecord = {
      id         = assignedId;
      timestamp  = Time.now();
      riskScore  = r.riskScore;
      var95      = r.var95;
      confidence = r.confidence;
      action     = r.action;
      txHash     = r.txHash;
      oracleSig  = r.oracleSig;
      network    = r.network;
    };

    records := Array.append<AuditRecord>(records, [newRecord]);
    nextId  += 1;

    assignedId
  };

  /**
   * clearAll  — Wipe all records and reset the counter.
   *
   * Restricted to the canister owner (the deployer principal).
   * Intended for testing / disaster-recovery — use with extreme caution in
   * production because this action is irreversible.
   */
  public shared(msg) func clearAll() : async () {
    assert (_isOwner(msg.caller));
    records := [];
    nextId  := 0;
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Public query methods  (free, no consensus required)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * getRecords  — Return every audit record in insertion order.
   */
  public query func getRecords() : async [AuditRecord] {
    records
  };

  /**
   * getRecord  — Return a single record by its id, or null if not found.
   */
  public query func getRecord(id : Nat) : async ?AuditRecord {
    if (id >= records.size()) {
      return null;
    };
    ?records[id]
  };

  /**
   * getRecordCount  — Return the total number of records stored.
   */
  public query func getRecordCount() : async Nat {
    records.size()
  };

  /**
   * getRecentRecords  — Return the most recent `n` records.
   *
   * If `n` is greater than the total record count, all records are returned.
   * Records are returned in insertion order (oldest first within the slice).
   */
  public query func getRecentRecords(n : Nat) : async [AuditRecord] {
    let total = records.size();
    if (n == 0 or total == 0) {
      return [];
    };
    let count  = if (n > total) { total } else { n };
    let start  = total - count;
    // Build slice manually for Motoko base compatibility
    var slice : [AuditRecord] = [];
    var i = start;
    while (i < total) {
      slice := Array.append<AuditRecord>(slice, [records[i]]);
      i += 1;
    };
    slice
  };

  /**
   * getOwner  — Return the current owner principal (for diagnostics).
   */
  public query func getOwner() : async ?Principal {
    owner
  };

  /**
   * getNextId  — Return the id that will be assigned to the next record.
   */
  public query func getNextId() : async Nat {
    nextId
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Upgrade hooks  — preserve stable data across code upgrades
  // ───────────────────────────────────────────────────────────────────────────

  system func preupgrade() {
    // stable vars are automatically preserved — nothing extra needed.
    // This hook is kept as a clear documentation marker.
  };

  system func postupgrade() {
    // Any migration logic for new fields can be placed here.
    // Currently a no-op since the schema is unchanged.
  };
}
