function recordDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return null;
  const day = value.slice(0,10);
  const calendarDay = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(calendarDay.valueOf()) || calendarDay.toISOString().slice(0,10)!==day) return null;
  const stamp=new Date(value);
  return Number.isNaN(stamp.valueOf()) ? null : stamp;
}

// Snapshots refer to the calendar day of their stored timestamp.
export function formatRecordDate(value,{locale}={}) {
  const stamp=recordDate(value);
  return stamp ? new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:'UTC'}).format(stamp) : null;
}

export function formatRecordDateTime(value,{locale,timeZone}={}) {
  const stamp=recordDate(value);
  return stamp ? new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone}).format(stamp) : null;
}

export function shortReceipt(id) {
  return typeof id === 'string' ? id.trim().split(':').at(-1).slice(0,8)||null : null;
}

// Callers supply only ancestor names that the current viewer may read.
export function placeAddressLabel(place,approvedAncestors=[]) {
  const names=[...approvedAncestors,place].map(part=>typeof part==='string'?part:part?.title);
  return names.filter(name=>typeof name==='string'&&name.trim()).map(name=>name.trim()).join(' › ') || 'Place';
}
