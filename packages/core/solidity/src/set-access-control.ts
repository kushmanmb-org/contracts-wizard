import type { ContractBuilder, BaseFunction } from './contract';
import { supportsInterface } from './common-functions';

export const accessOptions = [false, 'ownable', 'roles', 'managed'] as const;

export type Access = (typeof accessOptions)[number];

/**
 * Sets access control for the contract by adding inheritance.
 *
 * Security considerations:
 * - For 'ownable': Requires a valid initial owner address. Zero address is rejected by OpenZeppelin's Ownable.
 * - For 'roles': Requires a valid default admin address to prevent unmanageable contracts.
 * - For 'managed': Requires a valid initial authority address for the AccessManager pattern.
 */
export function setAccessControl(c: ContractBuilder, access: Access) {
  switch (access) {
    case 'ownable': {
      if (c.addParent(parents.Ownable, [{ lit: 'initialOwner' }])) {
        c.addConstructorArgument({
          type: 'address',
          name: 'initialOwner',
        });
        // Add explicit validation as defense-in-depth
        c.addConstructorCode('require(initialOwner != address(0), "Ownable: initial owner is zero address");');
      }
      break;
    }
    case 'roles': {
      if (c.addParent(parents.AccessControl)) {
        c.addConstructorArgument({
          type: 'address',
          name: 'defaultAdmin',
        });
        // Add explicit validation as defense-in-depth
        c.addConstructorCode('require(defaultAdmin != address(0), "AccessControl: default admin is zero address");');
        c.addConstructorCode('_grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);');
      }
      c.addOverride(parents.AccessControl, supportsInterface);
      break;
    }
    case 'managed': {
      if (c.addParent(parents.AccessManaged, [{ lit: 'initialAuthority' }])) {
        c.addConstructorArgument({
          type: 'address',
          name: 'initialAuthority',
        });
        // Add explicit validation as defense-in-depth
        c.addConstructorCode(
          'require(initialAuthority != address(0), "AccessManaged: initial authority is zero address");',
        );
      }
      break;
    }
  }
}

/**
 * Enables access control for the contract and restricts the given function with access control.
 *
 * Security considerations:
 * - Automatically defaults to 'ownable' if access is false for protected functions
 * - Validates role owner addresses when granting roles during construction
 * - Uses OpenZeppelin's audited access control modifiers
 */
export function requireAccessControl(
  c: ContractBuilder,
  fn: BaseFunction,
  access: Access,
  roleIdPrefix: string,
  roleOwner: string | undefined,
) {
  if (access === false) {
    access = 'ownable';
  }

  setAccessControl(c, access);

  switch (access) {
    case 'ownable': {
      c.addModifier('onlyOwner', fn);
      break;
    }
    case 'roles': {
      const roleId = roleIdPrefix + '_ROLE';
      const addedConstant = c.addConstantOrImmutableOrErrorDefinition(
        `bytes32 public constant ${roleId} = keccak256("${roleId}");`,
      );
      if (roleOwner && addedConstant) {
        c.addConstructorArgument({ type: 'address', name: roleOwner });
        // Add validation for role owner address
        c.addConstructorCode(`require(${roleOwner} != address(0), "AccessControl: role owner is zero address");`);
        c.addConstructorCode(`_grantRole(${roleId}, ${roleOwner});`);
      }
      c.addModifier(`onlyRole(${roleId})`, fn);
      break;
    }
    case 'managed': {
      c.addModifier('restricted', fn);
      break;
    }
  }
}

const parents = {
  Ownable: {
    name: 'Ownable',
    path: '@openzeppelin/contracts/access/Ownable.sol',
  },
  AccessControl: {
    name: 'AccessControl',
    path: '@openzeppelin/contracts/access/AccessControl.sol',
  },
  AccessManaged: {
    name: 'AccessManaged',
    path: '@openzeppelin/contracts/access/manager/AccessManaged.sol',
  },
};
