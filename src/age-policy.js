// Declared predicates only. Prototype verification is simulated; no birthdate is stored here.
const bound = (value, side) => value && Object.keys(value).length === 2 &&
 ['lower', 'upper'].includes(side) && (side === 'lower' ? ['gte', 'gt'] : ['lte', 'lt']).includes(value.op) &&
 Number.isInteger(value.years) && value.years >= 0;
export function validAgeBand(band) {
 if (!band || typeof band !== 'object' || !Object.keys(band).length ||
  Object.keys(band).some(key => !['lower', 'upper'].includes(key) || !bound(band[key], key))) return false;
 const lower = band.lower ? band.lower.years + (band.lower.op === 'gt' ? 1 : 0) : 0;
 const upper = band.upper ? band.upper.years - (band.upper.op === 'lt' ? 1 : 0) : Infinity;
 return lower <= upper;
}
export function ageRuleText(rule) {
 if (!rule) return 'No additional age rule declared';
 if (!validAgeBand(rule.band)) return 'Invalid declared age rule';
 const signs = {gte: '≥', gt: '>', lte: '≤', lt: '<'};
 return 'Age ' + ['lower', 'upper'].filter(key => rule.band[key]).map(key => signs[rule.band[key].op] + ' ' + rule.band[key].years).join(' and ');
}
export function ageDoorPolicy(rule, lens) {
 if (!rule) return {blocked: false, declared: false, description: ageRuleText(rule)};
 const valid = Object.keys(rule).every(key => ['band', 'guardianExceptionBand'].includes(key)) && validAgeBand(rule.band) &&
  (rule.guardianExceptionBand === undefined || validAgeBand(rule.guardianExceptionBand));
 const known = lens.identity?.backing === 'verified' && Number.isInteger(lens.age) && lens.age >= 13;
 const predicates = {gte: (a,b) => a >= b, gt: (a,b) => a > b, lte: (a,b) => a <= b, lt: (a,b) => a < b};
 const allowed = valid && known && Object.values(rule.band).every(b => predicates[b.op](lens.age, b.years));
 // Guardian exception grants require the future account rails. Merely declaring an alternate band grants nothing.
 return {blocked: !allowed, declared: true, valid, known, description: ageRuleText(rule),
  reason: !valid ? 'Invalid declared age rule' : !known ? 'Age unknown; the declared age rule cannot be satisfied' : !allowed ? 'Declared age rule is not satisfied' : null};
}
