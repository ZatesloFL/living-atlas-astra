import {ROOMS} from './data.js';
import {personId,permission,roomTitle} from './permissions.js';

const fold=value=>String(value).normalize('NFKC').toLowerCase().replace(/[?.!,]/g,'').replace(/\s+/g,' ').trim();
export function holderReference(input){
 const text=fold(input);
 if(/\bwhere am i\b|\bmy (?:current )?(?:position|location)\b/.test(text))return 'location';
 if(/^(?:please )?(?:take|bring|go|send)(?: me)? back(?: to (?:the |my )?(?:entrance|start))?$/.test(text)||/^(?:back to (?:the |my )?entrance|my entrance)$/.test(text))return 'entrance';
 if(/^(?:please )?(?:(?:take|bring|send)(?: me)? |go )?(?:back )?(?:to )?home(?: please)?$/.test(text)||/\bmy (?:private )?(?:home|place|space|area)\b|\bwhere i started\b/.test(text))return 'home';
 if(/\bmy rooms\b/.test(text))return 'rooms';
 return null;
}
// Personal references do not fall through to Discovery, even if a record is missing.
export function resolveHolderDestination(input,lens,{profiles,room,position,entrance}={}){
 const kind=holderReference(input);if(!kind)return null;
 const holder=personId(lens),profile=profiles?.profiles?.find(p=>p.id===holder)??(profiles?.active?.()?.id===holder?profiles.active():null),starter=profiles?.arrivalRecords?.starter(holder);
 const own=Object.entries(ROOMS).filter(([,r])=>r.ownerId===holder&&permission(r,lens).canLook);
 const root=profile?.homePlaceId??starter?.projection?.rootPlaceId??null,home=own.find(([key,r])=>key===root||r.id===root)?.[0]??null;
 const result={source:'holder records',kind,holder,requested:String(input),matches:[],rule:'Your own records',query:'',exact:false};
 if(kind==='location')return {...result,room,position:position?{x:position.x,y:position.y,z:position.z}:null,message:ROOMS[room]?`You are in ${roomTitle(ROOMS[room],lens)} (${ROOMS[room].address}).`:'Your current Place is not available in this view.'};
 if(kind==='entrance'){const available=entrance?.holder===holder&&entrance.room===room;return {...result,entrance:available?entrance:null,message:available?`Your return is the entrance to ${roomTitle(ROOMS[room],lens)} for this visit. You can return in one action without crossing a door.`:'No entrance is recorded for this view. Nothing has moved.'};}
 const matches=(kind==='home'?own.filter(([key])=>key===home):own).map(([key,r])=>({room:key,title:r.title,why:key===home?'Your claimed home root':'A Place owned by this profile'}));
 return {...result,matches,message:matches.length?(kind==='home'?`Your home is ${matches[0].title}, from your own profile and arrival record.`:`These ${matches.length} Places belong to your profile.`):'No claimed home is recorded for this profile. Open Manage → See your space to start one; no Discovery search was made.'};
}
