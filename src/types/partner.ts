// Partner types for Phase 17 - Partner Status Pages

export interface CreatePartnerInput {
  email: string;
  name: string;
}

export interface UpdatePartnerInput {
  name?: string;
  isActive?: boolean;
}

export interface PartnerWithAccess {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  statusPageAccess: Array<{
    statusPageId: string;
    statusPage: { id: string; name: string; slug: string };
    grantedAt: Date;
  }>;
}

export interface PartnerAccessGrant {
  id: string;
  partnerUserId: string;
  statusPageId: string;
  grantedById: string;
  grantedAt: Date;
  partnerUser?: {
    id: string;
    email: string;
    name: string;
  };
  statusPage?: {
    id: string;
    name: string;
    slug: string;
  };
}
