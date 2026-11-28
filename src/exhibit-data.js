import {scores,pair} from './scores.js';
import {behavior,validateComponent} from './kit.js';
import {BOYCOTT_PASSAGES} from './boycott-history.js';

export const SAMPLE_LABEL='Sample media · real archive to connect';
const illustrationCredit='Original exhibit illustration by Living Atlas';
const photo=(title,scene,alt,caption)=>({title,scene,alt,caption,credit:illustrationCredit});
const slides=[
 {title:'Riding under segregation',caption:'Tallahassee’s city buses separated riders by race.',scene:0},
 {title:'Two students refuse to move',caption:'In late May 1956, Wilhelmina Jakes and Carrie Patterson refused to move to the back of a crowded bus.',scene:1},
 {title:'The campus responds',caption:'After police arrested the two riders, Florida A&M students voted to stop using the city buses.',scene:2},
 {title:'The citywide boycott begins',caption:'Black residents met at Bethel Baptist Church and voted to extend the boycott.',scene:3},
];
const photos=[
 photo('The bus network',0,'Stylized city bus on a road','Riders’ fares financed the bus service. Withholding those fares put pressure on the transit company.'),
 photo('The daily journey',1,'Illustration of a passenger shelter','People still needed a way to get to work when they stopped taking the bus.'),
 photo('Walking together',2,'Illustration of several people walking','Walking and sharing private rides let people stay off the buses.'),
 photo('Organizing the carpool',3,'Illustration of a meeting table and lists','The Inter-Civic Council organized a carpool. Its meeting reports record transport costs and requests for donations.'),
 photo('Meetings and records',4,'Illustration of an open book','Church meetings provided a place to plan and raise money. The surviving reports describe that work.'),
 photo('Service returns',5,'Stylized city buildings','The company resumed bus service in August 1956 and hired Black drivers on the FAMU–Frenchtown run.'),
];
const cues=[
 'The Inter-Civic Council led the citywide Tallahassee bus boycott.',
 'Its elected president was Reverend C. K. Steele, pastor of Bethel Baptist Church.',
 'The student protest began with Wilhelmina Jakes and Carrie Patterson. Students and residents made it a citywide effort.',
 'The council called for seating on a first-come basis, courteous treatment and the hiring of Black drivers. Reverend Daniel B. Speed helped lead the campaign.',
];
const columns=[
 'The carpool helped people get to work while they stayed off the city buses. Police targeted the drivers and organizers.',
 'In October 1956, a municipal court convicted 21 people over the operation of the carpool.',
 'On October 23, Rev. C. K. Steele wrote to Martin Luther King Jr. about the convictions. He reported that the boycott was still going.',
];
const seats=[
 {label:'Before the boycott',caption:'Tallahassee required segregated seating. The driver of the bus boarded by Jakes and Patterson ordered them to leave the seats they had taken near the front.'},
 {label:'January 1957',caption:'The city repealed the explicit segregation ordinance and replaced it with driver-assigned seating.'},
 {label:'Testing the rule',caption:'Riders challenged those assignments. A petition preserved by the Library of Congress describes how police enforced the replacement ordinance.'},
 {label:'Returning to the buses',caption:'Black riders gradually returned as enforcement of assigned seating eased. Florida Memory dates integration on the buses to the summer of 1957.'},
];

function define(id,type,kind,settings,position,content={}){
 const history=BOYCOTT_PASSAGES[id];
 const actions=['screen','listening'].includes(kind)?[behavior('tap','toggle'),behavior('seek','seek')]:
  kind==='photoWall'?[behavior('photo','photo')]:kind==='newspaper'?[behavior('zoom','zoom')]:[behavior('seat','seat')];
 return {...history,id,type,importance:'supporting',content:scores(content),exhibitEditorial:true,
  reps:{text:history.body,alt:history.title,transcript:settings.transcript??''},
  exhibit:{id,kind,settings:{title:history.title,...settings},position,facing:0,behaviors:[behavior('leave','pause'),...actions]}};
}
export const EXHIBITS=[
 define('film','video','screen',{slides,transcript:slides.map(s=>s.caption).join('\n'),secondsPerSlide:7},[-2,1.4]),
 define('archive-image','image','photoWall',{photos},[1,-3]),
 define('oral-history','audio','listening',{cues,transcript:cues.join('\n'),voice:'device speech synthesis'},[-2,-1.8],{disturbing:pair(1,1),viewpoint:pair(1,1)}),
 define('sample-clipping','image','newspaper',{headline:'Police prosecute carpool organizers',columns},[3.1,1.5],{disturbing:pair(1,1),viewpoint:pair(1,1)}),
 define('bus-model','model','seatMap',{seats},[.5,-.3]),
];
for(const block of EXHIBITS)validateComponent(block.exhibit);
export const KIDS_EXHIBITS=EXHIBITS.filter(b=>['film','archive-image','bus-model'].includes(b.id));
export function addExhibits(rooms){
 const room=rooms.boycott;
 room.blocks=[...room.blocks.slice(0,3),...EXHIBITS,...room.blocks.slice(3)];
 for(const version of room.versions){
  if(version.id==='textbook'){
   version.blocks=[...version.blocks.slice(0,3),...KIDS_EXHIBITS,...version.blocks.slice(3)];
   version.layout={...version.layout,model:'none'};
  }else if(version.id==='immersive'){
   version.blocks=[...version.blocks.slice(0,3),...EXHIBITS,...version.blocks.slice(3)];
  }else version.blocks=room.blocks;
 }
 room.layout.model='none';room.layout.components=EXHIBITS.map(b=>({block:b.id,position:b.exhibit.position,facing:b.exhibit.facing}));room.layout.approach=[9.5,-3.4];room.layout.sign=['1956 · BUS BOYCOTT','FIVE SAMPLE EXHIBITS · TAP TO EXPLORE',[-.3,3.8,.5]];
 room.presentation={theme:'exhibition',accent:'#b66740',heroBlock:'archive-image',exhibitEditorial:true};
}
