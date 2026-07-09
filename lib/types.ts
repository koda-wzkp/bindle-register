export type ProductionStatus = 'draft' | 'open_for_signing' | 'registered' | 'superseded';

export interface OrganizationRow {
  id: string;
  name: string;
  created_at: string;
}

export interface PersonRow {
  id: string;
  org_id: string;
  full_name: string;
  email: string;
  created_at: string;
}

export interface ProductionRow {
  id: string;
  org_id: string;
  title: string;
  parent_production_id: string | null;
  revision: number;
  status: ProductionStatus;
  pool_definition: string;
  commons_recipient: string;
  commons_bps: number;
  run_opens: string | null;
  run_closes: string | null;
  created_at: string;
}

export interface ContributionRow {
  id: string;
  production_id: string;
  person_id: string;
  role: string;
  share_bps: number;
  is_principal: boolean;
}

export interface SignatureRow {
  id: string;
  contribution_id: string;
  content_hash: string;
  consent_text_version: string;
  typed_name: string;
  signed_at: string;
  ip: string | null;
  user_agent: string | null;
}

export interface RegistrationRow {
  id: string;
  production_id: string;
  canonical_json: unknown;
  content_hash: string;
  buid: string;
  glyph_svg: string;
  registered_at: string;
}

export interface ContributionWithPerson extends ContributionRow {
  person: PersonRow;
  signature: SignatureRow | null;
}

export interface ProductionDetail {
  production: ProductionRow;
  org: OrganizationRow;
  contributions: ContributionWithPerson[];
  registration: RegistrationRow | null;
  parentRegistration: RegistrationRow | null;
}

/** Payload the admin builder submits for create/update of a draft. */
export interface ProductionDraftInput {
  title: string;
  pool_definition: string;
  commons_recipient: string;
  commons_bps: number;
  run_opens: string | null;
  run_closes: string | null;
  contributors: Array<{
    full_name: string;
    email: string;
    role: string;
    share_bps: number;
    is_principal: boolean;
  }>;
}
