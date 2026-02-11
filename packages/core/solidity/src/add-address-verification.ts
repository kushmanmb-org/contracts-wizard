import type { ContractBuilder } from './contract';
import { Access, requireAccessControl } from './set-access-control';
import { defineFunctions } from './utils/define-functions';
import { setNamespacedStorage, toStorageStructInstantiation } from './set-namespaced-storage';

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

  // Add event for address verification
  c.addConstantOrImmutableOrErrorDefinition(
    'event AddressVerified(address indexed account);',
    ['/// @dev Emitted when an address is verified']
  );

  // Add event for address revocation
  c.addConstantOrImmutableOrErrorDefinition(
    'event VerificationRevoked(address indexed account);',
    ['/// @dev Emitted when address verification is revoked']
  );

  // Add custom error for invalid signatures
  c.addConstantOrImmutableOrErrorDefinition(
    'error InvalidSignature();',
    ['/// @dev Error thrown when signature verification fails']
  );

  // Add custom error for already verified addresses
  c.addConstantOrImmutableOrErrorDefinition(
    'error AlreadyVerified();',
    ['/// @dev Error thrown when address is already verified']
  );

  // Add mapping to track verified addresses
  // Use namespaced storage for upgradeable contracts, regular state variable otherwise
  if (c.upgradeable) {
    setNamespacedStorage(c, ['mapping(address account => bool verified) _verifiedAddresses'], 'openzeppelin.storage');
  } else {
    c.addStateVariable(
      'mapping(address => bool) private _verifiedAddresses;',
      false
    );
  }

  // Add view function to check if an address is verified
  addIsAddressVerifiedFunction(c);

  // Add function to verify address ownership with signature
  addVerifyAddressOwnershipFunction(c);

  // Add function to revoke verification (only for access controlled contracts)
  if (access) {
    addRevokeAddressVerificationFunction(c, access);
  }
}

function addIsAddressVerifiedFunction(c: ContractBuilder) {
  const storageAccess = c.upgradeable ? `${toStorageStructInstantiation(c.name)}\n` : '';
  const verifiedAddressesAccess = c.upgradeable ? '$._verifiedAddresses[account]' : '_verifiedAddresses[account]';
  
  c.addFunctionCode(
    `${storageAccess}return ${verifiedAddressesAccess};`,
    functions.isAddressVerified
  );
}

function addVerifyAddressOwnershipFunction(c: ContractBuilder) {
  const storageAccess = c.upgradeable ? `${toStorageStructInstantiation(c.name)}\n` : '';
  const verifiedAddressesRef = c.upgradeable ? '$._verifiedAddresses' : '_verifiedAddresses';
  
  c.addFunctionCode(
    [
      storageAccess.trimEnd(),
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
      `if (${verifiedAddressesRef}[msg.sender]) {`,
      '    revert AlreadyVerified();',
      '}',
      '',
      '// Mark the address as verified',
      `${verifiedAddressesRef}[msg.sender] = true;`,
      '',
      '// Emit verification event',
      'emit AddressVerified(msg.sender);',
    ].filter(line => line !== '').join('\n'),
    functions.verifyAddressOwnership
  );
}

function addRevokeAddressVerificationFunction(c: ContractBuilder, access: Access) {
  requireAccessControl(c, functions.revokeAddressVerification, access, 'DEFAULT_ADMIN_ROLE');
  
  const storageAccess = c.upgradeable ? `${toStorageStructInstantiation(c.name)}\n` : '';
  const verifiedAddressesRef = c.upgradeable ? '$._verifiedAddresses' : '_verifiedAddresses';
  
  c.addFunctionCode(
    [
      storageAccess.trimEnd(),
      '// Revoke verification',
      `${verifiedAddressesRef}[account] = false;`,
      '',
      '// Emit revocation event',
      'emit VerificationRevoked(account);',
    ].filter(line => line !== '').join('\n'),
    functions.revokeAddressVerification
  );
}

const functions = defineFunctions({
  isAddressVerified: {
    kind: 'public' as const,
    args: [{ name: 'account', type: 'address' }],
    returns: ['bool'],
    mutability: 'view' as const,
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
    docs: {
      notice: 'Revoke address verification (admin only)',
      params: {
        account: 'The address to revoke verification for',
      },
    },
  },
});
