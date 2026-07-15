export const registrySourceHasEvidenceLink = (
  canonicalUrl: string,
  sourceId: string,
  candidateAssociationUrls: ReadonlySet<string>,
  policySourceIds: ReadonlySet<string>,
) => candidateAssociationUrls.has(canonicalUrl) || policySourceIds.has(sourceId);
