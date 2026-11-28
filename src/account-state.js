// Local profile previews are the account truth in this prototype. Developer
// overrides simulate access only; they never rewrite an account badge.
const accounts=new Map();
let helpers=()=>[];
export function helperIdentitySource(read){helpers=read;}
export function accountSnapshot(profile){
  return {profileId:profile.profileId??profile.id,name:profile.name,identity:structuredClone(profile.identity),age:profile.age,isAgent:!!profile.isAgent,isTest:!!profile.isTest};
}
export function rememberAccounts(profiles){for(const profile of profiles)accounts.set(profile.id,accountSnapshot(profile));}
export function accountSubject(subject){
  if(subject.isAgent&&subject.id){const actor=helpers().find(a=>a.id===subject.id);if(actor)return actor;}
  const current=accounts.get(subject.profileId)??subject.accountState??subject;
  // Assurance is current account truth; recorded authorship is historical.
  const a=subject.authorship;
  return a?{...current,name:a.name,authorship:a,identity:{...current.identity,display:a.display,...(a.pseudonym?{pseudonym:a.pseudonym}:{})}}:current;
}
export function authorshipSnapshot(profile){
 const snapshot=accountSnapshot(accountSubject(profile)),i=snapshot.identity;
 const name=i.display==='anonymous'?'Anonymous':i.display==='pseudonym'?(i.pseudonym||snapshot.name):snapshot.name;
 const {pseudonym,...identity}=i;
 if(i.display==='pseudonym')identity.pseudonym=name;
 return {...snapshot,name,identity,authorship:{display:i.display,name,...(i.display==='pseudonym'?{pseudonym:name}:{})}};
}
