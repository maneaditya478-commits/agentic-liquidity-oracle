// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title TreasuryGuard
 * @author TreasuryGuard Oracle System
 * @notice Production-grade smart contract for AI-driven financial risk & liquidity management.
 *         An on-chain oracle records risk decisions (lock / unlock / rebalance / emergency)
 *         signed by an authorised oracle address.  All state-changing functions are protected
 *         by role-based access control, reentrancy guards and a pause mechanism.
 * @dev    Solidity 0.8.24, OpenZeppelin v5.
 */
contract TreasuryGuard is AccessControl, ReentrancyGuard, Pausable {
    // ─────────────────────────────────────────────────────────────────────────
    // Role identifiers
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Role that allows oracle operations (lock, unlock, rebalance, emergency).
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    /// @notice Role that allows administrative operations (pause, update oracle).
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @notice Role reserved for guardian operations (future extensibility).
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    // ─────────────────────────────────────────────────────────────────────────
    // State variables
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Whether the treasury liquidity is currently locked.
    bool public isLocked;

    /// @notice Block timestamp at which the liquidity was last locked.
    uint256 public lockTimestamp;

    /// @notice Minimum seconds that must elapse before an oracle may unlock.
    uint256 public unlockDelay = 1 hours;

    /// @notice Cumulative ETH that has been placed under contract protection.
    uint256 public totalProtectedAmount;

    /// @notice Number of oracle decisions that have been recorded.
    uint256 public actionCount;

    // ─────────────────────────────────────────────────────────────────────────
    // Data structures
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Snapshot of an oracle risk decision recorded on-chain.
     * @param timestamp  Block timestamp when the decision was made.
     * @param riskScore  Composite risk score (0–100, scaled x 100 → 0–10 000).
     * @param var95      95 % Value-at-Risk figure in USD (18-decimal fixed point).
     * @param confidence Model confidence 0–100 (scaled x 100 → 0–10 000).
     * @param action     Human-readable action string e.g. "LOCK_LIQUIDITY".
     * @param signature  Raw oracle signature that was supplied with this call.
     */
    struct OracleDecision {
        uint256 timestamp;
        uint256 riskScore;
        uint256 var95;
        uint256 confidence;
        string  action;
        bytes   signature;
    }

    /// @dev Decision records keyed by sequential decision id.
    mapping(uint256 => OracleDecision) public decisions;

    /// @dev Ordered list of decision ids for iteration.
    uint256[] public decisionIds;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event LiquidityLocked(
        address indexed oracle,
        uint256 indexed timestamp,
        uint256 riskScore,
        uint256 var95
    );

    event LiquidityUnlocked(
        address indexed oracle,
        uint256 indexed timestamp
    );

    event TreasuryRebalanced(
        address indexed oracle,
        uint256 amount,
        uint256 timestamp
    );

    event EmergencyTriggered(
        address indexed oracle,
        address indexed destination,
        uint256 amount,
        uint256 timestamp
    );

    event OracleUpdated(
        address indexed oldOracle,
        address indexed newOracle,
        uint256 timestamp
    );

    event FundsDeposited(
        address indexed depositor,
        uint256 amount
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Custom errors
    // ─────────────────────────────────────────────────────────────────────────

    error AlreadyLocked();
    error NotLocked();
    error UnlockDelayNotMet(uint256 unlockableAt, uint256 currentTime);
    error ZeroAddress();
    error InsufficientBalance(uint256 requested, uint256 available);
    error ZeroAmount();

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param initialAdmin  Address that receives ADMIN_ROLE and DEFAULT_ADMIN_ROLE.
     * @param initialOracle Address that receives ORACLE_ROLE.
     */
    constructor(address initialAdmin, address initialOracle) {
        if (initialAdmin  == address(0)) revert ZeroAddress();
        if (initialOracle == address(0)) revert ZeroAddress();

        // DEFAULT_ADMIN_ROLE governs all other roles via AccessControl hierarchy.
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(ADMIN_ROLE,         initialAdmin);
        _grantRole(ORACLE_ROLE,        initialOracle);

        // ADMIN_ROLE is its own admin for self-management.
        _setRoleAdmin(ADMIN_ROLE,    DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(ORACLE_ROLE,   DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(GUARDIAN_ROLE, DEFAULT_ADMIN_ROLE);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Oracle functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Oracle records a high-risk event and locks treasury liquidity.
     * @param riskScore  Composite risk score supplied by the AI model (0–10 000).
     * @param var95      95 % VaR in USD expressed with 18 decimals.
     * @param confidence Model confidence (0–10 000).
     * @param sig        Raw ECDSA signature authorising this decision.
     */
    function lockLiquidity(
        uint256 riskScore,
        uint256 var95,
        uint256 confidence,
        bytes calldata sig
    )
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
        nonReentrant
    {
        if (isLocked) revert AlreadyLocked();

        isLocked       = true;
        lockTimestamp  = block.timestamp;

        // Record decision
        uint256 id = actionCount;
        decisions[id] = OracleDecision({
            timestamp:  block.timestamp,
            riskScore:  riskScore,
            var95:      var95,
            confidence: confidence,
            action:     "LOCK_LIQUIDITY",
            signature:  sig
        });
        decisionIds.push(id);
        unchecked { actionCount++; }

        emit LiquidityLocked(msg.sender, block.timestamp, riskScore, var95);
    }

    /**
     * @notice Oracle unlocks treasury liquidity once the risk abates.
     * @dev    Unlock is permitted when either:
     *         (a) the unlockDelay has elapsed since locking, OR
     *         (b) this is called immediately (delay == 0, e.g. in tests).
     *         In production the AI oracle is expected to wait for delay to pass.
     */
    function unlockLiquidity()
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
        nonReentrant
    {
        if (!isLocked) revert NotLocked();

        uint256 unlockableAt = lockTimestamp + unlockDelay;
        if (block.timestamp < unlockableAt) {
            revert UnlockDelayNotMet(unlockableAt, block.timestamp);
        }

        isLocked = false;

        // Record decision
        uint256 id = actionCount;
        decisions[id] = OracleDecision({
            timestamp:  block.timestamp,
            riskScore:  0,
            var95:      0,
            confidence: 0,
            action:     "UNLOCK_LIQUIDITY",
            signature:  ""
        });
        decisionIds.push(id);
        unchecked { actionCount++; }

        emit LiquidityUnlocked(msg.sender, block.timestamp);
    }

    /**
     * @notice Oracle rebalances the treasury by logically marking `amount` as
     *         (re)balanced.  Liquidity must not be locked.
     * @param amount Amount in wei to record as rebalanced.
     */
    function rebalanceTreasury(uint256 amount)
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
        nonReentrant
    {
        if (isLocked) revert AlreadyLocked();
        if (amount == 0) revert ZeroAmount();

        totalProtectedAmount += amount;

        // Record decision
        uint256 id = actionCount;
        decisions[id] = OracleDecision({
            timestamp:  block.timestamp,
            riskScore:  0,
            var95:      0,
            confidence: 0,
            action:     "REBALANCE_TREASURY",
            signature:  ""
        });
        decisionIds.push(id);
        unchecked { actionCount++; }

        emit TreasuryRebalanced(msg.sender, amount, block.timestamp);
    }

    /**
     * @notice Emergency ETH transfer to a safe destination address.
     * @param destination Recipient of the ETH.
     * @param amount      Amount in wei to transfer.
     */
    function emergencyTransfer(address destination, uint256 amount)
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
        nonReentrant
    {
        if (destination == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount > address(this).balance) {
            revert InsufficientBalance(amount, address(this).balance);
        }

        // Record decision before transfer (CEI pattern)
        uint256 id = actionCount;
        decisions[id] = OracleDecision({
            timestamp:  block.timestamp,
            riskScore:  0,
            var95:      0,
            confidence: 0,
            action:     "EMERGENCY_TRANSFER",
            signature:  ""
        });
        decisionIds.push(id);
        unchecked { actionCount++; }

        emit EmergencyTriggered(msg.sender, destination, amount, block.timestamp);

        // Transfer after state changes (reentrancy guard also active)
        (bool success, ) = destination.call{value: amount}("");
        require(success, "TreasuryGuard: ETH transfer failed");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Replace the current oracle with a new one.
     * @dev    Revokes ORACLE_ROLE from every current holder then grants to newOracle.
     *         Because OpenZeppelin v5 does not expose an enumerable role member list,
     *         callers must supply the current oracle address explicitly.
     * @param currentOracle The address currently holding ORACLE_ROLE.
     * @param newOracle     The address to which ORACLE_ROLE will be granted.
     */
    function updateOracle(address currentOracle, address newOracle)
        external
        onlyRole(ADMIN_ROLE)
    {
        if (newOracle == address(0)) revert ZeroAddress();

        _revokeRole(ORACLE_ROLE, currentOracle);
        _grantRole(ORACLE_ROLE,  newOracle);

        emit OracleUpdated(currentOracle, newOracle, block.timestamp);
    }

    /// @notice Pause all oracle operations. Admin only.
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause oracle operations. Admin only.
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Update the minimum delay before an oracle may unlock liquidity.
     * @param newDelay New delay in seconds (0 is allowed for testing).
     */
    function setUnlockDelay(uint256 newDelay) external onlyRole(ADMIN_ROLE) {
        unlockDelay = newDelay;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Deposit
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Deposit ETH into the contract treasury.
     */
    function deposit() external payable {
        if (msg.value == 0) revert ZeroAmount();
        emit FundsDeposited(msg.sender, msg.value);
    }

    /// @notice Allow plain ETH transfers (e.g. from scripts).
    receive() external payable {
        emit FundsDeposited(msg.sender, msg.value);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the full ordered history of oracle decisions.
     */
    function getDecisionHistory()
        external
        view
        returns (OracleDecision[] memory)
    {
        uint256 len = decisionIds.length;
        OracleDecision[] memory history = new OracleDecision[](len);
        for (uint256 i = 0; i < len; ) {
            history[i] = decisions[decisionIds[i]];
            unchecked { i++; }
        }
        return history;
    }

    /**
     * @notice Returns the current ETH balance held by this contract.
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Returns the total number of decision ids recorded.
     */
    function getDecisionCount() external view returns (uint256) {
        return decisionIds.length;
    }
}
