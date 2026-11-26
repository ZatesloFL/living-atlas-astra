// Keep an incomplete optional representation local to its card. Do not manufacture
// authorship, declarations or permissions, and never recover the whole scene.
export function recordDetails(render){
 try{return render()||'<p class="record-thin" role="status">No displayable details are available for this record.</p>';}
 catch{return '<p class="record-thin" role="status">Limited record: these details could not be displayed. No content or access has changed.</p>';}
}
export function optionalCardFields(record){
 return {authors:(Array.isArray(record.authors)?record.authors:record.author?[record.author]:[]).filter(a=>a&&typeof a==='object'),forks:Array.isArray(record.forks)?record.forks:null};
}
