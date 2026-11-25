// Keep persisted preference keys and filtering semantics; give their records
// explicit display labels. Legacy reviews are not renamed as standing facets.
export const RECORD_LABELS={Author:'Author',Vouched:'Endorsements on file',Academic:'Academic reviewers',Community:'Community reviewers'};
export const recordLabel=key=>RECORD_LABELS[key]??key;
export const layerModeLabel=key=>key==='Vouched'?'Endorsements on file':key;
export const PRESENTATION_LABELS={real:'Named',pseudonym:'Pseudonymous',anonymous:'Anonymous presentation',agent:'Agents (dim only)'};
