type SessionUserClaims = {
  sub: string;
  orgClaims?: string[];
  is_platform_admin?: boolean;
};

export type DbSessionContext = {
  currentUserId: string;
  supplierOrgIds: string[];
  isPlatformAdmin: boolean;
  sqlStatements: string[];
};

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Phase 1.3.5 DB Session Claim Propagation
 */
export class DbSessionService {
  static buildContext(claims: SessionUserClaims): DbSessionContext {
    const currentUserId = String(claims.sub || '');
    const supplierOrgIds = Array.isArray(claims.orgClaims) ? claims.orgClaims.map(String) : [];
    const isPlatformAdmin = Boolean(claims.is_platform_admin);

    const orgArrayLiteral = `{${supplierOrgIds.map((orgId) => `"${orgId.replace(/"/g, '\\"')}"`).join(',')}}`;
    const sqlStatements = [
      `SET LOCAL app.current_user_id = '${escapeSqlLiteral(currentUserId)}';`,
      `SET LOCAL app.current_user_supplier_org_ids = '${escapeSqlLiteral(orgArrayLiteral)}';`,
      `SET LOCAL app.is_platform_admin = '${isPlatformAdmin ? 'true' : 'false'}';`,
    ];

    return {
      currentUserId,
      supplierOrgIds,
      isPlatformAdmin,
      sqlStatements,
    };
  }
}

