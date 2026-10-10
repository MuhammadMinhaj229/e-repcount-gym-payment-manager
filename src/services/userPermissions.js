import { createPermissions } from '@/services/permissions';

export const PROFILES = {
  Admin_c: {
    label: 'Admin',
    isDefault: false,
    isPublic: false,
    canManageTeam: true,
    reportsTo: null,
  },
  Manager_c: {
    label: 'Manager',
    isDefault: false,
    isPublic: false,
    canManageTeam: false,
    reportsTo: 'Admin_c',
  },
  Staff_c: {
    label: 'Staff',
    isDefault: true,
    isPublic: false,
    canManageTeam: false,
    reportsTo: 'Manager_c',
  },
};

const TABLE_PERMISSIONS = {
  Admin_c: {
    plans_c: { access: 'Full' },
    gym_members_c: { access: 'Full' },
    membership_dues_c: { access: 'Full' },
    payments_c: { access: 'Full' },
  },
  Manager_c: {
    plans_c: { access: 'Full' },
    gym_members_c: { access: 'Full' },
    membership_dues_c: { access: 'Full' },
    payments_c: { access: 'Full' },
  },
  Staff_c: {
    plans_c: { access: 'Read' },
    gym_members_c: { access: 'Read' },
    membership_dues_c: { access: 'Read' },
    payments_c: { access: 'Read,Create' },
  },
};

export const { getProfileMeta, getTableAccess, getFieldAccess } =
  createPermissions(PROFILES, TABLE_PERMISSIONS);
