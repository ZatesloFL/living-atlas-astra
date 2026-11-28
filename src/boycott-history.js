// Authored evidence for the boycott hall. Archive links are references to records.
const source=(label,url,status)=>({label,url,status});
const fsu=source('FSU Department of History · The Story of the Tallahassee Bus Boycott',
 'https://history.fsu.edu/article/black-history-month-story-tallahassee-bus-boycott','Historical account');
const marker=source('Florida Division of Historical Resources · Tallahassee Bus Boycott marker',
 'https://apps.flheritage.com/markers/markerDetail.cfm?city=&county=leon&id=327&keyword=','Historical marker');
const field=source('Charles U. Smith and Lewis M. Killian · The Tallahassee Bus Protest (1958)',
 'https://www.bjpa.org/content/upload/bjpa/fiel/FIELD%20REPORTS%20ON%20DESEGREGATION%20IN%20THE%20SOUTH%20TALLAHASSEE%20FL.pdf','Field report');
const minutes=source('State Archives of Florida · Reports of Inter-Civic Council meetings, July–September 1956',
 'https://www.floridamemory.com/items/show/339576','Archival record');
const steele=source('Stanford King Institute · C. Kenzie Steele’s October 23, 1956 letter to Martin Luther King Jr.',
 'https://kinginstitute.stanford.edu/king-papers/documents/c-kenzie-steele','Contemporary letter');
const demands=source('Stanford King Institute · The Inter-Civic Council presents its demands',
 'https://kinginstitute.stanford.edu/tallahassees-inter-civic-council-presents-demands-boycott-gains-momentum','Documented chronology');
const education=source('Florida Memory · The Tallahassee Bus Boycott',
 'https://www.floridamemory.com/learn/classroom/learning-units/civil-rights/tallahasseebusboycott/','State Archives teaching collection');
const legal=source('Library of Congress · Bus seating petition of Johnny Herndon and Leonard Daniel Speed',
 'https://tile.loc.gov/storage-services/service/mss/mss65570/ms/s6/55/70/-2/19/13/mss65570-21913/mss65570-21913.pdf','Contemporary court filing');

export const BOYCOTT_SUMMARY='In 1956, Black residents of Tallahassee boycotted the city’s segregated public bus service. Follow the students who sparked the protest, the people who kept it going and the struggle over who could sit where.';
export const BOYCOTT_PASSAGES={
 film:{title:'The students who sparked the boycott',body:'In late May 1956, Florida A&M students Wilhelmina Jakes and Carrie Patterson took the available seats in the white section of a crowded Tallahassee bus. The driver ordered them to move to the rear, where there was standing room only. They refused, and police arrested them. FAMU students responded by voting to stop riding the buses. Black residents then met at Bethel Baptist Church and voted to extend the boycott across the city.',
  sources:[fsu,field,marker],aliases:['context','context-heading','spark','spark-heading']},
 'archive-image':{title:'How Tallahassee kept moving',body:'Staying off the buses took daily work. The Inter-Civic Council organized a carpool so people without cars could still get to work. Participants also walked or found rides with neighbors. Meeting reports from Black churches record drivers, expenses and appeals for donations. With many regular riders withholding their fares, the transit company stopped service at the start of July 1956. It returned in August and hired Black drivers on the FAMU–Frenchtown run, while segregated seating continued.',
  sources:[minutes,field],aliases:['organizing','organizing-heading']},
 'oral-history':{title:'The Inter-Civic Council and C. K. Steele',body:'The Inter-Civic Council led the citywide Tallahassee bus boycott. Its elected president was Rev. C. K. Steele, pastor of Bethel Baptist Church. Students Wilhelmina Jakes and Carrie Patterson sparked the protest, and students and residents helped sustain it. The council called for seating on a first-come basis, courteous treatment and the hiring of Black drivers. Rev. Daniel B. Speed was among the other organizers who helped lead the campaign.',
  sources:[steele,demands,fsu]},
 'sample-clipping':{title:'Pressure, prosecution and resistance',body:'Police targeted the carpool that kept the boycott going. In October 1956, a municipal court convicted 21 people in connection with operating the carpool without the required authority. Writing to Martin Luther King Jr. on October 23, Steele described the convictions and reported that the boycott continued. Later that December, Steele and other riders tested the color line by sitting away from the rear. White intimidation and violence continued as 1957 began.',
  sources:[steele,field,education]},
 'bus-model':{title:'What the boycott changed',body:'The boycott helped end the city’s explicit racial seating rule. The question then became who decided where a passenger could sit. Tallahassee’s January 7, 1957 ordinance gave that decision to the driver. Riders challenged the replacement rule, and police arrested some of them. Over the following months Black riders gradually returned as seat assignments were enforced less strictly. Florida Memory dates integration on the city buses to the summer of 1957.',
  sources:[field,legal,fsu,education]},
};
export const BOYCOTT_READING={
 title:'From repeal to integrated buses',
 body:'The Tallahassee bus boycott helped end legally segregated seating on the city’s buses. On January 7, 1957, the city repealed its explicit segregation ordinance and gave drivers the power to assign seats. Riders who challenged that rule still faced arrest. Enforcement of assigned seating eased over the following months as Black riders returned. Florida Memory dates integration on Tallahassee’s buses to summer 1957.',
 sources:[field,legal,fsu,education],
};

