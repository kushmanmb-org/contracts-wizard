import type { ContractBuilder } from './contract';
import { Access, requireAccessControl } from './set-access-control';
import { defineFunctions } from './utils/define-functions';

export function addAddressVerification(c: ContractBuilder, access: Access): void {
  // Add ECDSA library for signature verification
  c.addImportOnly({
    name: 'ECDSA',
    path: '@openzeppelin/contracts/utils/cryptography/ECDSA.sol',
  });

  // Add MessageHashUtils for EIP-191 and EIP-712 message hashing
  c.addImportOnly({
    name: 'MessageHashUtils',
    path: '@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol',
  });

  // Add mapping to track verified addresses
  c.addVariable(`
    // Mapping to track addresses that have been verified
    mapping(address => bool) private _verifiedAddresses;
  `);

  // Add event for address verification
  c.addVariable(`
    // Event emitted when an address is verified
    event AddressVerified(address indexed account);
  `);

  // Add event for address revocation
  c.addVariable(`
    // Event emitted when address verification is revoked
    event VerificationRevoked(address indexed account);
  `);

  // Add custom error for invalid signatures
  c.addVariable(`
    // Error thrown when signature verification fails
    error InvalidSignature();
  `);

  // Add custom error for already verified addresses
  c.addVariable(`
    // Error thrown when address is already verified
    error AlreadyVerified();
  `);

  // Add view function to check if an address is verified
  c.addFunction(functions.isAddressVerified);

  // Add function to verify address ownership with signature
  c.addFunction(functions.verifyAddressOwnership);

  // Add function to revoke verification (only for access controlled contracts)
  if (access) {
    requireAccessControl(c, functions.revokeAddressVerification, access, 'DEFAULT_ADMIN_ROLE');
  }
}

const functions = defineFunctions({
  isAddressVerified: {
    kind: 'public' as const,
    args: [{ name: 'account', type: 'address' }],
    returns: ['bool'],
    code: [
      'return _verifiedAddresses[account];',
    ],
    docs: {
      notice: 'Check if an address has been verified',
      params: {
        account: 'The address to check',
      },
      returns: {
        _0: 'True if the address is verified, false otherwise',
      },
    },
  },

  verifyAddressOwnership: {
    kind: 'public' as const,
    args: [
      { name: 'message', type: 'bytes32' },
      { name: 'signature', type: 'bytes' },
    ],
    code: [
      '// Hash the message according to EIP-191',
      'bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(message);',
      '',
      '// Recover the signer address from the signature',
      'address recoveredAddress = ECDSA.recover(ethSignedMessageHash, signature);',
      '',
      '// Check if the recovered address matches the sender',
      'if (recoveredAddress != msg.sender) {',
      '    revert InvalidSignature();',
      '}',
      '',
      '// Check if already verified',
      'if (_verifiedAddresses[msg.sender]) {',
      '    revert AlreadyVerified();',
      '}',
      '',
      '// Mark the address as verified',
      '_verifiedAddresses[msg.sender] = true;',
      '',
      '// Emit verification event',
      'emit AddressVerified(msg.sender);',
    ],
    docs: {
      notice: 'Verify address ownership by providing a signature',
      details: 'The caller must provide a signature of a message signed with their private key. The signature is verified to ensure the caller controls the private key associated with their address. This allows verification of address ownership without exposing the private key.',
      params: {
        message: 'The original message that was signed',
        signature: 'The signature of the message, signed by the caller',
      },
    },
  },

  revokeAddressVerification: {
    kind: 'public' as const,
    args: [{ name: 'account', type: 'address' }],
    code: [
      '// Revoke verification',
      '_verifiedAddresses[account] = false;',
      '',
      '// Emit revocation event',
      'emit VerificationRevoked(account);',
    ],
    docs: {
      notice: 'Revoke address verification (admin only)',
      params: {
        account: 'The address to revoke verification for',
      },
    },
  },
});
