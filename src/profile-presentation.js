export const STARTING_PRESENTATION='You start with your name showing. You can change this later in your profile.';
export function presentationRequest(words,identity={}){
 const text=String(words??'').trim();
 if(/^(?:please\s+)?(?:show no name|hide my name|(?:use |switch to |make me )?anonymous(?: presentation)?)[.!]?$/i.test(text))return {display:'anonymous'};
 if(/^(?:please\s+)?(?:show my name|use my (?:own|real) name|(?:use |switch to |make me )?named(?: presentation)?)[.!]?$/i.test(text))return {display:'real'};
 const match=text.match(/^(?:please\s+)?(?:use (?:the name |a different name[: ]+)?|call me |(?:my )?pseudonym (?:is |: ?))(.+?)\s*[.!]?$/i);
 if(match){const name=match[1].replace(/^[“"']|[”"']$/g,'').trim();if(name&&name.length<=40&&!/^(?:anonymous|named|pseudonymous)(?: presentation)?$/i.test(name))return {display:'pseudonym',pseudonym:name};}
 if(/^(?:use |switch to )?pseudonymous(?: presentation)?[.!]?$/i.test(text)&&identity.pseudonym)return {display:'pseudonym',pseudonym:identity.pseudonym};
 throw new Error('Say “show my name”, “show no name”, or “use the name …” with the name you want people to see.');
}
export function publicName(profile){const i=profile.identity??{};return i.display==='anonymous'?'Visitor':i.display==='pseudonym'?(i.pseudonym||profile.name):profile.name;}
export function presentationWords(profile){const i=profile.identity??{};return i.display==='anonymous'?'Your name is hidden. You appear as a visitor.':i.display==='pseudonym'?`People see you as ${publicName(profile)}.`:`Your name is showing: ${profile.name}.`;}
