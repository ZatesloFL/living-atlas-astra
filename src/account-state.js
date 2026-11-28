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
  return accounts.get(subject.profileId)??subject.accountState??subject;
}