function authored(id,title,type,body,sources,importance='supporting',aliases=[]){
 return {id,title,type,body,sources,importance,reps:{text:typeof body==='string'?body:'',alt:''},
  ...(type==='text'?{sectionHeading:true}:{}),...(aliases.length?{aliases}:{})};
}
const passage=(id,title,body,sources,importance,aliases)=>authored(id,title,'text',body,sources,importance,aliases);

export const BOYCOTT_ARTICLE=[
 passage('sample','About this exhibit','Five bays follow the 1956–57 protest through archival records and historical research. The exhibit uses original illustrations, a reading spoken by your device and a seating diagram to help explain the record.',[field,education],'core'),
 authored('facts','The boycott in brief','infobox',{Place:'Tallahassee, Florida',Period:'1956–1957',Focus:'A campaign for equal treatment on the city buses'},[fsu,education],'core'),
 passage('lead','The Tallahassee bus boycott at a glance',BOYCOTT_SUMMARY,[fsu,field],'core'),
 passage('outcomes',BOYCOTT_READING.title,BOYCOTT_READING.body,BOYCOTT_READING.sources,'core',['outcomes-heading']),
 authored('route-map','Tallahassee reference point','map',{lat:30.4383,lng:-84.2807,label:'Downtown Tallahassee',status:'Approximate city reference',note:'The point gives the city location. The boycott’s carpools served people making many different journeys.'},[field],'detail'),
 authored('timeline','The boycott, month by month','timeline',[
  {date:'Late May 1956',text:'The arrests of Jakes and Patterson prompt a student boycott. A community meeting votes to join it and forms the Inter-Civic Council.'},
  {date:'July–August 1956',text:'Bus service stops and then returns. The operator hires Black drivers on the FAMU–Frenchtown run.'},
  {date:'October 1956',text:'A municipal court convicts 21 people in connection with the boycott carpool. The boycott continues.'},
  {date:'January 1957',text:'The city repeals its explicit racial seating rule, replacing it with driver-assigned seating. Riders test the new rule.'},
  {date:'Summer 1957',text:'Florida Memory dates integration of the city buses to this summer.'},
 ],[field,steele,education]),
 passage('memory','Reading dates in the record','The Florida historical marker gives May 26 for the students’ arrest. The FSU Department of History account gives May 27. This exhibit uses late May where the accounts differ and distinguishes the January ordinance from the change in everyday riding over subsequent months.',[marker,fsu,field,education],'detail',['memory-heading']),
 authored('research-note','Questions to take to the records','quote',{text:'What does a meeting report tell you about the boycott? What might a rider remember that a court filing leaves out?',attribution:'Exhibit reading question'},[minutes,legal],'detail'),
 authored('related-capitol','The two Capitols','link',{room:'capitol',label:'Explore the two Capitols',note:'Another public Place in Tallahassee.'},[]),
 authored('related-cascades','Cascades Park','link',{room:'cascades',label:'Explore Cascades Park',note:'Another public Place in Tallahassee.'},[]),
 ...[education,field,steele].map((record,index)=>authored('citation-'+index,record.label,'citation',record,[],'detail',index===0?['references-heading']:[])),
];
export const BOYCOTT_TEXTBOOK=[
 passage('kids-label','Reading the boycott','A boycott is a way of asking for change by choosing not to use a service. The three exhibit bays in this view follow the students, the people who shared rides, and the rule that changed.',[fsu,education],'core'),
 authored('kids-info','The boycott in brief','infobox',{Place:'Tallahassee, Florida',Period:'1956–1957',Topic:'Fair treatment on the buses'},[education],'core'),
 passage('kids-lead','The Tallahassee bus boycott at a glance','A boycott means choosing not to use a service to ask for change. In 1956, Black residents of Tallahassee stopped riding the city buses to challenge unfair seating rules.',[fsu,education],'core'),
 passage('oral-history',BOYCOTT_PASSAGES['oral-history'].title,'The Inter-Civic Council led the citywide boycott. Rev. C. K. Steele was its president. Students Wilhelmina Jakes and Carrie Patterson sparked the protest. Students and residents kept it going together.',[steele,demands,fsu],'core'),
 passage('outcomes',BOYCOTT_READING.title,'The boycott helped change where people could sit on Tallahassee’s buses. In January 1957, the city dropped the rule that separated riders by race but let drivers decide where people sat. It took months for the buses to become integrated. Florida Memory dates that change to summer 1957.',BOYCOTT_READING.sources,'core',['outcomes-heading']),
 {...BOYCOTT_ARTICLE.find(block=>block.id==='timeline'),id:'kids-timeline'},
 {...BOYCOTT_ARTICLE.find(block=>block.id==='route-map'),id:'kids-map'},
 passage('kids-question','Why did the boycott need a carpool?','Compare the bus company’s service with the carpool that the Inter-Civic Council organized. Think about who had to keep getting to work during the boycott.',[minutes,field],'detail'),
 authored('kids-citation',education.label,'citation',education,[]),
];
export const BOYCOTT_IMMERSIVE_NOTE=passage('immersive-placeholder','Following the court record','The petition by Johnny Herndon and Leonard Daniel Speed gives the riders’ account of how police enforced the January seat-assignment rule. Read it alongside the 1958 field report to see the difference between a law on paper and an arrest on a bus.',[legal,field],'detail');
